import { NextResponse } from "next/server";
import { WorkOS } from "@workos-inc/node";

const workos = new WorkOS(process.env.WORKOS_API_KEY);

export async function GET() {
  const authorizationUrl = workos.userManagement.getAuthorizationUrl({
    provider: "authkit",
    redirectUri: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/callback`,
    clientId: process.env.WORKOS_CLIENT_ID!,
  });

  // Force re-authentication to ensure the hosted sign-in screen appears
  const url = new URL(authorizationUrl);
  url.searchParams.set("prompt", "login");
  url.searchParams.set("max_age", "0");
  // Encourage IdP account chooser when supported
  url.searchParams.set("prompt", "select_account login");

  return NextResponse.redirect(url.toString());
}

