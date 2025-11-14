import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!convex) {
      return NextResponse.json(
        { error: "Convex not configured" },
        { status: 500 }
      );
    }

    const body = await request.json() as {
      systemPrompt: string;
      model?: string;
      thinkingEffort?: "low" | "medium" | "high";
      businessName?: string;
      contactFirstName?: string;
      contactLastName?: string;
      businessEmail?: string;
      targetRevenue?: number | null;
      servicesOffered?: string;
      qaPairs?: Array<{ question: string; answer: string }>;
    };

    // Get OpenRouter API key
    const openrouterConfig = await convex.query(api.openrouter.getConfigForEmail, {
      email: user.email,
    });

    const apiKey = openrouterConfig?.apiKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenRouter API key not configured" },
        { status: 400 }
      );
    }

    // Get default model and thinking effort from settings (or use provided values)
    const settings = await convex.query(api.scriptSettings.getSettingsForEmail, {
      email: user.email,
    });

    const model = body.model || settings?.defaultModel || "openai/gpt-4o";
    const thinkingEffort = body.thinkingEffort || settings?.defaultThinkingEffort || "medium";

    // Build context from qaPairs
    const contextText = body.qaPairs && body.qaPairs.length > 0
      ? body.qaPairs.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join("\n\n")
      : "";

    const servicesOfferedText = body.servicesOffered 
      ? `\nServices Offered: ${body.servicesOffered}` 
      : "";

    const userPrompt = `Create a personalized video script for:

Business Name: ${body.businessName || "Unknown"}
Contact: ${body.contactFirstName || ""} ${body.contactLastName || ""}
Email: ${body.businessEmail || "Not provided"}
Target Revenue: ${body.targetRevenue ? `$${body.targetRevenue.toLocaleString()}` : "Not specified"}${servicesOfferedText}

${contextText ? `Client Information:\n${contextText}\n\n` : ""}Generate the script as HTML with proper structure.`;

    // Append HTML formatting instruction to system prompt (not user-facing)
    const systemPromptWithFormatting = body.systemPrompt + "\n\nFormat the response as clean HTML without any markdown code blocks or explanations.";

    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
          { role: "system", content: systemPromptWithFormatting },
          { role: "user", content: userPrompt },
        ],
        ...(model.includes("gpt-5") || model.includes("gpt-oss-120b") ? {
          reasoning: { effort: thinkingEffort },
        } : {}),
        temperature: 0.7,
        stream: true,
      }),
    });

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      return NextResponse.json(
        { error: `OpenRouter API error: ${openRouterResponse.status} - ${errorText}` },
        { status: openRouterResponse.status }
      );
    }

    // Stream the response
    const stream = new ReadableStream({
      async start(controller) {
        const reader = openRouterResponse.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let reasoningBuffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.trim() === "") continue;
              if (!line.startsWith("data: ")) continue;

              const dataStr = line.slice(6);
              if (dataStr === "[DONE]") {
                controller.enqueue(
                  new TextEncoder().encode(
                    `data: ${JSON.stringify({ type: "done" })}\n\n`
                  )
                );
                controller.close();
                return;
              }

              try {
                const data = JSON.parse(dataStr);
                const choice = data.choices?.[0];
                
                if (choice) {
                  const delta = choice.delta;
                  const finishReason = choice.finish_reason;

                  // Handle reasoning tokens
                  if (delta?.reasoning) {
                    reasoningBuffer += delta.reasoning;
                    controller.enqueue(
                      new TextEncoder().encode(
                        `data: ${JSON.stringify({ 
                          type: "reasoning", 
                          content: delta.reasoning 
                        })}\n\n`
                      )
                    );
                  }

                  // Handle content tokens
                  if (delta?.content) {
                    controller.enqueue(
                      new TextEncoder().encode(
                        `data: ${JSON.stringify({ 
                          type: "content", 
                          content: delta.content 
                        })}\n\n`
                      )
                    );
                  }

                  // Handle finish
                  if (finishReason && finishReason !== "tool_calls") {
                    controller.enqueue(
                      new TextEncoder().encode(
                        `data: ${JSON.stringify({ 
                          type: "done",
                          reasoning: reasoningBuffer || undefined
                        })}\n\n`
                      )
                    );
                    controller.close();
                    return;
                  }
                }
              } catch (e) {
                console.error("Failed to parse SSE data:", e);
              }
            }
          }
        } catch (error) {
          controller.error(error);
        } finally {
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
    console.error("Test generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

