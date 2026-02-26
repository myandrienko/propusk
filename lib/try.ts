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
