import assert from "node:assert/strict";
import test from "node:test";
import { createRequestIdMiddleware } from "../middleware/requestId.js";

const requestId = "11111111-1111-4111-8111-111111111111";

test("request ID middleware generates a trusted UUID and returns X-Request-ID", () => {
  const req: { requestId?: string } = {};
  const headers = new Map<string, string>();
  const res = {
    locals: {} as { requestId?: string },
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    }
  };
  let nextValue: unknown = Symbol("not-called");

  createRequestIdMiddleware({ createId: () => requestId.toUpperCase() })(
    req,
    res,
    (error?: unknown) => { nextValue = error; }
  );

  assert.equal(nextValue, undefined);
  assert.equal(req.requestId, requestId);
  assert.equal(res.locals.requestId, requestId);
  assert.equal(headers.get("x-request-id"), requestId);
});

test("request ID middleware rejects invalid generated identifiers instead of trusting them", () => {
  const req: { requestId?: string } = {};
  const res = {
    locals: {} as { requestId?: string },
    setHeader() {}
  };
  let nextValue: unknown;

  createRequestIdMiddleware({ createId: () => "not-a-uuid" })(
    req,
    res,
    (error?: unknown) => { nextValue = error; }
  );

  assert.ok(nextValue instanceof Error);
  assert.equal(req.requestId, undefined);
  assert.equal(res.locals.requestId, undefined);
});
