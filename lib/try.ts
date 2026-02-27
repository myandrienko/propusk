export interface Catchable<T> {
  catch(wrapErr: (err: unknown) => unknown): T;
}

export function etry<T>(cb: () => T): Catchable<T> {
  return {
    catch(wrapErr) {
      try {
        return cb();
      } catch (err) {
        throw wrapErr(err) ?? err;
      }
    },
  };
}

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
      handleErr(err);
    }
  },
};
