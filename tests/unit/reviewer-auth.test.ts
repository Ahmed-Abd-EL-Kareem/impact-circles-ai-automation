import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { verifyReviewerPasscode } from "../../src/lib/services/reviewer-auth.ts";

describe("Phase 3: Reviewer Passcode Authentication Guard", () => {
  const originalPasscode = process.env.REVIEWER_PASSCODE;

  beforeEach(() => {
    delete process.env.REVIEWER_PASSCODE;
  });

  afterEach(() => {
    if (originalPasscode !== undefined) {
      process.env.REVIEWER_PASSCODE = originalPasscode;
    } else {
      delete process.env.REVIEWER_PASSCODE;
    }
  });

  it("permits requests when REVIEWER_PASSCODE is unset (demo mode)", () => {
    delete process.env.REVIEWER_PASSCODE;
    const req = {
      headers: {
        get: () => null,
      },
    };

    const result = verifyReviewerPasscode(req);
    assert.strictEqual(result.authorized, true);
    assert.strictEqual(result.response, undefined);
  });

  it("permits requests when REVIEWER_PASSCODE is empty whitespace", () => {
    process.env.REVIEWER_PASSCODE = "   ";
    const req = {
      headers: {
        get: () => null,
      },
    };

    const result = verifyReviewerPasscode(req);
    assert.strictEqual(result.authorized, true);
  });

  it("rejects requests when passcode is set but header is missing", () => {
    process.env.REVIEWER_PASSCODE = "secret123";
    const req = {
      headers: {
        get: () => null,
      },
    };

    const result = verifyReviewerPasscode(req);
    assert.strictEqual(result.authorized, false);
    assert.ok(result.response);
    assert.strictEqual(result.response.status, 401);
  });

  it("rejects requests with incorrect passcode", () => {
    process.env.REVIEWER_PASSCODE = "secret123";
    const req = {
      headers: {
        get: (name: string) => (name.toLowerCase() === "x-reviewer-passcode" ? "wrong-passcode" : null),
      },
    };

    const result = verifyReviewerPasscode(req);
    assert.strictEqual(result.authorized, false);
    assert.ok(result.response);
    assert.strictEqual(result.response.status, 401);
  });

  it("rejects requests with passcode of different length (timing-safe check guard)", () => {
    process.env.REVIEWER_PASSCODE = "secret123";
    const req = {
      headers: {
        get: (name: string) => (name.toLowerCase() === "x-reviewer-passcode" ? "sec" : null),
      },
    };

    const result = verifyReviewerPasscode(req);
    assert.strictEqual(result.authorized, false);
    assert.ok(result.response);
    assert.strictEqual(result.response.status, 401);
  });

  it("accepts requests with exact matching passcode", () => {
    process.env.REVIEWER_PASSCODE = "secret123";
    const req = {
      headers: {
        get: (name: string) => (name.toLowerCase() === "x-reviewer-passcode" ? "secret123" : null),
      },
    };

    const result = verifyReviewerPasscode(req);
    assert.strictEqual(result.authorized, true);
    assert.strictEqual(result.response, undefined);
  });

  it("accepts requests with header case variation (X-Reviewer-Passcode)", () => {
    process.env.REVIEWER_PASSCODE = "secret123";
    const req = {
      headers: {
        get: (name: string) => (name === "X-Reviewer-Passcode" ? "secret123" : null),
      },
    };

    const result = verifyReviewerPasscode(req);
    assert.strictEqual(result.authorized, true);
  });
});
