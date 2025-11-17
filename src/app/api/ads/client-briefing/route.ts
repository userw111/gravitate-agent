import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { extractTypeformData } from "@/lib/extractTypeformData";
import {
  AdStrategistBriefing,
  normalizeBriefing,
} from "@/lib/adBriefing";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

type BriefingSource = "saved" | "llm";

type BriefingResponse = {
  source: BriefingSource;
  briefing: AdStrategistBriefing;
};

const AD_STRATEGIST_SYSTEM_PROMPT = `
### SYSTEM PROMPT: The Direct-Response Strategy Analyst

You are a world-class, direct-response media strategist and analyst. Your single-minded focus is on **analyzing** source materials (like company data sheets, call transcripts, and website copy) to **deconstruct** a company's core persuasive strategy.

Your entire methodology is built on a proven persuasive system. You will receive a set of "Source Materials" and must deconstruct them to populate a complete \`AdStrategistBriefing\`.

Your output must be a single, structured, and comprehensive briefing. You must find the specific information required for each field.

-----

### THE STRATEGIC ANALYSIS FRAMEWORK

You will analyze the source materials to find evidence for each component of this system. Use the "Strategic Menu" for each block as a guide for *what to look for* in the text.

#### Block 1: Brand Identity

- **Goal:** Identify the foundational brand elements.
- **Strategic Menu (What to look for):**
  - \`brandName\`: The literal name of the company or product.
  - \`serviceBeingSold\`: The specific service or product being promoted.
  - \`brandPersonality\`: The *tone* and *style* of the communication (e.g., "Professional," "Friendly & Casual," "Aggressive & Urgent," "Technical & Expert," "Premium & Elite").

#### Block 2: Audience & Problem

- **Goal:** Identify *who* the company is talking to and *what pain* they solve.
- **Strategic Menu (What to look for):**
  - \`targetAudience\`: Who is the ideal customer? (e.g., "Homeowners," "Moms in [City]," "B2B Managers").
  - \`geographicLocation\`: Any mention of a specific city, state, or region.
  - \`localEnemies\`: Specific local factors that cause the problem (e.g., "Georgia heat," "local soil," "pollen," "a specific competitor").
  - \`obviousProblem\`: The surface-level pain point (e.g., "Dirty windows," "Patchy grass," "Low sales").
  - \`realProblem\`: The *deeper* pain (e.g., "Social embarrassment," "Wasting weekend time," "Hidden damage," "Feeling overwhelmed").

#### Block 3: Solution & Differentiators

- **Goal:** Identify *how* the company solves the problem and *why* they are different.
- **Strategic Menu (What to look for):**
  - \`dreamOutcome\`: The "dream state" or ultimate relief promised (e.g., "Never think about [chore] again," "Make your home the envy of the street," "A clear, predictable [result]").
  - \`uniqueMechanism\`: The proprietary *way* they deliver the outcome. Look for:
    - A named process (e.g., "Our 5-Point Purity System").
    - A "We Don't Just..." differentiator (e.g., "We don't just clean the glass; we clean the frames, sills, and...").
    - A proprietary tool or technology.
    - A unique "Process" explanation (e.g., "First, we [Step 1]. Next, we [Step 2]...").

#### Block 4: Proof & Credibility

- **Goal:** Identify *why* the audience should trust them or believe their claims.
- **Strategic Menu (What to look for):**
  - \`guarantee\`: Any form of risk reversal (e.g., "100% Satisfaction Guarantee," "You don't pay until you're satisfied").
  - \`trustBadges\`: Mentions of external validation (e.g., "Licensed & Insured," "BBB A+," "5-Star Google Reviews," "Over 1,000 happy customers").
  - \`socialProof\`: Specific claims of popularity or trust (e.g., "Join 500+ [City] homeowners," "The #1 choice for...").

#### Block 5: Offer & CTA

- **Goal:** Identify *what* they want the customer to do and *why* they should do it now.
- **Strategic Menu (What to look for):**
  - \`offer\`: A specific, compelling value proposition (e.g., "$100 off," "Free [Service] with purchase," "Free, no-obligation estimate").
  - \`urgency\`: A reason to act *now* (e.g., "Offer ends Friday," "Spots fill up fast," "This week only," "Before we're fully booked").
  - \`ctaButton\`: The literal, clear instruction. For this system, it MUST ALWAYS be exactly: "Click the button below".

-----

### THE DELIVERABLE (Your Output Format)

Your **sole output** must be the structured \`AdStrategistBriefing\`. You will populate this by analyzing the "Source Materials" provided.

The \`AdStrategistBriefing\` object has this exact shape:

type AdStrategistBriefing = {
  brandIdentity: {
    brandName: string;
    serviceBeingSold: string;
    brandPersonality: string;
  };
  audienceAndProblem: {
    targetAudience: string;
    geographicLocation: string;
    localEnemies: string;
    obviousProblem: string;
    realProblem: string;
  };
  solutionAndDifferentiators: {
    dreamOutcome: string;
    uniqueMechanism: string;
  };
  proofAndCredibility: {
    guarantee: string;
    trustBadges: string;
    socialProof: string;
  };
  offerAndCTA: {
    offer: string;
    urgency: string;
    ctaButton: string;
  };
};

You MUST:
- Return a **single JSON object** that matches this shape exactly.
- Include **every field** as a string (no nulls, no numbers, no booleans).
- Set \`offerAndCTA.ctaButton\` to **exactly** "Click the button below" for every briefing, regardless of the source materials.
- If a field cannot be found or reasonably inferred, set it to "N/A" or "Not Found".
- Do **not** add extra fields or nesting.
- Do **not** wrap the JSON in markdown or prose. No explanations, no commentary, no code fences.

-----

### GUIDING PRINCIPLES (For Analysis)

- **No Invention or World Knowledge:** You must ONLY use information explicitly present in the Source Materials JSON. Do not rely on outside knowledge, guesses, or assumptions.
- **No Inference Beyond the Text:** If the "real problem" or any other field is not stated clearly in the materials, you MUST mark it as "N/A" or "Not Found". Do not infer or imagine it.
- **Be Specific (But Faithful):** When possible, use direct quotes or extremely close paraphrases from the text (e.g., \`trustBadges: "5-Star Google Reviews (150+)"\` is better than \`trustBadges: "Good reviews"\`), but do not add details that are not grounded in the materials.
- **Note Missing Data:** If a field cannot be found in the source materials, you **must** explicitly state "N/A" or "Not Found" in the corresponding output field. Do not invent data under any circumstances.

Your task begins when you receive the Source Materials. After analyzing them, respond with the JSON object and nothing else.
`.trim();

function safeJsonExtractObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const jsonText =
    start !== -1 && end !== -1 && end > start ? text.slice(start, end + 1) : text;
  return JSON.parse(jsonText);
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      clientId: string;
      forceRegenerate?: boolean;
    };

    const { clientId, forceRegenerate } = body;

    if (!clientId || typeof clientId !== "string") {
      return NextResponse.json(
        { error: "clientId is required" },
        { status: 400 },
      );
    }

    if (!convex) {
      return NextResponse.json(
        { error: "Convex not configured" },
        { status: 500 },
      );
    }

    const ownerEmail = user.email;

    // Load client and verify ownership
    const client = await convex.query(api.clients.getClientById, {
      clientId: clientId as any,
    });

    if (!client) {
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 },
      );
    }

    if (client.ownerEmail !== ownerEmail) {
      return NextResponse.json(
        { error: "Access denied: client does not belong to user" },
        { status: 403 },
      );
    }

    // If not forcing regenerate, try existing briefing first
    if (!forceRegenerate) {
      const existing = await convex.query(
        api.adBriefings.getBriefingForClient,
        {
          ownerEmail,
          clientId: clientId as any,
        },
      );

      if (existing?.briefing) {
        const normalized = normalizeBriefing(existing.briefing);
        const response: BriefingResponse = {
          source: "saved",
          briefing: normalized,
        };
        return NextResponse.json(response);
      }
    }

    // Fetch Typeform + transcripts to build context
    let typeformPayload: unknown = null;
    if (client.onboardingResponseId) {
      const typeformResponse = await convex.query(
        api.typeform.getResponseByResponseId,
        { responseId: client.onboardingResponseId },
      );
      typeformPayload = typeformResponse?.payload ?? null;
    }

    const transcripts =
      (await convex.query(api.fireflies.getTranscriptsForClient, {
        clientId: clientId as any,
      })) ?? [];

    const typeformData = typeformPayload
      ? extractTypeformData(typeformPayload as any)
      : null;

    const transcriptsForContext = transcripts
      .sort((a, b) => b.date - a.date)
      .slice(0, 5)
      .map((t) => ({
        title: t.title,
        date: t.date,
        notes: t.notes,
        participants: t.participants,
      }));

    const context = {
      client: {
        businessName: client.businessName,
        businessEmail: client.businessEmail,
        businessEmails: client.businessEmails,
        servicesOffered: client.servicesOffered,
        notes: client.notes,
        targetRevenue: client.targetRevenue,
        status: client.status,
        createdAt: client.createdAt,
      },
      typeform: typeformData,
      transcripts: transcriptsForContext,
    };

    // Get OpenRouter API key
    const openrouterConfig = await convex.query(
      api.openrouter.getConfigForEmail,
      {
        email: ownerEmail,
      },
    );

    const apiKey =
      openrouterConfig?.apiKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "OpenRouter API key not configured. Please set it in Settings → OpenRouter.",
        },
        { status: 500 },
      );
    }

    const referer =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.headers.get("origin") ||
      "http://localhost:3000";

    const userPrompt = `
You are given the following Source Materials about a local service business.

IMPORTANT:
- You may ONLY use information that appears inside these Source Materials.
- Do NOT guess, infer, or rely on world knowledge.
- If a field in AdStrategistBriefing cannot be filled directly from this data, set it to "N/A" or "Not Found".

Source Materials (structured JSON):

${JSON.stringify(context, null, 2)}

Remember: your final answer must be ONLY the JSON object, with no explanation or extra text.
`.trim();

    const llmRes = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": referer,
          "X-Title": "Gravitate Agent - Ad Strategist Briefing",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: AD_STRATEGIST_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.4,
        }),
      },
    );

    if (!llmRes.ok) {
      const errorText = await llmRes.text();
      return NextResponse.json(
        {
          error: "LLM provider error",
          detail: errorText,
        },
        { status: 502 },
      );
    }

    const llmJson = (await llmRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = llmJson.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "LLM response missing content" },
        { status: 502 },
      );
    }

    let parsed: unknown;
    try {
      parsed = safeJsonExtractObject(content);
    } catch (e) {
      return NextResponse.json(
        {
          error: "Failed to parse LLM JSON output",
          detail: e instanceof Error ? e.message : String(e),
          raw: content,
        },
        { status: 502 },
      );
    }

    const briefing = normalizeBriefing(parsed);

    // Save to Convex for future reuse
    await convex.mutation(api.adBriefings.upsertBriefing, {
      ownerEmail,
      clientId: clientId as any,
      briefing,
    });

    const response: BriefingResponse = {
      source: "llm",
      briefing,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Ad Briefing] Unexpected error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate ad strategist briefing",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}


