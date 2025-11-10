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
        Buffer.from(cleanSignature, "base64"),
        Buffer.from(expectedSignatureBase64, "base64")
      );
    }
    // If lengths don't match either format, signature is invalid
    return false;
  } catch {
    // If comparison fails (e.g., invalid hex/base64), signature is invalid
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const userEmail = url.searchParams.get("user");
    if (!userEmail) {
      return NextResponse.json(
        { error: "Missing user parameter in query string" },
        { status: 400 }
      );
    }

    if (!convex) {
      console.error("Convex client not initialized: NEXT_PUBLIC_CONVEX_URL is missing");
      return NextResponse.json(
        { error: "Server configuration error: Convex not configured" },
        { status: 500 }
      );
    }

    // Get raw body as text for signature verification
    const rawBody = await request.text();
    
    if (!rawBody || rawBody.length === 0) {
      return NextResponse.json(
        { error: "Empty request body" },
        { status: 400 }
      );
    }

    // Get user's webhook secret
    let config;
    try {
      config = await convex.query(api.fireflies.getConfigForEmail, { email: userEmail });
    } catch (error) {
      console.error(`Failed to fetch config for user ${userEmail}:`, error);
      return NextResponse.json(
        { error: "Failed to retrieve webhook configuration" },
        { status: 500 }
      );
    }

    // Verify signature if secret is configured
    if (config?.webhookSecret) {
      // Log all headers for debugging
      const allHeaders: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        allHeaders[key] = value;
      });
      console.log("Fireflies webhook headers:", JSON.stringify(allHeaders, null, 2));
      
      // Fireflies uses x-hub-signature header with sha256= prefix
      const signature = request.headers.get("x-hub-signature") ||
                        request.headers.get("x-fireflies-signature") || 
                        request.headers.get("fireflies-signature") ||
                        request.headers.get("x-signature") ||
                        request.headers.get("signature") ||
                        request.headers.get("x-webhook-signature");
      
      console.log("Found signature header:", signature ? "yes" : "no");
      console.log("Signature value:", signature ? signature.substring(0, 20) + "..." : "none");
      console.log("Raw body length:", rawBody.length);
      console.log("Raw body preview:", rawBody.substring(0, 200));
      
      if (!signature) {
        console.error("Missing signature header. Available headers:", Object.keys(allHeaders));
        return NextResponse.json(
          { error: "Missing signature header. Expected signature header from Fireflies." },
          { status: 401 }
        );
      }

      const isValid = verifySignature(rawBody, signature, config.webhookSecret);
      console.log("Signature verification result:", isValid);
      
      if (!isValid) {
        // Try computing expected signature for debugging
        const hmac = crypto.createHmac("sha256", config.webhookSecret);
        hmac.update(rawBody);
        const expectedHex = hmac.digest("hex");
        console.error(`Signature verification failed for user ${userEmail}`);
        console.error("Expected signature (hex):", expectedHex);
        console.error("Received signature:", signature);
        console.error("Signature length - expected:", expectedHex.length, "received:", signature.length);
        
        return NextResponse.json(
          { error: "Invalid webhook signature. Signature verification failed." },
          { status: 401 }
        );
      }
    } else {
      console.log("No webhook secret configured - skipping signature verification");
    }

    // Parse JSON payload
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseError) {
      console.error("Failed to parse webhook payload as JSON:", parseError);
      return NextResponse.json(
        { error: "Invalid JSON payload. Failed to parse request body." },
        { status: 400 }
      );
    }

    // Extract event type and meeting ID from payload
    // According to Fireflies docs: webhook only contains meetingId, eventType, and optional clientReferenceId
    // The transcript data is NOT in the webhook - we need to fetch it from the API
    const payloadObj = payload as Record<string, unknown>;
    const eventType = typeof payloadObj.eventType === "string" ? payloadObj.eventType :
                      typeof payloadObj.event === "string" ? payloadObj.event :
                      typeof payloadObj.type === "string" ? payloadObj.type :
                      undefined;
    
    const meetingId = typeof payloadObj.meetingId === "string" ? payloadObj.meetingId :
                      typeof payloadObj.meeting_id === "string" ? payloadObj.meeting_id :
                      undefined;
    
    if (!meetingId) {
      return NextResponse.json(
        { error: "Missing meetingId in webhook payload" },
        { status: 400 }
      );
    }

    // Store webhook notification first (without transcript data)
    try {
      await convex.mutation(api.fireflies.storeWebhook, {
        email: userEmail,
        payload,
        eventType,
        meetingId: meetingId,
        transcriptId: meetingId, // meetingId and transcriptId are the same in Fireflies
      });
    } catch (storageError) {
      console.error(`Failed to store webhook for user ${userEmail}:`, storageError);
      return NextResponse.json(
        { error: "Failed to store webhook payload in database" },
        { status: 500 }
      );
    }

    // Now fetch the actual transcript data from Fireflies API and process linking
    // This happens asynchronously - we return success immediately and fetch in background
    if (eventType === "Transcription completed" || eventType === "transcription.completed") {
      // Fetch and store transcript (this handles auto-linking via participant emails)
      convex.action(api.firefliesActions.fetchAndStoreTranscriptById, {
        email: userEmail,
        meetingId: meetingId,
      })
        .then(async () => {
          // After storing, try AI linking if auto-linking didn't work
          // This runs in Next.js so it can use Next.js environment variables
          try {
            const linkingResponse = await fetch(
              `${process.env.NEXT_PUBLIC_APP_URL || request.url.split('/api')[0]}/api/fireflies/process-linking`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  email: userEmail,
                  transcriptId: meetingId,
                }),
              }
            );
            if (!linkingResponse.ok) {
              console.error(`AI linking failed for transcript ${meetingId}:`, await linkingResponse.text());
            }
          } catch (linkingError) {
            console.error(`Failed to process AI linking for transcript ${meetingId}:`, linkingError);
          }
        })
        .catch((error) => {
          console.error(`Failed to fetch transcript ${meetingId} for user ${userEmail}:`, error);
          // Don't fail the webhook - we've already stored the notification
        });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error("Fireflies webhook processing error:", error);
    return NextResponse.json(
      { error: `Webhook processing failed: ${error.message}` },
      { status: 500 }
    );
  }
}

