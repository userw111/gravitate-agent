/**
 * Cloudflare Workflow Script for Script Generation
 * 
 * This workflow orchestrates the script generation process:
 * 1. Fetch Typeform response
 * 2. Extract client data
 * 3. Create/update client
 * 4. Generate script with AI
 * 5. Store script
 * 
 * Deploy this as a separate Worker that can be invoked by Workflows
 * 
 * Local Testing:
 *   wrangler dev script-generation-workflow.ts
 * 
 * Production:
 *   wrangler deploy script-generation-workflow.ts --name script-generation-workflow
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// Get environment variables from Cloudflare Workers environment
// In local dev, these come from .dev.vars
// In production, set via wrangler secret
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

interface WorkflowInput {
  responseId: string;
  email: string;
  clientId?: string;
}

interface WorkflowStep {
  step: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: unknown;
  error?: string;
}

/**
 * Workflow handler - called by Cloudflare Workflows
 */
export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const input: WorkflowInput = await request.json();
    const steps: WorkflowStep[] = [];

    try {
      console.log(
        "[Workflow][Worker] Started",
        JSON.stringify({ responseId: input.responseId, email: input.email, hasClientId: Boolean(input.clientId) })
      );
      if (!convexUrl) {
        throw new Error("Convex URL not configured");
      }

      const convex = new ConvexHttpClient(convexUrl);

      // Step 1: Fetch Typeform response
      steps.push({ step: "fetch_response", status: "running" });
      console.log("[Workflow][Worker] Step: fetch_response (running)");
      const response = await convex.query(api.typeform.getResponseByResponseId, {
        responseId: input.responseId,
      });

      if (!response) {
        throw new Error("Typeform response not found");
      }

      if (response.email !== input.email) {
        throw new Error("Access denied: Response does not belong to user");
      }

      steps[0].status = "completed";
      steps[0].result = { responseId: response._id };
      console.log("[Workflow][Worker] Step: fetch_response (completed)");

      // Step 2: Check for existing script (idempotency)
      steps.push({ step: "check_existing_script", status: "running" });
      console.log("[Workflow][Worker] Step: check_existing_script (running)");
      const existingScript = await convex.query(api.scripts.getScriptByResponseId, {
        responseId: input.responseId,
        ownerEmail: input.email,
      });

      if (existingScript) {
        steps[1].status = "completed";
        steps[1].result = { scriptId: existingScript._id, existing: true };
        console.log("[Workflow][Worker] Script already exists - exiting", JSON.stringify({ scriptId: existingScript._id }));
        return new Response(
          JSON.stringify({
            success: true,
            scriptId: existingScript._id,
            existing: true,
            steps,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      steps[1].status = "completed";
      console.log("[Workflow][Worker] Step: check_existing_script (completed)");

      // Step 3: Extract client data
      steps.push({ step: "extract_client_data", status: "running" });
      console.log("[Workflow][Worker] Step: extract_client_data (running)");
      if (!response.qaPairs || response.qaPairs.length === 0) {
        throw new Error("No qaPairs found in response");
      }

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

      steps[2].status = "completed";
      steps[2].result = { businessName, businessEmail, firstName, lastName, targetRevenue };
      console.log("[Workflow][Worker] Step: extract_client_data (completed)", JSON.stringify({ businessName, businessEmail }));

      // Step 4: Get or create client
      steps.push({ step: "create_client", status: "running" });
      console.log("[Workflow][Worker] Step: create_client (running)");
      let clientId = input.clientId;

      if (!clientId && businessName) {
        clientId = await convex.mutation(api.clients.upsertClientFromTypeform, {
          ownerEmail: input.email,
          businessEmail: businessEmail || undefined,
          businessName: businessName,
          contactFirstName: firstName || undefined,
          contactLastName: lastName || undefined,
          onboardingResponseId: input.responseId,
          targetRevenue: targetRevenue || undefined,
        });
      }

      if (!clientId) {
        throw new Error("Failed to create client");
      }

      steps[3].status = "completed";
      steps[3].result = { clientId };
      console.log("[Workflow][Worker] Step: create_client (completed)", JSON.stringify({ clientId }));

      // Step 5: Get script generation settings
      steps.push({ step: "get_settings", status: "running" });
      console.log("[Workflow][Worker] Step: get_settings (running)");
      const settings = await convex.query(api.scriptSettings.getSettingsForEmail, {
        email: input.email,
      });

      const model = settings?.defaultModel || "openai/gpt-5";
      const thinkingEffort = settings?.defaultThinkingEffort || "medium";

      steps[4].status = "completed";
      steps[4].result = { model, thinkingEffort };
      console.log("[Workflow][Worker] Step: get_settings (completed)", JSON.stringify({ model, thinkingEffort }));

      // Step 6: Generate script with AI
      steps.push({ step: "generate_script", status: "running" });
      console.log("[Workflow][Worker] Step: generate_script (running)");
      if (!OPENROUTER_API_KEY) {
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
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": APP_URL,
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

      steps[5].status = "completed";
      steps[5].result = { contentLength: htmlContent.length };
      console.log("[Workflow][Worker] Step: generate_script (completed)", JSON.stringify({ contentLength: htmlContent.length }));

      // Step 7: Store script
      steps.push({ step: "store_script", status: "running" });
      console.log("[Workflow][Worker] Step: store_script (running)");
      const scriptTitle = `Script for ${businessName} - ${new Date().toLocaleDateString()}`;

      const scriptId = await convex.mutation(api.scripts.createScript, {
        ownerEmail: input.email,
        clientId: clientId as any,
        title: scriptTitle,
        contentHtml: htmlContent,
        source: {
          type: "typeform",
          responseId: input.responseId,
        },
        model,
        thinkingEffort,
        status: "draft",
      });

      steps[6].status = "completed";
      steps[6].result = { scriptId };
      console.log("[Workflow][Worker] Step: store_script (completed)", JSON.stringify({ scriptId }));

      return new Response(
        JSON.stringify({
          success: true,
          scriptId,
          clientId,
          steps,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const failedStep = steps.find((s) => s.status === "running");
      if (failedStep) {
        failedStep.status = "failed";
        failedStep.error = errorMessage;
      }

      console.error("[Workflow][Worker] Failed", JSON.stringify({ error: errorMessage, lastStep: failedStep?.step }));
      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          steps,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
};

