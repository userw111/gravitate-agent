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
    route: "/api/typeform/webhook",
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
    console.log("[Typeform Webhook] POST request received", {
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
      console.error("[Typeform Webhook] Convex HTTP API not configured");
      return NextResponse.json(
        { error: "Server configuration error: Convex not configured" },
        { status: 500 }
      );
    }

    // Get raw body as text for signature verification
    // Note: This consumes the body stream, so we must parse it after
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
      config = await convexQuery<any>("typeform:getConfigForEmail", {
        email: userEmail,
      });
    } catch (error) {
      console.error(`Failed to fetch config for user ${userEmail}:`, error);
      return NextResponse.json(
        { error: "Failed to retrieve webhook configuration" },
        { status: 500 }
      );
    }

    if (!config?.secret) {
      return NextResponse.json(
        { error: `Webhook secret not configured for user: ${userEmail}. Please generate a secret in settings to enable webhook verification.` },
        { status: 400 }
      );
    }

    // Verify signature
    // Typeform uses "typeform-signature" header (primary), with fallbacks for compatibility
    const signature = request.headers.get("typeform-signature") || 
                      request.headers.get("x-typeform-signature") ||
                      request.headers.get("signature");
    
    if (!signature) {
      return NextResponse.json(
        { error: "Missing signature header. Expected 'typeform-signature' header." },
        { status: 401 }
      );
    }

    const isValid = await verifySignature(rawBody, signature, config.secret);
    if (!isValid) {
      console.warn(`Signature verification failed for user ${userEmail}`);
      return NextResponse.json(
        { error: "Invalid webhook signature. Signature verification failed." },
        { status: 401 }
      );
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

    // Extract event type and form ID from payload
    const payloadObj = payload as Record<string, unknown>;
    const eventType = typeof payloadObj.event_id === "string" ? payloadObj.event_id : 
                      typeof payloadObj.event_type === "string" ? payloadObj.event_type : 
                      undefined;
    const formId = typeof payloadObj.form_response === "object" && payloadObj.form_response !== null
      ? (payloadObj.form_response as Record<string, unknown>).form_id as string | undefined
      : typeof payloadObj.form_id === "string" ? payloadObj.form_id : undefined;

    // Store webhook in Convex
    try {
      await convexMutation("typeform:storeWebhook", {
        email: userEmail,
        payload,
        eventType,
        formId,
      });
      
      // If this is a form response webhook, also store the response and create/update client
      const formResponse = payloadObj.form_response as Record<string, unknown> | undefined;
      
      if (formResponse && formId) {
        const responseId = typeof formResponse.token === "string" 
          ? formResponse.token 
          : typeof formResponse.response_id === "string"
          ? formResponse.response_id
          : undefined;
        
        if (responseId) {
          // Store response if not already stored
          try {
            const existingResponse = await convexQuery<any>(
              "typeform:getResponseByResponseId",
              {
                responseId,
              }
            );
            
            if (!existingResponse) {
              // Fetch form details to get questions
              let formQuestions: Array<{ id: string; ref: string; title: string; type: string }> = [];
              let qaPairs: Array<{ question: string; answer: string; fieldRef?: string }> = [];
              
              try {
                const formDetails = await convexAction<any>(
                  "typeformActions:fetchTypeformFormDetails",
                  {
                    email: userEmail,
                    formId: formId!,
                  }
                );
                
                if (formDetails?.fields) {
                  formQuestions = formDetails.fields;
                  
                  // Create field map
                  const fieldMap = new Map<string, { id: string; ref: string; title: string; type: string }>();
                  formQuestions.forEach((field) => {
                    fieldMap.set(field.ref, field);
                  });
                  
                  // Create Q&A pairs
                  const answers = formResponse.answers as Array<{ field?: { id?: string; ref?: string }; text?: string }> | undefined;
                  qaPairs = answers?.map((answer) => {
                    const ref = answer.field?.ref;
                    const field = ref ? fieldMap.get(ref) : null;
                    return {
                      question: field?.title || ref || "Unknown Question",
                      answer: answer.text || "",
                      fieldRef: ref,
                    };
                  }) || [];
                }
              } catch (error) {
                console.error(`Failed to fetch form details for webhook:`, error);
                // Continue without questions
              }
              
              await convexMutation<any>("typeform:storeResponse", {
                email: userEmail,
                formId,
                responseId,
                payload: formResponse,
                questions: formQuestions.length > 0 ? formQuestions : undefined,
                qaPairs: qaPairs.length > 0 ? qaPairs : undefined,
              });
              
              // Extract client info using explicit field mapping from qaPairs
              // Field mapping for the single Typeform form
              const FIELD_MAPPING: Record<string, { field: string; type: "string" | "number" | "email" }> = {
                // Full Name
                "98e94d78-6c72-4ea2-806e-9675f326550e": { field: "contactFirstName", type: "string" },
                // Business Name
                "01K3PZTF2WHB908HD47FDXE81C": { field: "businessName", type: "string" },
                // Email
                "a0e9781d-38e4-4768-af2c-19a4518d2ac7": { field: "businessEmail", type: "email" },
                // Target Revenue (monthly)
                "6589c67b-c739-4372-96e0-a5e3b6a52220": { field: "targetRevenue", type: "number" },
              };
              
              let businessEmail: string | null = null;
              let businessName: string | null = null;
              let firstName: string | null = null;
              let lastName: string | null = null;
              let targetRevenue: number | null = null;
              
              // Extract data from qaPairs using explicit mapping
              for (const qa of qaPairs) {
                const fieldRef = qa.fieldRef?.trim();
                if (!fieldRef) continue;
                
                const mapping = FIELD_MAPPING[fieldRef];
                if (!mapping) continue;
                
                const value = qa.answer?.trim();
                // Allow empty email (it might be optional)
                if (!value && mapping.field !== "businessEmail") continue;
                
                switch (mapping.field) {
                  case "businessName":
                    businessName = value;
                    break;
                  case "businessEmail":
                    if (value) {
                      businessEmail = value.toLowerCase();
                    }
                      break;
                  case "contactFirstName": {
                    const nameParts = value.split(/\s+/);
                    firstName = nameParts[0] || null;
                    if (nameParts.length > 1) {
                      lastName = nameParts.slice(1).join(" ");
                    }
                    break;
                  }
                  case "targetRevenue": {
                    // Handle ranges like "20-30k" or "20k-30k"
                    let num: number | null = null;
                    const cleaned = value.replace(/,/g, "").toLowerCase().trim();
                    
                    // Try to parse range (e.g., "20-30k" -> take upper bound)
                    const rangeMatch = cleaned.match(/(\d+)\s*-\s*(\d+)\s*k/i);
                    if (rangeMatch) {
                      const upper = parseInt(rangeMatch[2], 10) * 1000;
                      num = upper;
                    } else {
                      // Try single number with k suffix
                      const kMatch = cleaned.match(/(\d+)\s*k/i);
                      if (kMatch) {
                        num = parseInt(kMatch[1], 10) * 1000;
                      } else {
                        // Try plain number
                        const plainNum = parseInt(cleaned, 10);
                        if (!isNaN(plainNum) && plainNum > 0) {
                          num = plainNum;
                        }
                      }
                    }
                    
                    if (num && num > 0) {
                      targetRevenue = num;
                    }
                    break;
                  }
                }
              }
              
              // Create/update client if we have business name (businessEmail is optional)
              // First check for duplicates (manual clients or existing clients)
              if (businessName) {
                try {
                  // Extract website from formResponse if available
                  const answers = formResponse.answers as Array<{ field?: { id?: string; ref?: string }; text?: string }> | undefined;
                  const website = answers?.find((a) => 
                    a.field?.ref?.toLowerCase().includes("website") || 
                    a.field?.ref?.toLowerCase().includes("url") ||
                    a.text?.match(/^https?:\/\//)
                  )?.text || undefined;
                  
                  // Check for duplicate client before creating
                  const duplicate = await convexQuery<any>(
                    "clients:findDuplicateClient",
                    {
                      ownerEmail: userEmail,
                      businessEmail: businessEmail
                        ? businessEmail.toLowerCase().trim()
                        : undefined,
                      businessName: businessName,
                      website: website || undefined,
                    }
                  );
                  
                  if (duplicate) {
                    // Link the response to the existing client instead of creating a new one
                    console.log(`[Webhook] Duplicate client found: ${duplicate.businessName}, linking response ${responseId}`);
                    await convexMutation<any>("clients:linkResponseToClient", {
                      clientId: duplicate._id,
                      responseId: responseId,
                    });
                    // Update client with response data if it's a manual client (no onboardingResponseId)
                    if (!duplicate.onboardingResponseId) {
                      await convexMutation<any>("clients:updateClient", {
                        clientId: duplicate._id,
                        contactFirstName: firstName || undefined,
                        contactLastName: lastName || undefined,
                        targetRevenue: targetRevenue || undefined,
                      });
                      
                      // Trigger script generation for manual clients that now have a response
                      const workflowUrl = `${process.env.NEXT_PUBLIC_APP_URL || request.url.split('/api')[0]}/api/workflows/script-generation`;
                      fetch(workflowUrl, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          responseId: responseId,
                          email: userEmail,
                        }),
                      }).catch((error) => {
                        console.error(`[Workflow][Webhook] Failed to trigger script generation workflow for duplicate client ${duplicate._id}:`, error);
                      });
                    }
                  } else {
                    // No duplicate found, create new client
                    await convexMutation<any>(
                      "clients:upsertClientFromTypeform",
                      {
                        ownerEmail: userEmail,
                        businessEmail: businessEmail
                          ? businessEmail.toLowerCase().trim()
                          : undefined,
                        businessName: businessName,
                        contactFirstName: firstName || undefined,
                        contactLastName: lastName || undefined,
                        onboardingResponseId: responseId,
                        targetRevenue: targetRevenue || undefined,
                      }
                    );
                    
                    // Trigger script generation via Cloudflare Workflow (or fallback to direct)
                    // This happens in the background so webhook responds quickly
                    console.log(
                      `[Workflow][Webhook] Triggering script generation workflow`,
                      JSON.stringify({ responseId, ownerEmail: userEmail, clientCreated: true })
                    );
                    const workflowUrl = `${process.env.NEXT_PUBLIC_APP_URL || request.url.split('/api')[0]}/api/workflows/script-generation`;
                    fetch(workflowUrl, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        responseId: responseId,
                        email: userEmail,
                      }),
                    }).catch((error) => {
                      console.error(`[Workflow][Webhook] Failed to trigger script generation workflow for response ${responseId}:`, error);
                      // Don't fail the webhook if script generation fails
                    });
                  }
                } catch (clientError) {
                  // Log but don't fail the webhook if client creation fails
                  console.error(`[Workflow][Webhook] Failed to create/update client for ${businessEmail || businessName}:`, clientError);
                }
              }
            }
          } catch (responseError) {
            // Log but don't fail the webhook
            console.error(`[Workflow][Webhook] Failed to process form response:`, responseError);
          }
        }
      }
    } catch (storageError) {
      console.error(`[Workflow][Webhook] Failed to store webhook for user ${userEmail}:`, storageError);
      return NextResponse.json(
        { error: "Failed to store webhook payload in database" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error("[Typeform Webhook] Processing error:", {
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


