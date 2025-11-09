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
      await convex.mutation(api.typeform.storeWebhook, {
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
              
              await convex.mutation(api.typeform.storeResponse, {
                email: userEmail,
                formId,
                responseId,
                payload: formResponse,
                questions: formQuestions.length > 0 ? formQuestions : undefined,
                qaPairs: qaPairs.length > 0 ? qaPairs : undefined,
              });
              
              // Extract client info and create/update client
              const answers = formResponse.answers as Array<{ text?: string }> | undefined;
              let businessEmail: string | null = null;
              let businessName: string | null = null;
              let firstName: string | null = null;
              let lastName: string | null = null;
              let targetRevenue: number | null = null;
              
              if (answers && Array.isArray(answers)) {
                // Extract name (first answer)
                if (answers[0]?.text) {
                  const nameParts = answers[0].text.trim().split(/\s+/);
                  if (nameParts.length >= 1) firstName = nameParts[0];
                  if (nameParts.length >= 2) lastName = nameParts.slice(1).join(" ");
                }
                
                // Extract business name (second answer)
                if (answers[1]?.text) {
                  businessName = answers[1].text.trim();
                }
                
                // Extract email
                for (const answer of answers) {
                  if (answer.text && answer.text.includes("@")) {
                    const emailMatch = answer.text.match(/[\w.-]+@[\w.-]+\.\w+/);
                    if (emailMatch) {
                      businessEmail = emailMatch[0];
                      break;
                    }
                  }
                }
                
                // Extract target revenue
                for (const answer of answers) {
                  if (answer.text) {
                    const cleaned = answer.text.replace(/,/g, "").trim();
                    const num = parseInt(cleaned, 10);
                    if (!isNaN(num) && num >= 10000 && num <= 10000000) {
                      targetRevenue = num;
                      break;
                    }
                  }
                }
              }
              
              // Create/update client if we have business email and name
              if (businessEmail && businessName) {
                try {
                  await convex.mutation(api.clients.upsertClientFromTypeform, {
                    ownerEmail: userEmail,
                    businessEmail: businessEmail.toLowerCase().trim(),
                    businessName: businessName,
                    contactFirstName: firstName || undefined,
                    contactLastName: lastName || undefined,
                    onboardingResponseId: responseId,
                    targetRevenue: targetRevenue || undefined,
                  });
                } catch (clientError) {
                  // Log but don't fail the webhook if client creation fails
                  console.error(`Failed to create/update client for ${businessEmail}:`, clientError);
                }
              }
            }
          } catch (responseError) {
            // Log but don't fail the webhook
            console.error(`Failed to process form response:`, responseError);
          }
        }
      }
    } catch (storageError) {
      console.error(`Failed to store webhook for user ${userEmail}:`, storageError);
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


