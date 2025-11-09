export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      messages: Array<{ role: string; content: string }>;
      model?: string;
      thinkingEffort?: "low" | "medium" | "high";
    };
    const { messages, model, thinkingEffort = "high" } = body;
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Invalid messages" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing OPENROUTER_API_KEY" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const referer =
      process.env.NEXT_PUBLIC_APP_URL ||
      (request.headers.get("origin") ?? "") ||
      "http://localhost:3000";

    // Check if model supports reasoning (GPT-5 or GPT-OSS-120B)
    const supportsReasoning = model?.includes("gpt-5") || model?.includes("gpt-oss-120b");
    
    const openRouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": referer,
        "X-Title": "Gravitate Agent",
      },
      body: JSON.stringify({
        model: model || "openrouter/auto",
        messages,
        stream: true,
        ...(supportsReasoning && {
          reasoning: {
            effort: thinkingEffort,
          },
        }),
      }),
    });

    if (!openRouterRes.ok) {
      const t = await openRouterRes.text();
      return new Response(JSON.stringify({ error: "Upstream error", detail: t }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Create a ReadableStream to forward the streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const reader = openRouterRes.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          controller.close();
          return;
        }

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
              
              // OpenRouter SSE format: "data: {...}"
              if (line.startsWith("data: ")) {
                const dataStr = line.slice(6);
                if (dataStr === "[DONE]") {
                  // Send final message with accumulated content
                  controller.enqueue(
                    new TextEncoder().encode(
                      `data: ${JSON.stringify({ type: "done" })}\n\n`
                    )
                  );
                  continue;
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
                    if (finishReason) {
                      controller.enqueue(
                        new TextEncoder().encode(
                          `data: ${JSON.stringify({ 
                            type: "done",
                            reasoning: reasoningBuffer || undefined
                          })}\n\n`
                        )
                      );
                    }
                  }
                } catch (e) {
                  // Skip invalid JSON lines
                  console.error("Failed to parse SSE data:", e);
                }
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
  } catch (err) {
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}


