import { NextResponse } from "next/server";
import { WorkOS } from "@workos-inc/node";
import { cookies } from "next/headers";

const workos = new WorkOS(process.env.WORKOS_API_KEY);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/?error=missing_code`
    );
  }

  try {
    const auth: any = await workos.userManagement.authenticateWithCode({
      code,
      clientId: process.env.WORKOS_CLIENT_ID!,
    });

    const user = auth.user;

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
      } catch {
        return null;
      }
    }
    if (!possibleSessionId) {
      for (const t of maybeTokens) {
        const sid = decodeSidFromJwt(t);
        if (sid) {
          possibleSessionId = sid;
          break;
        }
      }
    }
    if (possibleSessionId) {
      cookieStore.set("workos_session_id", possibleSessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      });
    }

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard`
    );
  } catch (error) {
    console.error("WorkOS authentication error:", error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/?error=authentication_failed`
    );
  }
}

