import { ConflictError, NotFoundError, UnauthorizedError } from "./errors.ts";

export function api<T extends (req: Request) => Promise<Response>>(
  handler: T,
): T {
  return async function wrappedHandler(request) {
    try {
      return await handler(request);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown server error";
      let status = 500;

      switch (true) {
        case err instanceof NotFoundError:
          status = 404;
          break;

        case err instanceof UnauthorizedError:
          status = 401;
          break;

        case err instanceof ConflictError:
          status = 409;
          break;
      }

      return new Response(message, { status });
    }
  } as T;
}
