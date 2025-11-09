export async function POST(request: Request) {
  try {
    const { messages, model, thinkingEffort = "high" } = await request.json();
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

        const data = await openRouterRes.json();
        const reply =
          data?.choices?.[0]?.message?.content ??
          "I couldn't generate a response right now. Please try again.";
        const reasoning = data?.choices?.[0]?.message?.reasoning;

        return new Response(JSON.stringify({ reply, reasoning }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}


