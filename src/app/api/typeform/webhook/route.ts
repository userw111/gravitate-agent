import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import crypto from "crypto";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  
  // Compute HMAC SHA256 using the secret and raw body
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBody);
  const expectedSignatureHex = hmac.digest("hex");
  
  // Some services send signatures with "sha256=" prefix, strip it if present
  const cleanSignature = signature.replace(/^sha256=/, "").trim();
  
  // Compare signatures using constant-time comparison to prevent timing attacks
  try {
    // Try direct hex comparison first (most common)
    if (cleanSignature.length === expectedSignatureHex.length) {
      return crypto.timingSafeEqual(
        Buffer.from(cleanSignature, "hex"),
        Buffer.from(expectedSignatureHex, "hex")
      );
    }
    // If lengths don't match, try as base64
    const expectedSignatureBase64 = Buffer.from(expectedSignatureHex, "hex").toString("base64");
    if (cleanSignature.length === expectedSignatureBase64.length) {
      return crypto.timingSafeEqual(
        Buffer.from(cleanSignature),
        Buffer.from(expectedSignatureBase64)
      );
    }
  } catch {
    // If comparison fails, signature is invalid
    return false;
  }
  
  return false;
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const userEmail = url.searchParams.get("user");
    if (!userEmail) {
      return NextResponse.json({ error: "Missing user parameter" }, { status: 400 });
    }

    if (!convex) {
      return NextResponse.json({ error: "Convex not configured" }, { status: 500 });
    }

    // Get raw body as text for signature verification
    const rawBody = await request.text();
    
    // Get user's webhook secret
    const config = await convex.query(api.typeform.getConfigForEmail, { email: userEmail });
    if (!config?.secret) {
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 400 });
    }

    // Verify signature
    const signature = request.headers.get("typeform-signature") || 
                      request.headers.get("x-typeform-signature") ||
                      request.headers.get("signature");
    
    if (!verifySignature(rawBody, signature, config.secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Parse JSON payload
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    // Extract event type and form ID from payload
    const payloadObj = payload as Record<string, unknown>;
    const eventType = typeof payloadObj.event_id === "string" ? payloadObj.event_id : 
                      typeof payloadObj.event_type === "string" ? payloadObj.event_type : 
                      undefined;
    const formId = typeof payloadObj.form_response === "object" && payloadObj.form_response !== null
      ? (payloadObj.form_response as Record<string, unknown>).form_id as string | undefined
      : typeof payloadObj.form_id === "string" ? payloadObj.form_id : undefined;

    // Store webhook in Convex
    await convex.mutation(api.typeform.storeWebhook, {
      email: userEmail,
      payload,
      eventType,
      formId,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Typeform webhook error:", e);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}


