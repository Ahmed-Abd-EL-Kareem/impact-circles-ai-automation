export interface RequestLike {
  headers: {
    get(name: string): string | null;
  };
  nextUrl?: {
    origin?: string;
  };
}

export function getSandboxBaseUrl(req?: RequestLike): string {
  if (process.env.SANDBOX_BASE_URL) {
    return process.env.SANDBOX_BASE_URL.replace(/\/+$/, "");
  }
  if (req?.nextUrl?.origin && req.nextUrl.origin !== "null") {
    return req.nextUrl.origin;
  }
  return "http://localhost:3000";
}

export function verifySandboxAuth(req: RequestLike): { authorized: boolean; error?: string } {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  const expectedKey = process.env.SANDBOX_API_KEY || "sandbox_demo_secret_key";

  if (!authHeader) {
    return { authorized: false, error: "Missing Authorization header. Expected Bearer token." };
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return { authorized: false, error: "Invalid Authorization format. Expected: Bearer <SANDBOX_API_KEY>" };
  }

  if (token !== expectedKey) {
    return { authorized: false, error: "Unauthorized: Invalid sandbox API key." };
  }

  return { authorized: true };
}

export function shouldFailChannel(channel: "website" | "linkedin" | "newsletter"): boolean {
  const failList = (process.env.SANDBOX_FAIL_CHANNELS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return failList.includes(channel.toLowerCase());
}
