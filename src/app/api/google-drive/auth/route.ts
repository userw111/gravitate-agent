import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/google-drive/callback`;

  if (!clientId) {
    return NextResponse.json({ error: "Google OAuth not configured" }, { status: 500 });
  }

  // Generate state parameter for CSRF protection
  const state = Buffer.from(JSON.stringify({ email: user.email, timestamp: Date.now() })).toString("base64");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
    access_type: "offline",
    prompt: "consent",
    state: state,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  // Return redirect response - NextResponse.redirect() sets Location header automatically
  // Explicitly set status 302 to avoid any ambiguity
  return NextResponse.redirect(authUrl, { status: 302 });
}

