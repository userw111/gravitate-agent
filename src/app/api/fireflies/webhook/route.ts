import { NextResponse } from "next/server";
import {
  convexAction,
  convexMutation,
  convexQuery,
} from "@/lib/convexHttp";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const hasConvexConfig = Boolean(
  convexUrl && process.env.CONVEX_DEPLOYMENT_TOKEN
);

// Web Crypto API compatible HMAC function for Cloudflare Workers
async function computeHMAC(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  
  // Import the key for HMAC
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  // Sign the message
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  
  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time comparison for security
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

// Hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// Base64 string to Uint8Array
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function verifySignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  
  try {
    // Compute expected signature
    const expectedSignatureHex = await computeHMAC(rawBody, secret);
    
    // Some services send signatures with "sha256=" prefix, strip it if present
    const cleanSignature = signature.replace(/^sha256=/, "").trim();
    
    // Compare signatures using constant-time comparison to prevent timing attacks
    // Try direct hex comparison first (most common)
    if (cleanSignature.length === expectedSignatureHex.length) {
      const receivedBytes = hexToBytes(cleanSignature);
      const expectedBytes = hexToBytes(expectedSignatureHex);
      return timingSafeEqual(receivedBytes, expectedBytes);
    }
    
    // If lengths don't match, try as base64
    const expectedSignatureBase64 = btoa(
      String.fromCharCode(...hexToBytes(expectedSignatureHex))
    );
    if (cleanSignature.length === expectedSignatureBase64.length) {
      const receivedBytes = base64ToBytes(cleanSignature);
      const expectedBytes = base64ToBytes(expectedSignatureBase64);
      return timingSafeEqual(receivedBytes, expectedBytes);
    }
    
    // If lengths don't match either format, signature is invalid
    return false;
  } catch {
    // If comparison fails (e.g., invalid hex/base64), signature is invalid
    return false;
  }
}

// Health check endpoint
export async function GET(request: Request) {
  return NextResponse.json({
    status: "ok",
    route: "/api/fireflies/webhook",
    convexConfigured: hasConvexConfig,
    convexUrl: convexUrl ? `${convexUrl.substring(0, 30)}...` : "not set",
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const userEmail = url.searchParams.get("user");
    
    // Log request details for debugging
    console.log("[Fireflies Webhook] POST request received", {
      url: request.url,
      hasUserEmail: !!userEmail,
      convexConfigured: hasConvexConfig,
      convexUrlSet: !!convexUrl,
    });

    if (!userEmail) {
      return NextResponse.json(
        { error: "Missing user parameter in query string" },
        { status: 400 }
      );
    }

    if (!hasConvexConfig) {
      console.error("[Fireflies Webhook] Convex HTTP API not configured");
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
      config = await convexQuery<any>("fireflies:getConfigForEmail", {
        email: userEmail,
      });
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

      const isValid = await verifySignature(rawBody, signature, config.webhookSecret);
      console.log("Signature verification result:", isValid);
      
      if (!isValid) {
        // Try computing expected signature for debugging
        const expectedHex = await computeHMAC(rawBody, config.webhookSecret);
        console.error(`Signature verification failed for user ${userEmail}`);
        console.error("Expected signature (hex):", expectedHex);
        console.error("Received signature:", signature);
        console.error("Signature length - expected:", expectedHex.length, "received:", signature?.length || 0);
        
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
      await convexMutation<any>("fireflies:storeWebhook", {
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
      convexAction<any>("firefliesActions:fetchAndStoreTranscriptById", {
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
    console.error("[Fireflies Webhook] Processing error:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      url: request.url,
    });
    return NextResponse.json(
      { 
        error: `Webhook processing failed: ${error.message}`,
        details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

