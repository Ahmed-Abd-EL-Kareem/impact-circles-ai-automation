import crypto from "node:crypto";

export interface RequestLike {
  headers: {
    get(name: string): string | null;
  };
}

/**
 * Reviewer Passcode Authentication Guard
 * Server-side enforcement for human review operations: PATCH, approve, and publish.
 * If REVIEWER_PASSCODE is unset or empty, the check is skipped.
 */
export function verifyReviewerPasscode(req: RequestLike): {
  authorized: boolean;
  response?: Response;
} {
  const configuredPasscode = process.env.REVIEWER_PASSCODE;
  if (!configuredPasscode || !configuredPasscode.trim()) {
    return { authorized: true };
  }

  const providedPasscode = req.headers.get("x-reviewer-passcode") || req.headers.get("X-Reviewer-Passcode");
  if (!providedPasscode) {
    return {
      authorized: false,
      response: Response.json(
        {
          success: false,
          error: "Reviewer passcode required. Please provide the 'x-reviewer-passcode' header.",
        },
        { status: 401 }
      ),
    };
  }

  const expectedBuf = Buffer.from(configuredPasscode.trim());
  const providedBuf = Buffer.from(providedPasscode.trim());

  const isValid =
    expectedBuf.length === providedBuf.length &&
    crypto.timingSafeEqual(expectedBuf, providedBuf);

  if (!isValid) {
    return {
      authorized: false,
      response: Response.json(
        {
          success: false,
          error: "Unauthorized: Invalid reviewer passcode.",
        },
        { status: 401 }
      ),
    };
  }

  return { authorized: true };
}
