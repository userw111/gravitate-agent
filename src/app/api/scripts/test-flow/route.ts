import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

function sendLog(controller: ReadableStreamDefaultController<Uint8Array>, message: string, type: "info" | "success" | "error" | "warning" = "info") {
  const encoder = new TextEncoder();
  const data = JSON.stringify({ type, message, timestamp: Date.now() });
  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!convex) {
      return NextResponse.json({ error: "Convex not configured" }, { status: 500 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          sendLog(controller, "🚀 Starting test flow: Client Creation + Script Generation", "info");
          sendLog(controller, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");

          // Step 1: Create test Typeform response
          sendLog(controller, "📝 Step 1: Creating test Typeform response...", "info");
          const testResponseId = `test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          
          const testQAPairs = [
            {
              question: "Full Name (your personal name)",
              answer: "Test User",
              fieldRef: "98e94d78-6c72-4ea2-806e-9675f326550e",
            },
            {
              question: "What's your business name?",
              answer: "Test Business Inc",
              fieldRef: "01K3PZTF2WHB908HD47FDXE81C",
            },
            {
              question: "What's your business website?",
              answer: "testbusiness.com",
              fieldRef: "6cf49d8f-713c-4672-8588-ff5e77e82876",
            },
            {
              question: "What's your email?",
              answer: "test@testbusiness.com",
              fieldRef: "a0e9781d-38e4-4768-af2c-19a4518d2ac7",
            },
            {
              question: "What's your realistic target monthly revenue over the next 12 months?",
              answer: "25-30k",
              fieldRef: "6589c67b-c739-4372-96e0-a5e3b6a52220",
            },
          ];

          const testPayload = {
            token: testResponseId,
            submitted_at: new Date().toISOString(),
            answers: testQAPairs.map((qa) => ({
              field: { ref: qa.fieldRef },
              text: qa.answer,
            })),
          };

          await convex.mutation(api.typeform.storeResponse, {
            email: user.email,
            formId: "test-form",
            responseId: testResponseId,
            payload: testPayload,
            qaPairs: testQAPairs,
          });

          sendLog(controller, `✅ Test response created: ${testResponseId}`, "success");
          sendLog(controller, "", "info");

          // Step 2: Extract client data
          sendLog(controller, "🔍 Step 2: Extracting client data from response...", "info");
          const response = await convex.query(api.typeform.getResponseByResponseId, {
            responseId: testResponseId,
          });

          if (!response || !response.qaPairs) {
            throw new Error("Failed to retrieve test response");
          }

          // Extract client data (same logic as in generate-from-response)
          const FIELD_MAPPING: Record<string, { field: string }> = {
            "98e94d78-6c72-4ea2-806e-9675f326550e": { field: "contactFirstName" },
            "01K3PZTF2WHB908HD47FDXE81C": { field: "businessName" },
            "a0e9781d-38e4-4768-af2c-19a4518d2ac7": { field: "businessEmail" },
            "6589c67b-c739-4372-96e0-a5e3b6a52220": { field: "targetRevenue" },
          };

          let businessEmail: string | null = null;
          let businessName: string | null = null;
          let firstName: string | null = null;
          let lastName: string | null = null;
          let targetRevenue: number | null = null;

          for (const qa of response.qaPairs) {
            const fieldRef = qa.fieldRef?.trim();
            if (!fieldRef) continue;

            const mapping = FIELD_MAPPING[fieldRef];
            if (!mapping) continue;

            const value = qa.answer?.trim();
            if (!value && mapping.field !== "businessEmail") continue;

            switch (mapping.field) {
              case "businessName":
                businessName = value;
                break;
              case "businessEmail":
                if (value) businessEmail = value.toLowerCase();
                break;
              case "contactFirstName": {
                const nameParts = value.split(/\s+/);
                firstName = nameParts[0] || null;
                if (nameParts.length > 1) lastName = nameParts.slice(1).join(" ");
                break;
              }
              case "targetRevenue": {
                const cleaned = value.replace(/,/g, "").toLowerCase().trim();
                const rangeMatch = cleaned.match(/(\d+)\s*-\s*(\d+)\s*k/i);
                if (rangeMatch) {
                  targetRevenue = parseInt(rangeMatch[2], 10) * 1000;
                } else {
                  const kMatch = cleaned.match(/(\d+)\s*k/i);
                  if (kMatch) {
                    targetRevenue = parseInt(kMatch[1], 10) * 1000;
                  } else {
                    const num = parseInt(cleaned, 10);
                    if (!isNaN(num) && num > 0) targetRevenue = num;
                  }
                }
                break;
              }
            }
          }

          sendLog(controller, `   Business Name: ${businessName}`, "info");
          sendLog(controller, `   Contact: ${firstName} ${lastName || ""}`, "info");
          sendLog(controller, `   Email: ${businessEmail || "Not provided"}`, "info");
          sendLog(controller, `   Target Revenue: $${targetRevenue?.toLocaleString() || "Not provided"}`, "info");
          sendLog(controller, "", "info");

          // Step 3: Create/update client
          sendLog(controller, "👤 Step 3: Creating/updating client in database...", "info");
          let clientId: string;
          
          const existingClient = await convex.query(api.clients.getClientByOnboardingResponseId, {
            ownerEmail: user.email,
            onboardingResponseId: testResponseId,
          });

          if (existingClient) {
            sendLog(controller, `   Found existing client: ${existingClient._id}`, "info");
            clientId = existingClient._id;
          } else {
            const newClientId = await convex.mutation(api.clients.upsertClientFromTypeform, {
              ownerEmail: user.email,
              businessEmail: businessEmail || undefined,
              businessName: businessName!,
              contactFirstName: firstName || undefined,
              contactLastName: lastName || undefined,
              onboardingResponseId: testResponseId,
              targetRevenue: targetRevenue || undefined,
            });
            clientId = newClientId;
            sendLog(controller, `✅ Client created: ${clientId}`, "success");
          }
          sendLog(controller, "", "info");

          // Step 4: Check if script already exists
          sendLog(controller, "🔎 Step 4: Checking for existing script...", "info");
          const existingScript = await convex.query(api.scripts.getScriptByResponseId, {
            responseId: testResponseId,
            ownerEmail: user.email,
          });

          if (existingScript) {
            sendLog(controller, `⚠️ Script already exists: ${existingScript._id}`, "warning");
            sendLog(controller, "   Skipping script generation (idempotency)", "info");
            sendLog(controller, "", "info");
            sendLog(controller, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
            sendLog(controller, "✅ Test flow complete!", "success");
            sendLog(controller, `   Client ID: ${clientId}`, "info");
            sendLog(controller, `   Script ID: ${existingScript._id}`, "info");
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "done", clientId, scriptId: existingScript._id })}\n\n`));
            controller.close();
            return;
          }

          // Step 5: Get script generation settings
          sendLog(controller, "⚙️ Step 5: Loading script generation settings...", "info");
          const settings = await convex.query(api.scriptSettings.getSettingsForEmail, {
            email: user.email,
          });

          const model = settings?.defaultModel || "openai/gpt-5";
          const thinkingEffort = settings?.defaultThinkingEffort || "medium";
          
          sendLog(controller, `   Model: ${model}`, "info");
          sendLog(controller, `   Thinking Effort: ${thinkingEffort}`, "info");
          sendLog(controller, "", "info");

          // Step 6: Generate script
          sendLog(controller, "🤖 Step 6: Generating script with AI...", "info");
          sendLog(controller, `   Calling OpenRouter API (${model})...`, "info");
          
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

          const contextText = response.qaPairs
            .map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`)
            .join("\n\n");

          const userPrompt = `Create a personalized video script for:

Business Name: ${businessName || "Unknown"}
Contact: ${firstName || ""} ${lastName || ""}
Email: ${businessEmail || "Not provided"}
Target Revenue: ${targetRevenue ? `$${targetRevenue.toLocaleString()}` : "Not specified"}

Client Information:
${contextText}

Generate the script as HTML with proper structure.`;

          const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
              "X-Title": "Gravitate Agent",
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              ...(model.includes("gpt-5") || model.includes("gpt-oss-120b") ? {
                reasoning: { effort: thinkingEffort },
              } : {}),
              temperature: 0.7,
            }),
          });

          if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            throw new Error(`OpenRouter API error: ${aiResponse.status} - ${errorText}`);
          }

          const aiData = (await aiResponse.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const content = aiData?.choices?.[0]?.message?.content;
          
          if (!content || typeof content !== "string") {
            throw new Error("AI response missing content");
          }

          let htmlContent = content.trim();
          if (htmlContent.startsWith("```html")) {
            htmlContent = htmlContent.replace(/^```html\n?/, "").replace(/\n?```$/, "");
          } else if (htmlContent.startsWith("```")) {
            htmlContent = htmlContent.replace(/^```\n?/, "").replace(/\n?```$/, "");
          }
          htmlContent = htmlContent.trim();

          sendLog(controller, `✅ Script generated (${htmlContent.length} characters)`, "success");
          sendLog(controller, "", "info");

          // Step 7: Store script
          sendLog(controller, "💾 Step 7: Storing script in database...", "info");
          const scriptTitle = `Script for ${businessName} - ${new Date().toLocaleDateString()}`;
          
          const scriptId = await convex.mutation(api.scripts.createScript, {
            ownerEmail: user.email,
            clientId: clientId as any,
            title: scriptTitle,
            contentHtml: htmlContent,
            source: {
              type: "typeform",
              responseId: testResponseId,
            },
            model,
            thinkingEffort,
            status: "draft",
          });

          sendLog(controller, `✅ Script stored: ${scriptId}`, "success");
          sendLog(controller, "", "info");
          sendLog(controller, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
          sendLog(controller, "✅ Test flow complete!", "success");
          sendLog(controller, `   Client ID: ${clientId}`, "info");
          sendLog(controller, `   Script ID: ${scriptId}`, "info");
          sendLog(controller, `   View client: /dashboard/clients/${testResponseId}`, "info");

          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "done", clientId, scriptId })}\n\n`));
          controller.close();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          sendLog(controller, `❌ Error: ${errorMessage}`, "error");
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

