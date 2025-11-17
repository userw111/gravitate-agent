import { NextResponse } from "next/server";

const workosApiKey = process.env.WORKOS_API_KEY;
const workosClientId = process.env.WORKOS_CLIENT_ID;
const WORKOS_AUTHORIZE_URL = "https://api.workos.com/user_management/authorize";

function normalizeBaseUrl(value?: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const withProtocol =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;

  return withProtocol.replace(/\/+$/, "");
}

function deriveBaseUrlFromRequest(request: Request) {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    null;

  if (!host) {
    return null;
  }

  const protoHeader = request.headers.get("x-forwarded-proto");
  const protoGuess = protoHeader?.split(",")[0]?.trim();
  const protocol =
    protoGuess && (protoGuess === "http" || protoGuess === "https")
      ? protoGuess
      : host.includes("localhost")
        ? "http"
        : "https";

  return `${protocol}://${host}`.replace(/\/+$/, "");
}

function resolveAppUrl(request: Request) {
  const normalizedEnvUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL);
  if (normalizedEnvUrl) {
    return { url: normalizedEnvUrl, source: "env" as const };
  }

  const derived = deriveBaseUrlFromRequest(request);
  if (derived) {
    return { url: derived, source: "headers" as const };
  }

  return { url: "http://localhost:3000", source: "fallback" as const };
}

function buildAuthorizationUrl(redirectUri: string, clientId: string) {
  const url = new URL(WORKOS_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("provider", "authkit");
  url.searchParams.set("response_type", "code");
  return url;
}

export async function GET(request: Request) {
  const { url: appUrl, source: appUrlSource } = resolveAppUrl(request);

  // Extremely verbose logging to debug "Invalid client ID" issues
  console.log("[AUTH/SIGN-IN] Bootstrapping WorkOS client", {
    hasWorkosApiKey: !!workosApiKey,
    workosApiKeyLength: workosApiKey?.length ?? 0,
    workosClientId,
    hasWorkosClientId: !!workosClientId,
    nodeEnv: process.env.NODE_ENV,
    appUrl,
    appUrlSource,
    timestamp: new Date().toISOString(),
  });

  console.log("[AUTH/SIGN-IN] GET /api/auth/sign-in invoked", {
    url: "/api/auth/sign-in",
    method: "GET",
    workosClientId,
    hasWorkosClientId: !!workosClientId,
    hasWorkosApiKey: !!workosApiKey,
    appUrl,
    appUrlSource,
    envSnapshot: {
      WORKOS_CLIENT_ID: workosClientId,
      HAS_WORKOS_API_KEY: !!workosApiKey,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    },
    timestamp: new Date().toISOString(),
  });

  if (!workosApiKey || !workosClientId) {
    console.error("[AUTH/SIGN-IN] Missing WorkOS configuration", {
      hasWorkosApiKey: !!workosApiKey,
      hasWorkosClientId: !!workosClientId,
      envKeysPresent: Object.keys(process.env).filter((k) =>
        k.toUpperCase().includes("WORKOS")
      ),
      timestamp: new Date().toISOString(),
    });

    // During build (and in environments without WorkOS configured),
    // respond with a harmless JSON payload instead of throwing.
    return NextResponse.json(
      {
        error: "workos_not_configured",
        message:
          "WorkOS SSO is not configured. Set WORKOS_API_KEY and WORKOS_CLIENT_ID to enable sign-in.",
      },
      { status: 200 }
    );
  }

  try {
    const redirectUri = `${appUrl}/api/auth/callback`;

    console.log("[AUTH/SIGN-IN] Building WorkOS authorization URL", {
      provider: "authkit",
      redirectUri,
      clientId: workosClientId,
    });

    const authorizationUrl = buildAuthorizationUrl(redirectUri, workosClientId);

    console.log("[AUTH/SIGN-IN] Received authorization URL from WorkOS", {
      authorizationUrl: authorizationUrl.toString(),
      parsed: (() => {
        try {
          const u = new URL(authorizationUrl);
          return {
            origin: u.origin,
            pathname: u.pathname,
            searchParams: Object.fromEntries(u.searchParams.entries()),
          };
        } catch (e) {
          return { parseError: (e as Error)?.message ?? String(e) };
        }
      })(),
    });

    // Force re-authentication to ensure the hosted sign-in screen appears
    const url = new URL(authorizationUrl);
    url.searchParams.set("prompt", "select_account login");
    url.searchParams.set("max_age", "0");

    console.log("[AUTH/SIGN-IN] Final redirect URL", {
      redirectTo: url.toString(),
      redirectUri,
      searchParams: Object.fromEntries(url.searchParams.entries()),
    });

    return NextResponse.redirect(url.toString());
  } catch (error) {
    const err = error as any;
    console.error("[AUTH/SIGN-IN] Error while generating WorkOS authorization URL", {
      message: err?.message,
      name: err?.name,
      stack: err?.stack,
      code: err?.code,
      raw: err,
      workosClientId,
      hasWorkosClientId: !!workosClientId,
      appUrl,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        error: "workos_authorization_url_failed",
        details: {
          message: err?.message ?? "Unknown error",
          name: err?.name,
          code: err?.code,
        },
      },
      { status: 500 }
    );
  }
}

