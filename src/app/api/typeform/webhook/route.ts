import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import crypto from "crypto";

type TypeformAnswer = {
  field?: {
    id?: string;
    ref?: string;
    type?: string;
  };
  text?: string;
  email?: string;
  type?: string;
};

type TypeformFormResponse = {
  form_id?: string;
  token?: string;
  response_id?: string;
  answers?: TypeformAnswer[];
  hidden?: Record<string, string>;
  submitted_at?: string;
  landed_at?: string;
};

type TypeformWebhookPayload = {
  event_id?: string;
  event_type?: string;
  form_response?: TypeformFormResponse;
  form_id?: string;
};

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
      config = await convex.query(api.typeform.getConfigForEmail, { email: userEmail });
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

    if (!verifySignature(rawBody, signature, config.secret)) {
      console.warn(`Signature verification failed for user ${userEmail}`);
      return NextResponse.json(
        { error: "Invalid webhook signature. Signature verification failed." },
        { status: 401 }
      );
    }

    // Parse JSON payload
    let payload: TypeformWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as TypeformWebhookPayload;
    } catch (parseError) {
      console.error("Failed to parse webhook payload as JSON:", parseError);
      return NextResponse.json(
        { error: "Invalid JSON payload. Failed to parse request body." },
        { status: 400 }
      );
    }

    // Extract event type and form ID from payload
    const payloadObj = payload;
    const eventType = payloadObj.event_id ?? payloadObj.event_type ?? undefined;
    const formId = payloadObj.form_response?.form_id ?? payloadObj.form_id;

    // Store webhook in Convex
    try {
      await convex.mutation(api.typeform.storeWebhook, {
        email: userEmail,
        payload,
        eventType,
        formId,
      });
      
      // If this is a form response webhook, also store the response and create/update client
      const formResponse = payloadObj.form_response;
      
      if (formResponse && formId) {
        const responseId = typeof formResponse.token === "string" 
          ? formResponse.token 
          : typeof formResponse.response_id === "string"
          ? formResponse.response_id
          : undefined;
        
        if (responseId) {
          const formAnswers: TypeformAnswer[] = Array.isArray(formResponse.answers)
            ? formResponse.answers
            : [];
          // Store response if not already stored
          try {
            const existingResponse = await convex.query(api.typeform.getResponseByResponseId, {
              responseId,
            });
            
            if (!existingResponse) {
              // Fetch form details to get questions
              let formQuestions: Array<{ id: string; ref: string; title: string; type: string }> = [];
              let qaPairs: Array<{ question: string; answer: string; fieldRef?: string }> = [];
              
              try {
                const formDetails = await convex.action(api.typeformActions.fetchTypeformFormDetails, {
                  email: userEmail,
                  formId: formId!,
                });
                
                if (formDetails?.fields) {
                  formQuestions = formDetails.fields;
                  
                  // Create field map
                  const fieldMap = new Map<string, { id: string; ref: string; title: string; type: string }>();
                  formQuestions.forEach((field) => {
                    fieldMap.set(field.ref, field);
                  });
                  
                  // Create Q&A pairs
                  qaPairs = formAnswers.length > 0
                    ? formAnswers.map((answer) => {
                        const ref = answer.field?.ref;
                        const field = ref ? fieldMap.get(ref) : null;
                        return {
                          question: field?.title || ref || "Unknown Question",
                          answer: answer.text || "",
                          fieldRef: ref,
                        };
                      })
                    : [];
                }
              } catch (error) {
                console.error(`Failed to fetch form details for webhook:`, error);
                // Continue without questions
              }
              
              await convex.mutation(api.typeform.storeResponse, {
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
                  // Extract website from hidden fields or answers if available
                  const hiddenFields = (formResponse.hidden ?? {}) as Record<string, unknown>;
                  const hiddenWebsite = typeof hiddenFields.website === "string" ? hiddenFields.website : undefined;
                  const websiteAnswer = formAnswers.find((answer) => {
                    const ref = answer.field?.ref?.toLowerCase() ?? "";
                    const text = answer.text?.trim();
                    return ref.includes("website") || ref.includes("url") || (text ? /^https?:\/\//i.test(text) : false);
                  });
                  const website = (hiddenWebsite ?? websiteAnswer?.text)?.trim() || undefined;
                  
                  // Check for duplicate client before creating
                  const duplicate = await convex.query(api.clients.findDuplicateClient, {
                    ownerEmail: userEmail,
                    businessEmail: businessEmail ? businessEmail.toLowerCase().trim() : undefined,
                    businessName: businessName,
                    website: website || undefined,
                  });
                  
                  if (duplicate) {
                    // Link the response to the existing client instead of creating a new one
                    console.log(`[Webhook] Duplicate client found: ${duplicate.businessName}, linking response ${responseId}`);
                    await convex.mutation(api.clients.linkResponseToClient, {
                      clientId: duplicate._id,
                      responseId: responseId,
                    });
                    // Update client with response data if it's a manual client (no onboardingResponseId)
                    if (!duplicate.onboardingResponseId) {
                      await convex.mutation(api.clients.updateClient, {
                        clientId: duplicate._id,
                        onboardingResponseId: responseId,
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
                    await convex.mutation(api.clients.upsertClientFromTypeform, {
                      ownerEmail: userEmail,
                      businessEmail: businessEmail ? businessEmail.toLowerCase().trim() : undefined,
                      businessName: businessName,
                      contactFirstName: firstName || undefined,
                      contactLastName: lastName || undefined,
                      onboardingResponseId: responseId,
                      targetRevenue: targetRevenue || undefined,
                    });
                    
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
    console.error("Typeform webhook processing error:", error);
    return NextResponse.json(
      { error: `Webhook processing failed: ${error.message}` },
      { status: 500 }
    );
  }
}


