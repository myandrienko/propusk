export const e = {
  try<T>(cb: () => T, wrapErr: (err: unknown) => unknown): T {
    const handleErr = (err: unknown): never => {
      throw wrapErr(err) ?? err;
    };

    try {
      const res = cb();

      if (res instanceof Promise) {
        res.catch(handleErr);
      }

      return res;
    } catch (err) {
      return handleErr(err);
    }
  },
};
