import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/settings?error=unauthorized`
      );
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const state = searchParams.get("state");

    if (error) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/settings?error=oauth_cancelled`
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/settings?error=missing_code`
      );
    }

    // Verify state parameter
    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, "base64").toString());
        if (stateData.email !== user.email) {
          return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/settings?error=invalid_state`
          );
        }
      } catch {
        return NextResponse.redirect(
          `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/settings?error=invalid_state`
        );
      }
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/google-drive/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/settings?error=oauth_not_configured`
      );
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      let errorJson: any = {};
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        // Not JSON, use text as-is
      }
      console.error("[Google Drive OAuth] Token exchange failed:", {
        status: tokenResponse.status,
        error: errorText,
        redirectUri,
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
      });
      
      // Provide more specific error message
      let errorParam = "token_exchange_failed";
      if (errorJson.error === "invalid_client") {
        errorParam = "invalid_client_credentials";
      } else if (errorJson.error === "redirect_uri_mismatch") {
        errorParam = "redirect_uri_mismatch";
      }
      
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/settings?error=${errorParam}`
      );
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    // Get user info
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    let userEmail: string | undefined;
    let userName: string | undefined;

    if (userInfoResponse.ok) {
      const userInfo = (await userInfoResponse.json()) as {
        email?: string;
        name?: string;
      };
      userEmail = userInfo.email;
      userName = userInfo.name;
    }

    // Store tokens in Convex
    if (!convex) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/settings?error=convex_not_configured`
      );
    }

    const tokenExpiry = Date.now() + (tokenData.expires_in * 1000);

    // Get or create organization for user
    const organizationId = await convex.mutation(api.organizations.getOrCreateDefaultOrganization, {
      email: user.email,
    });

    // Store tokens at organization level
    await convex.mutation(api.googleDrive.setTokensForOrganization, {
      organizationId,
      connectedByEmail: user.email,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || "",
      tokenExpiry,
      userEmail,
      userName,
    });

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/settings?success=google_drive_connected`
    );
  } catch (error) {
    console.error("[Google Drive OAuth] Error:", error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/settings?error=oauth_error`
    );
  }
}

