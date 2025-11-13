import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

type ClientData = {
  businessName: string | null;
  businessEmail: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  targetRevenue: number | null;
};

/**
 * Generate script content using LLM from client data
 */
async function generateScriptContentFromClient(
  clientData: ClientData,
  model: string,
  thinkingEffort: "low" | "medium" | "high"
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

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
    const body = await request.json() as {
      clientId: string;
      email?: string; // Optional - for internal calls
    };

    const { clientId, email: providedEmail } = body;

    // Get user - either from auth or from provided email (for internal calls)
    let user: { id: string; email: string } | null = null;
    if (providedEmail) {
      // Internal call from Convex action - use provided email
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

    // Get the client
    const client = await convex.query(api.clients.getClientById, {
      clientId: clientId as any,
    });

    if (!client) {
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (client.ownerEmail !== user.email) {
      return NextResponse.json(
        { error: "Access denied: Client does not belong to user" },
        { status: 403 }
      );
    }

    // Check if script already exists for this client (idempotency)
    // Only check if this is a new client (created recently, within last 5 minutes)
    const recentScripts = await convex.query(api.scripts.getScriptsForClient, {
      clientId: clientId as any,
      ownerEmail: user.email,
    });

    // If client was just created (within last 5 minutes) and has no scripts, generate one
    // Otherwise, check if we should skip (e.g., if script was already generated)
    const clientAge = Date.now() - client.createdAt;
    const isNewClient = clientAge < 5 * 60 * 1000; // 5 minutes

    if (!isNewClient && recentScripts.length > 0) {
      console.log("[Script Generation] Client is not new or already has scripts - skipping", {
        clientId,
        clientAge,
        scriptCount: recentScripts.length,
      });
      return NextResponse.json({
        success: true,
        message: "Client already has scripts or is not new",
        scriptId: recentScripts[0]._id,
        skipped: true,
      });
    }

    // Extract client data
    const clientData: ClientData = {
      businessName: client.businessName || null,
      businessEmail: client.businessEmail || null,
      contactFirstName: client.contactFirstName || null,
      contactLastName: client.contactLastName || null,
      targetRevenue: client.targetRevenue || null,
    };

    if (!clientData.businessName) {
      return NextResponse.json(
        { error: "Business name is required but not found for client" },
        { status: 400 }
      );
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
      scriptHtml = await generateScriptContentFromClient(
        clientData,
        model,
        thinkingEffort
      );
      console.log("[Script Generation] Script content generated", {
        clientId,
        htmlLength: scriptHtml.length,
      });
    } catch (error) {
      console.error("[Script Generation] Script generation failed:", error);
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
      clientId: clientId as any,
      title: scriptTitle,
      contentHtml: scriptHtml,
      source: {
        type: "manual", // Changed from "typeform" since this is from client creation
      },
      model,
      thinkingEffort,
      status: "draft",
    });

    console.log("[Script Generation] Script stored", { scriptId, clientId });
    return NextResponse.json({
      success: true,
      scriptId,
      clientId,
    });
  } catch (error) {
    console.error("[Script Generation] Error generating script:", error);
    return NextResponse.json(
      {
        error: "Failed to generate script",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

