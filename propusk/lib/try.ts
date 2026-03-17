function etry<T>(
  cb: () => Promise<T>,
  wrapErr: (err: unknown) => unknown,
): Promise<T>;
function etry<T>(cb: () => T, wrapErr: (err: unknown) => unknown): T;
function etry(cb: () => unknown, wrapErr: (err: unknown) => unknown) {
  const handleErr = (err: unknown): never => {
    throw wrapErr(err) ?? err;
  };

  try {
    const res = cb();
    return res instanceof Promise ? res.catch(handleErr) : res;
  } catch (err) {
    return handleErr(err);
  }
}

export const e = { try: etry };
