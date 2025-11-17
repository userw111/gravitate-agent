import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const workosApiKey = process.env.WORKOS_API_KEY;
const workosClientId = process.env.WORKOS_CLIENT_ID;
const WORKOS_AUTHENTICATE_URL =
  "https://api.workos.com/user_management/authenticate";

// Normalize the app URL so it always includes a scheme.
// Cloudflare currently sets NEXT_PUBLIC_APP_URL to "gravitate.ultralistic.com",
// which would otherwise produce malformed URLs like "gravitate.ultralistic.com/dashboard".
const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const appUrl =
  rawAppUrl && rawAppUrl.length > 0
    ? rawAppUrl.startsWith("http://") || rawAppUrl.startsWith("https://")
      ? rawAppUrl
      : `https://${rawAppUrl}`
    : "http://localhost:3000";

type WorkOSSessionLike = {
  id?: string;
  access_token?: string;
  accessToken?: string;
  [key: string]: unknown;
};

type WorkOSAuthenticationPayload = {
  user_session?: WorkOSSessionLike | null;
  userSession?: WorkOSSessionLike | null;
  session?: WorkOSSessionLike | null;
  access_token?: string;
  accessToken?: string;
  [key: string]: unknown;
};

type WorkOSAuthResponse = {
  user: {
    id: string;
    email: string;
    session?: WorkOSSessionLike | null;
    sessionId?: string | null;
    [key: string]: unknown;
  };
  authentication?: WorkOSAuthenticationPayload | null;
  accessToken?: string;
  session?: WorkOSSessionLike | null;
  sessionId?: string | null;
  userSession?: WorkOSSessionLike | null;
  [key: string]: unknown;
};

async function authenticateWithCode(
  code: string,
  redirectUri: string,
) {
  if (!workosApiKey || !workosClientId) {
    throw new Error("WorkOS credentials are not configured");
  }

  const response = await fetch(WORKOS_AUTHENTICATE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: workosClientId,
      client_secret: workosApiKey,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `[WorkOS] Failed to authenticate with code. Status ${response.status}: ${errorText}`,
    );
  }

  return (await response.json()) as WorkOSAuthResponse;
}

