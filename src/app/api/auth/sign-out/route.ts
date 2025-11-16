import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { WorkOS } from "@workos-inc/node";

const workosApiKey = process.env.WORKOS_API_KEY;
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET() {
  console.log("[AUTH/SIGN-OUT] Bootstrapping WorkOS client", {
    hasWorkosApiKey: !!workosApiKey,
    workosApiKeyLength: workosApiKey?.length ?? 0,
    nodeEnv: process.env.NODE_ENV,
    appUrl,
    timestamp: new Date().toISOString(),
  });

  console.log("[AUTH/SIGN-OUT] GET /api/auth/sign-out invoked", {
    appUrl,
    timestamp: new Date().toISOString(),
  });

  const cookieStore = await cookies();

  const sessionId = cookieStore.get("workos_session_id")?.value;

  console.log("[AUTH/SIGN-OUT] Current WorkOS-related cookies before clearing", {
    workos_user_id: cookieStore.get("workos_user_id")?.value,
    workos_user_email: cookieStore.get("workos_user_email")?.value,
    workos_session_id: sessionId,
  });

  // Clear local cookies
  cookieStore.delete("workos_user_id");
  cookieStore.delete("workos_user_email");
  cookieStore.delete("workos_session_id");

  // Also set to empty string with expired maxAge as backup
  for (const name of [
    "workos_user_id",
    "workos_user_email",
    "workos_session_id",
  ]) {
    cookieStore.set(name, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
  }

  console.log("[AUTH/SIGN-OUT] Cleared WorkOS cookies");

  const logoutRedirectUri = `${appUrl}/?signed_out=true`;

  // If we have a WorkOS session, redirect to WorkOS to terminate the IdP session too
  if (sessionId && workosApiKey) {
    console.log("[AUTH/SIGN-OUT] WorkOS session id found, requesting logout URL", {
      sessionId,
      logoutRedirectUri,
    });
    try {
      const workos = new WorkOS(workosApiKey);
      const url = workos.userManagement.getLogoutUrl({
        sessionId,
        returnTo: logoutRedirectUri,
      });
      console.log("[AUTH/SIGN-OUT] WorkOS logout URL generated", { url });
      const response = NextResponse.redirect(url, { status: 302 });
      response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      response.headers.set("Pragma", "no-cache");
      response.headers.set("Expires", "0");
      return response;
    } catch (e) {
      console.error("[AUTH/SIGN-OUT] Error generating WorkOS logout URL", {
        message: (e as any)?.message,
        name: (e as any)?.name,
        stack: (e as any)?.stack,
      });
      // Fall back to local redirect if SDK method fails
    }
  } else {
    console.log("[AUTH/SIGN-OUT] No WorkOS session id cookie present, skipping WorkOS logout");
  }

  // Fallback: redirect home after clearing local cookies
  const response = NextResponse.redirect(logoutRedirectUri, { status: 302 });
  response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

