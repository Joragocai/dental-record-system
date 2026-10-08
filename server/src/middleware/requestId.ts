import crypto from "node:crypto";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RequestIdLocals {
  requestId?: string;
}

export interface RequestIdRequestLike {
  requestId?: string;
}

export interface RequestIdResponseLike {
  locals: RequestIdLocals;
  setHeader(name: string, value: string): void;
}

export type RequestIdNextFunction = (error?: unknown) => void;

export interface RequestIdMiddlewareOptions {
  createId?: () => string;
}

export function createRequestIdMiddleware(options: RequestIdMiddlewareOptions = {}) {
  const createId = options.createId ?? (() => crypto.randomUUID());

  return function assignRequestId(
    req: RequestIdRequestLike,
    res: RequestIdResponseLike,
    next: RequestIdNextFunction
  ): void {
    const requestId = createId().trim().toLowerCase();
    if (!uuidPattern.test(requestId)) {
      next(new Error("Unable to create a valid request identifier."));
      return;
    }

    req.requestId = requestId;
    res.locals.requestId = requestId;
    res.setHeader("X-Request-ID", requestId);
    next();
  };
}