export async function GET(request: Request) {
  console.log("[AUTH/CALLBACK] Bootstrapping WorkOS client", {
    hasWorkosApiKey: !!workosApiKey,
    workosApiKeyLength: workosApiKey?.length ?? 0,
    workosClientId,
    hasWorkosClientId: !!workosClientId,
    nodeEnv: process.env.NODE_ENV,
    appUrl,
    timestamp: new Date().toISOString(),
  });

  console.log("[AUTH/CALLBACK] GET /api/auth/callback invoked", {
    url: request.url,
    method: "GET",
    headers: {
      host: (request as any)?.headers?.get?.("host"),
      userAgent: (request as any)?.headers?.get?.("user-agent"),
      xForwardedHost: (request as any)?.headers?.get?.("x-forwarded-host"),
      xForwardedProto: (request as any)?.headers?.get?.("x-forwarded-proto"),
    },
    workosClientId,
    hasWorkosClientId: !!workosClientId,
    hasWorkosApiKey: !!workosApiKey,
    timestamp: new Date().toISOString(),
  });

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  console.log("[AUTH/CALLBACK] Parsed query params", {
    codePresent: !!code,
    fullQuery: Object.fromEntries(searchParams.entries()),
  });

  if (!code) {
    console.error("[AUTH/CALLBACK] Missing `code` query parameter", {
      redirectTo: `${appUrl}/?error=missing_code`,
    });
    return NextResponse.redirect(`${appUrl}/?error=missing_code`);
  }

  if (!workosApiKey || !workosClientId) {
    console.error("[AUTH/CALLBACK] Missing WorkOS configuration", {
      hasWorkosApiKey: !!workosApiKey,
      hasWorkosClientId: !!workosClientId,
      envKeysPresent: Object.keys(process.env).filter((k) =>
        k.toUpperCase().includes("WORKOS")
      ),
    });

    // During build or when misconfigured, just send user to home with an error flag.
    return NextResponse.redirect(`${appUrl}/?error=workos_not_configured`);
  }

  try {
    const redirectUri = `${appUrl}/api/auth/callback`;

    console.log("[AUTH/CALLBACK] Calling WorkOS authenticate endpoint via fetch", {
      codeSnippet: code.substring(0, 10) + "...",
      workosClientId,
      redirectUri,
    });

    const auth = await authenticateWithCode(code, redirectUri);

    console.log("[AUTH/CALLBACK] WorkOS authenticateWithCode response (truncated)", {
      topLevelKeys: Object.keys(auth || {}),
      authenticationKeys: Object.keys(auth?.authentication || {}),
      userKeys: Object.keys(auth?.user || {}),
    });

    const user = auth.user;

    console.log("[AUTH/CALLBACK] Resolved WorkOS user", {
      id: user?.id,
      email: user?.email,
      userObjectType: typeof user,
    });

    // Set session cookie
    const cookieStore = await cookies();
    cookieStore.set("workos_user_id", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    cookieStore.set("workos_user_email", user.email, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    console.log("[AUTH/CALLBACK] workos_user_id and workos_user_email cookies set");

    // Organization creation is now handled in the dashboard load sequence.
    // This edge route intentionally avoids Convex client calls to stay compatible with Cloudflare Workers.

    // Capture WorkOS user session ID for federated logout if present in response.
    // Try multiple known shapes to be robust across SDK versions.
    let possibleSessionId =
      auth?.authentication?.user_session?.id ||
      auth?.authentication?.userSession?.id ||
      auth?.authentication?.session?.id ||
      auth?.userSession?.id ||
      auth?.session?.id ||
      auth?.sessionId ||
      auth?.user?.session?.id ||
      auth?.user?.sessionId;
    // Fallback: decode JWT access token to extract `sid` claim
    const maybeTokens: Array<string | undefined> = [
      auth?.accessToken,
      auth?.authentication?.access_token,
      auth?.authentication?.accessToken,
      auth?.userSession?.access_token,
      auth?.userSession?.accessToken,
      auth?.session?.access_token,
      auth?.session?.accessToken,
    ];
    function decodeSidFromJwt(token: string | undefined): string | null {
      if (!token || typeof token !== "string") return null;
      const parts = token.split(".");
      if (parts.length < 2) return null;
      try {
        const payload = parts[1]
          .replace(/-/g, "+")
          .replace(/_/g, "/")
          .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
        const json = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
        return json?.sid || json?.session_id || null;
      } catch (e) {
        console.warn("[AUTH/CALLBACK] Failed to decode JWT while looking for sid", {
          message: (e as Error)?.message ?? String(e),
        });
        return null;
      }
    }
    if (!possibleSessionId) {
      console.log("[AUTH/CALLBACK] No explicit session id found, trying JWT tokens");
      for (const t of maybeTokens) {
        const sid = decodeSidFromJwt(t);
        if (sid) {
          possibleSessionId = sid;
          break;
        }
      }
    }
    if (possibleSessionId) {
      console.log("[AUTH/CALLBACK] Resolved WorkOS session id", {
        possibleSessionId,
      });
      cookieStore.set("workos_session_id", possibleSessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      });
    } else {
      console.warn("[AUTH/CALLBACK] Unable to resolve WorkOS session id from auth payload");
    }

    const redirectTo = `${appUrl}/dashboard`;
    console.log("[AUTH/CALLBACK] Redirecting to dashboard", { redirectTo });

    return NextResponse.redirect(redirectTo);
  } catch (error) {
    const err = error as any;
    console.error("[AUTH/CALLBACK] WorkOS authentication error", {
      message: err?.message,
      name: err?.name,
      stack: err?.stack,
      code: err?.code,
      raw: err,
      workosClientId,
      hasWorkosClientId: !!workosClientId,
      timestamp: new Date().toISOString(),
    });

    const redirectTo = `${appUrl}/?error=authentication_failed`;
    console.error("[AUTH/CALLBACK] Redirecting due to authentication failure", {
      redirectTo,
    });

    return NextResponse.redirect(redirectTo);
  }
}

