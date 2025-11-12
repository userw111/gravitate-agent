import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

/**
 * Explicit field mapping for the single Typeform form
 * Maps fieldRef values to client data fields
 */
const FIELD_MAPPING: Record<string, { field: keyof ClientData; type: "string" | "number" | "email" }> = {
  // Full Name
  "98e94d78-6c72-4ea2-806e-9675f326550e": { field: "contactFirstName", type: "string" },
  // Business Name
  "01K3PZTF2WHB908HD47FDXE81C": { field: "businessName", type: "string" },
  // Email
  "a0e9781d-38e4-4768-af2c-19a4518d2ac7": { field: "businessEmail", type: "email" },
  // Target Revenue (monthly)
  "6589c67b-c739-4372-96e0-a5e3b6a52220": { field: "targetRevenue", type: "number" },
};

type ClientData = {
  businessName: string | null;
  businessEmail: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  targetRevenue: number | null;
};

/**
 * Extract client data from qaPairs using explicit field mapping
 */
function extractClientDataFromQAPairs(qaPairs: Array<{ question: string; answer: string; fieldRef?: string }>): ClientData {
  const result: ClientData = {
    businessName: null,
    businessEmail: null,
    contactFirstName: null,
    contactLastName: null,
    targetRevenue: null,
  };

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
        result.businessName = value;
        break;
      case "businessEmail":
        if (value) {
          result.businessEmail = value.toLowerCase();
        }
        break;
      case "contactFirstName": {
        const nameParts = value.split(/\s+/);
        result.contactFirstName = nameParts[0] || null;
        if (nameParts.length > 1) {
          result.contactLastName = nameParts.slice(1).join(" ");
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
          result.targetRevenue = num;
        }
        break;
      }
    }
  }

  return result;
}

/**
 * Generate script content using LLM
 */
async function generateScriptContent(
  clientData: ClientData,
  qaPairs: Array<{ question: string; answer: string; fieldRef?: string }>,
  model: string,
  thinkingEffort: "low" | "medium" | "high"
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

  // Build context from qaPairs
  const contextText = qaPairs
    .map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`)
    .join("\n\n");

  const systemPrompt = `You are an expert video script writer creating personalized outreach scripts for businesses.

Create a professional, engaging video script in HTML format that will be used for outreach. The script should:
- Be personalized based on the client's information
- Include clear sections with HTML headings (h1, h2, h3)
- Use proper HTML formatting (p, ul, ol, li, strong, em tags)
- Be conversational and engaging
- Include a strong call-to-action
- Be approximately 2-3 minutes when read aloud

Format the response as clean HTML without any markdown code blocks or explanations.`;

  const userPrompt = `Create a personalized video script for:

Business Name: ${clientData.businessName || "Unknown"}
Contact: ${clientData.contactFirstName || ""} ${clientData.contactLastName || ""}
Email: ${clientData.businessEmail || "Not provided"}
Target Revenue: ${clientData.targetRevenue ? `$${clientData.targetRevenue.toLocaleString()}` : "Not specified"}

Client Information:
${contextText}

Generate the script as HTML with proper structure.`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "Gravitate Agent",
    },
    body: JSON.stringify({
      model: model || "openai/gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...(model.includes("gpt-5") || model.includes("gpt-oss-120b") ? {
        reasoning: {
          effort: thinkingEffort,
        },
      } : {}),
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data?.choices?.[0]?.message?.content;
  
  if (!content || typeof content !== "string") {
    throw new Error("AI response missing content");
  }

  // Clean up markdown code blocks if present
  let htmlContent = content.trim();
  if (htmlContent.startsWith("```html")) {
    htmlContent = htmlContent.replace(/^```html\n?/, "").replace(/\n?```$/, "");
  } else if (htmlContent.startsWith("```")) {
    htmlContent = htmlContent.replace(/^```\n?/, "").replace(/\n?```$/, "");
  }

  return htmlContent.trim();
}

