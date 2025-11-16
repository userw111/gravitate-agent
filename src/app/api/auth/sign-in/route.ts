import { NextResponse } from "next/server";
import { WorkOS } from "@workos-inc/node";

const workosApiKey = process.env.WORKOS_API_KEY;
const workosClientId = process.env.WORKOS_CLIENT_ID;

// Normalize the app URL so it always includes a scheme.
// In Cloudflare, NEXT_PUBLIC_APP_URL is currently set to "gravitate.ultralistic.com"
// which would produce an invalid redirect_uri without "https://".
const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const appUrl =
  rawAppUrl && rawAppUrl.length > 0
    ? rawAppUrl.startsWith("http://") || rawAppUrl.startsWith("https://")
      ? rawAppUrl
      : `https://${rawAppUrl}`
    : "http://localhost:3000";

export async function GET() {
  // Extremely verbose logging to debug "Invalid client ID" issues
  console.log("[AUTH/SIGN-IN] Bootstrapping WorkOS client", {
    hasWorkosApiKey: !!workosApiKey,
    workosApiKeyLength: workosApiKey?.length ?? 0,
    workosClientId,
    hasWorkosClientId: !!workosClientId,
    nodeEnv: process.env.NODE_ENV,
    appUrl,
    timestamp: new Date().toISOString(),
  });

  console.log("[AUTH/SIGN-IN] GET /api/auth/sign-in invoked", {
    url: "/api/auth/sign-in",
    method: "GET",
    workosClientId,
    hasWorkosClientId: !!workosClientId,
    hasWorkosApiKey: !!workosApiKey,
    appUrl,
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
    const workos = new WorkOS(workosApiKey);

    console.log("[AUTH/SIGN-IN] Calling workos.userManagement.getAuthorizationUrl", {
      provider: "authkit",
      redirectUri: `${appUrl}/api/auth/callback`,
      clientId: workosClientId,
    });

    const authorizationUrl = workos.userManagement.getAuthorizationUrl({
      provider: "authkit",
      redirectUri: `${appUrl}/api/auth/callback`,
      clientId: workosClientId!,
    });

    console.log("[AUTH/SIGN-IN] Received authorization URL from WorkOS", {
      authorizationUrl,
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
    url.searchParams.set("prompt", "login");
    url.searchParams.set("max_age", "0");
    // Encourage IdP account chooser when supported
    url.searchParams.set("prompt", "select_account login");

    console.log("[AUTH/SIGN-IN] Final redirect URL", {
      redirectTo: url.toString(),
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

