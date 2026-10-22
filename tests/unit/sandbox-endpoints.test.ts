import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import {
  verifySandboxAuth,
  shouldFailChannel,
  getSandboxBaseUrl,
} from "../../src/lib/services/sandbox-auth.ts";

describe("Phase 1: Sandbox Platform Authentication & Failure Simulation", () => {
  beforeEach(() => {
    process.env.SANDBOX_API_KEY = "test_sandbox_secret";
    delete process.env.SANDBOX_FAIL_CHANNELS;
  });

  it("rejects requests missing an Authorization header", () => {
    const mockReq = {
      headers: {
        get: (_name: string) => null,
      },
    };

    const result = verifySandboxAuth(mockReq);
    assert.strictEqual(result.authorized, false);
    assert.ok(result.error?.includes("Missing Authorization header"));
  });

  it("rejects non-Bearer authorization format", () => {
    const mockReq = {
      headers: {
        get: (name: string) => (name.toLowerCase() === "authorization" ? "Basic dXNlcjpwYXNz" : null),
      },
    };

    const result = verifySandboxAuth(mockReq);
    assert.strictEqual(result.authorized, false);
    assert.ok(result.error?.includes("Invalid Authorization format"));
  });

  it("rejects mismatched sandbox API key with 401 message", () => {
    const mockReq = {
      headers: {
        get: (name: string) => (name.toLowerCase() === "authorization" ? "Bearer wrong_secret" : null),
      },
    };

    const result = verifySandboxAuth(mockReq);
    assert.strictEqual(result.authorized, false);
    assert.ok(result.error?.includes("Unauthorized: Invalid sandbox API key"));
  });

  it("authorizes requests with the correct Bearer token", () => {
    const mockReq = {
      headers: {
        get: (name: string) => (name.toLowerCase() === "authorization" ? "Bearer test_sandbox_secret" : null),
      },
    };

    const result = verifySandboxAuth(mockReq);
    assert.strictEqual(result.authorized, true);
    assert.strictEqual(result.error, undefined);
  });

  it("simulates channel failure when channel is in SANDBOX_FAIL_CHANNELS", () => {
    process.env.SANDBOX_FAIL_CHANNELS = "linkedin,newsletter";

    assert.strictEqual(shouldFailChannel("linkedin"), true);
    assert.strictEqual(shouldFailChannel("newsletter"), true);
    assert.strictEqual(shouldFailChannel("website"), false);
  });

  it("resolves base URL correctly with or without request", () => {
    process.env.SANDBOX_BASE_URL = "https://sandbox.impactcircles.internal/";
    assert.strictEqual(getSandboxBaseUrl(), "https://sandbox.impactcircles.internal");

    delete process.env.SANDBOX_BASE_URL;
    assert.strictEqual(getSandboxBaseUrl(), "http://localhost:3000");

    const reqWithOrigin = {
      headers: { get: () => null },
      nextUrl: { origin: "https://demo.impactcircles.org" },
    };
    assert.strictEqual(getSandboxBaseUrl(reqWithOrigin), "https://demo.impactcircles.org");
  });
});