export async function POST(request: Request) {
  try {
    // Support both authenticated requests (from UI) and internal requests (from Convex sync)
    const body = await request.json() as {
      responseId: string;
      clientId?: string; // Optional - will be created if not provided
      email?: string; // Optional - for internal calls from Convex sync
    };

    const { responseId, clientId, email: providedEmail } = body;
    console.log(
      "[Workflow][DirectAPI] Received script generation request",
      JSON.stringify({ responseId, hasClientId: Boolean(clientId), hasProvidedEmail: Boolean(providedEmail) })
    );

    // Get user - either from auth or from provided email (for internal calls)
    let user: { id: string; email: string } | null = null;
    if (providedEmail) {
      // Internal call from Convex sync - use provided email
      user = { id: "internal", email: providedEmail };
    } else {
      // Authenticated call from UI
      user = await getCurrentUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    if (!convex) {
      return NextResponse.json(
        { error: "Convex not configured" },
        { status: 500 }
      );
    }

    // Get the Typeform response
    const response = await convex.query(api.typeform.getResponseByResponseId, {
      responseId,
    });

    if (!response) {
      console.warn("[Workflow][DirectAPI] Typeform response not found", JSON.stringify({ responseId }));
      return NextResponse.json(
        { error: "Typeform response not found" },
        { status: 404 }
      );
    }

    // Verify ownership - response must belong to the user
    if (response.email !== user.email) {
      console.warn("[Workflow][DirectAPI] Ownership check failed", JSON.stringify({ responseEmail: response.email, userEmail: user.email }));
      return NextResponse.json(
        { error: "Access denied: Response does not belong to user" },
        { status: 403 }
      );
    }

    // Check if script already exists (idempotency)
    const existingScript = await convex.query(api.scripts.getScriptByResponseId, {
      responseId,
      ownerEmail: user.email,
    });

    if (existingScript) {
      console.log("[Workflow][DirectAPI] Script already exists - skipping", JSON.stringify({ scriptId: existingScript._id, responseId }));
      return NextResponse.json({
        success: true,
        scriptId: existingScript._id,
        message: "Script already exists",
        existing: true,
      });
    }

    // Extract client data from qaPairs
    if (!response.qaPairs || response.qaPairs.length === 0) {
      return NextResponse.json(
        { error: "No qaPairs found in response" },
        { status: 400 }
      );
    }

    const clientData = extractClientDataFromQAPairs(response.qaPairs);

    if (!clientData.businessName) {
      console.warn("[Workflow][DirectAPI] Missing business name in qaPairs", JSON.stringify({ responseId }));
      return NextResponse.json(
        { error: "Business name is required but not found in response" },
        { status: 400 }
      );
    }

    // Get or create client
    let finalClientId: string;
    if (clientId) {
      // Verify ownership
      const client = await convex.query(api.clients.getClientById, {
        clientId: clientId as any,
      });
      if (!client || client.ownerEmail !== user.email) {
        return NextResponse.json(
          { error: "Client not found or access denied" },
          { status: 403 }
        );
      }
      finalClientId = clientId;
    } else {
      // Create client if it doesn't exist
      const existingClient = await convex.query(api.clients.getClientByOnboardingResponseId, {
        ownerEmail: user.email,
        onboardingResponseId: responseId,
      });

      if (existingClient) {
        console.log("[Workflow][DirectAPI] Using existing client", JSON.stringify({ clientId: existingClient._id }));
        finalClientId = existingClient._id;
      } else {
        // Create new client
        const newClientId = await convex.mutation(api.clients.upsertClientFromTypeform, {
          ownerEmail: user.email,
          businessEmail: clientData.businessEmail || undefined,
          businessName: clientData.businessName,
          contactFirstName: clientData.contactFirstName || undefined,
          contactLastName: clientData.contactLastName || undefined,
          onboardingResponseId: responseId,
          targetRevenue: clientData.targetRevenue || undefined,
        });
        finalClientId = newClientId;
        console.log("[Workflow][DirectAPI] Created new client", JSON.stringify({ clientId: finalClientId }));
      }
    }

    // Get script generation settings
    const settings = await convex.query(api.scriptSettings.getSettingsForEmail, {
      email: user.email,
    });

    const model = settings?.defaultModel || "openai/gpt-5";
    const thinkingEffort = settings?.defaultThinkingEffort || "medium";

    // Generate script content
    let scriptHtml: string;
    try {
      scriptHtml = await generateScriptContent(
        clientData,
        response.qaPairs,
        model,
        thinkingEffort
      );
      console.log("[Workflow][DirectAPI] Script content generated", JSON.stringify({ htmlLength: scriptHtml.length }));
    } catch (error) {
      console.error("Script generation failed:", error);
      return NextResponse.json(
        {
          error: "Failed to generate script",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }

    // Create script record
    const scriptTitle = `Script for ${clientData.businessName} - ${new Date().toLocaleDateString()}`;
    
    const scriptId = await convex.mutation(api.scripts.createScript, {
      ownerEmail: user.email,
      clientId: finalClientId as any,
      title: scriptTitle,
      contentHtml: scriptHtml,
      source: {
        type: "typeform",
        responseId: responseId,
      },
      model,
      thinkingEffort,
      status: "draft",
    });

    console.log("[Workflow][DirectAPI] Script stored", JSON.stringify({ scriptId, clientId: finalClientId }));
    return NextResponse.json({
      success: true,
      scriptId,
      clientId: finalClientId,
    });
  } catch (error) {
    console.error("[Workflow][DirectAPI] Error generating script:", error);
    return NextResponse.json(
      {
        error: "Failed to generate script",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

