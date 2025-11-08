import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { WorkOS } from "@workos-inc/node";

const workos = new WorkOS(process.env.WORKOS_API_KEY);

export async function GET() {
  const cookieStore = await cookies();

  const sessionId = cookieStore.get("workos_session_id")?.value;

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

  const logoutRedirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/?signed_out=true`;

  // If we have a WorkOS session, redirect to WorkOS to terminate the IdP session too
  if (sessionId) {
    try {
      const url = workos.userManagement.getLogoutUrl({
        sessionId,
        returnTo: logoutRedirectUri,
      });
      const response = NextResponse.redirect(url, { status: 302 });
      response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      response.headers.set("Pragma", "no-cache");
      response.headers.set("Expires", "0");
      return response;
    } catch (e) {
      // Fall back to local redirect if SDK method fails
    }
  }

  // Fallback: redirect home after clearing local cookies
  const response = NextResponse.redirect(logoutRedirectUri, { status: 302 });
  response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

