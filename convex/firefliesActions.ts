import { action, ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

const FIREFLIES_API_URL = "https://api.fireflies.ai/graphql";

const COMMON_TLDS = [
  "com",
  "net",
  "org",
  "io",
  "ai",
  "co",
  "us",
  "uk",
  "ca",
  "app",
  "dev",
  "info",
  "biz",
  "xyz",
];

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function normalizeKey(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
}

function extractDomain(email: string): string | null {
  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1) return null;
  return email.slice(atIndex + 1).toLowerCase().trim();
}

function stripCommonTlds(value: string): string {
  let result = value;
  let changed = true;
  while (changed && result.length > 0) {
    changed = false;
    for (const tld of COMMON_TLDS) {
      if (result.endsWith(tld)) {
        result = result.slice(0, -tld.length);
        changed = true;
        break;
      }
    }
  }
  return result;
}

function getDomainKey(domain: string): string | null {
  const normalized = normalizeKey(domain);
  if (!normalized) return null;
  const stripped = stripCommonTlds(normalized);
  return stripped || normalized;
}

type ClientLinkingMeta = {
  client: { _id: Id<"clients">; businessEmail?: string | null; businessName?: string | null };
  emailNormalized: string | null;
  domain: string | null;
  domainKey: string | null;
  businessKey: string | null;
};

type ClientLookup = {
  metas: ClientLinkingMeta[];
  byEmail: Map<string, ClientLinkingMeta>;
  byDomain: Map<string, ClientLinkingMeta[]>;
  byDomainKey: Map<string, ClientLinkingMeta[]>;
};

type LinkingHistoryEntry = NonNullable<Doc<"fireflies_transcripts">["linkingHistory"]>[number];

function buildClientLookup(
  clients: Array<{ _id: Id<"clients">; businessEmail?: string | null; businessName?: string | null }>
): ClientLookup {
  const metas: ClientLinkingMeta[] = [];
  const byEmail = new Map<string, ClientLinkingMeta>();
  const byDomain = new Map<string, ClientLinkingMeta[]>();
  const byDomainKey = new Map<string, ClientLinkingMeta[]>();

  for (const client of clients) {
    const emailNormalized = client.businessEmail ? normalizeEmail(client.businessEmail) : null;
    const domain = client.businessEmail ? extractDomain(client.businessEmail) : null;
    const domainKey = domain ? getDomainKey(domain) : null;
    const businessKey = client.businessName ? normalizeKey(client.businessName) : null;
    const meta: ClientLinkingMeta = {
      client,
      emailNormalized,
      domain,
      domainKey,
      businessKey,
    };
    metas.push(meta);
    if (emailNormalized) {
      byEmail.set(emailNormalized, meta);
    }
    if (domain) {
      const list = byDomain.get(domain);
      if (list) {
        list.push(meta);
      } else {
        byDomain.set(domain, [meta]);
      }
    }
    if (domainKey) {
      const list = byDomainKey.get(domainKey);
      if (list) {
        list.push(meta);
      } else {
        byDomainKey.set(domainKey, [meta]);
      }
    }
  }

  return { metas, byEmail, byDomain, byDomainKey };
}

type MatchResult = {
  meta: ClientLinkingMeta;
  confidence: number;
  reason: string;
};

function matchClientForParticipants(
  ownerEmail: string,
  participants: string[] | undefined,
  lookup: ClientLookup
): MatchResult | null {
  if (!participants || participants.length === 0) {
    return null;
  }

  const ownerNormalized = normalizeEmail(ownerEmail);
  let bestMatch: MatchResult | null = null;

  const consider = (candidate: MatchResult) => {
    if (!bestMatch || candidate.confidence > bestMatch.confidence) {
      bestMatch = candidate;
    }
  };

  for (const participant of participants) {
    if (!participant) continue;
    const normalized = normalizeEmail(participant);
    if (normalized === ownerNormalized) continue;

    // Exact email match
    const emailMatch = lookup.byEmail.get(normalized);
    if (emailMatch) {
      return {
        meta: emailMatch,
        confidence: 1,
        reason: `Participant email "${participant}" matches client business email.`,
      };
    }

    const domain = extractDomain(participant);
    if (!domain) continue;

    const domainMatches = lookup.byDomain.get(domain) ?? [];
    if (domainMatches.length === 1) {
      const candidate: MatchResult = {
        meta: domainMatches[0],
        confidence: 0.95,
        reason: `Participant domain "${domain}" uniquely matches client email domain.`,
      };
      consider(candidate);
      if (candidate.confidence >= 0.95) {
        return candidate;
      }
    }

    const participantDomainKey = getDomainKey(domain);
    if (!participantDomainKey) continue;

    const keyCandidates = lookup.byDomainKey.get(participantDomainKey) ?? [];
    if (keyCandidates.length === 1) {
      consider({
        meta: keyCandidates[0],
        confidence: 0.85,
        reason: `Participant domain core "${participantDomainKey}" uniquely aligns with client domain.`,
      });
      continue;
    }

    if (keyCandidates.length > 1) {
      const filtered = keyCandidates.filter(
        (candidate) =>
          candidate.businessKey &&
          (candidate.businessKey.includes(participantDomainKey) ||
            participantDomainKey.includes(candidate.businessKey))
      );
      if (filtered.length === 1) {
        consider({
          meta: filtered[0],
          confidence: 0.75,
          reason: `Participant domain core "${participantDomainKey}" matches client business name.`,
        });
        continue;
      }
    }

    // Fallback fuzzy business name match
    for (const meta of lookup.metas) {
      if (!meta.businessKey) continue;
      if (meta.businessKey.includes(participantDomainKey) || participantDomainKey.includes(meta.businessKey)) {
        consider({
          meta,
          confidence: 0.65,
          reason: `Participant domain "${domain}" loosely matches client business name "${meta.client.businessName ?? ""}".`,
        });
      }
    }
  }

  return bestMatch;
}

type FirefliesTranscript = {
  id: string;
  title: string;
  date: string;
  duration?: number;
  transcript_url?: string;
  sentences?: Array<{
    text: string;
    speaker_name?: string;
    speaker_id?: string;
  }>;
  participants?: string[]; // Array of strings, not objects
  summary?: {
    notes?: string; // AI-generated notes from the call
  };
};

type FirefliesTranscriptsResponse = {
  data?: {
    transcripts?: FirefliesTranscript[];
  };
  errors?: Array<{ message: string }>;
};

/**
 * Fetch all transcripts from Fireflies AI API
 */
export const fetchFirefliesTranscripts = action({
  args: {
    email: v.string(),
  },
  handler: async (ctx: ActionCtx, args): Promise<Array<{
    id: string;
    title: string;
    date: string;
    duration?: number;
    transcript: string;
    participants?: string[];
    sentences?: Array<{ text: string; speakerName?: string; speakerId?: string }>;
    notes?: string;
  }>> => {
    const config: { apiKey?: string } | null = await ctx.runQuery(api.fireflies.getConfigForEmail, {
      email: args.email,
    });

    if (!config?.apiKey) {
      throw new Error(`API key not configured for user: ${args.email}. Please set your Fireflies AI API key in settings.`);
    }

    // GraphQL query to fetch transcripts
    // Based on Fireflies API schema - transcripts is a root query
    // participants is [String!] (array of strings), not an object
    const query = `
      query GetTranscripts {
        transcripts {
          id
          title
          date
          duration
          transcript_url
          sentences {
            text
            speaker_name
          }
          participants
          summary {
            notes
          }
        }
      }
    `;

    const response: Response = await fetch(FIREFLIES_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Fireflies API error: ${response.status} ${response.statusText}`;
      try {
        const errorJson: { message?: string; errors?: Array<{ message: string }> } = JSON.parse(errorText);
        if (errorJson.message) {
          errorMessage = `Fireflies API error: ${errorJson.message}`;
        } else if (errorJson.errors && errorJson.errors.length > 0) {
          errorMessage = `Fireflies API error: ${errorJson.errors[0].message}`;
        }
      } catch {
        if (errorText) {
          errorMessage = `Fireflies API error: ${errorText}`;
        }
      }
      throw new Error(errorMessage);
    }

    const data: FirefliesTranscriptsResponse = await response.json();

    if (data.errors && data.errors.length > 0) {
      throw new Error(`Fireflies API GraphQL error: ${data.errors[0].message}`);
    }

    if (!data.data?.transcripts || !Array.isArray(data.data.transcripts)) {
      return [];
    }

    // Transform and return transcripts
    return data.data.transcripts.map((transcript) => {
      // Combine all sentences into full transcript text
      const fullTranscript = transcript.sentences
        ? transcript.sentences.map((s) => s.text).join(" ")
        : "";

      // Participants is already an array of strings
      const participants = transcript.participants || [];

      // Normalize sentences to include speaker labels
      const normalizedSentences = transcript.sentences
        ? transcript.sentences.map((s) => ({
            text: s.text,
            speakerName: s.speaker_name,
            speakerId: s.speaker_id,
          }))
        : undefined;

      return {
        id: transcript.id,
        title: transcript.title || "Untitled Meeting",
        date: transcript.date,
        duration: transcript.duration,
        transcript: fullTranscript,
        participants,
        sentences: normalizedSentences,
        notes: transcript.summary?.notes,
      };
    });
  },
});

/**
 * Fetch a single transcript by meetingId from Fireflies AI API
 */
export const fetchTranscriptById = action({
  args: {
    email: v.string(),
    meetingId: v.string(),
  },
  handler: async (ctx: ActionCtx, args): Promise<{
    id: string;
    title: string;
    date: string;
    duration?: number;
    transcript: string;
    participants?: string[];
    sentences?: Array<{ text: string; speakerName?: string; speakerId?: string }>;
    notes?: string;
  } | null> => {
    const config: { apiKey?: string } | null = await ctx.runQuery(api.fireflies.getConfigForEmail, {
      email: args.email,
    });

    if (!config?.apiKey) {
      throw new Error(`API key not configured for user: ${args.email}. Please set your Fireflies AI API key in settings.`);
    }

    // GraphQL query to fetch a single transcript by ID
    // Note: Fireflies API expects String! not ID! for the transcript query
    const query = `
      query GetTranscript($id: String!) {
        transcript(id: $id) {
          id
          title
          date
          duration
          transcript_url
          sentences {
            text
            speaker_name
          }
          participants
          summary {
            notes
          }
        }
      }
    `;

    const response: Response = await fetch(FIREFLIES_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: { id: args.meetingId },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Fireflies API error: ${response.status} ${response.statusText}`;
      try {
        const errorJson: { message?: string; errors?: Array<{ message: string }> } = JSON.parse(errorText);
        if (errorJson.message) {
          errorMessage = `Fireflies API error: ${errorJson.message}`;
        } else if (errorJson.errors && errorJson.errors.length > 0) {
          errorMessage = `Fireflies API error: ${errorJson.errors[0].message}`;
        }
      } catch {
        if (errorText) {
          errorMessage = `Fireflies API error: ${errorText}`;
        }
      }
      throw new Error(errorMessage);
    }

    const data: { data?: { transcript?: FirefliesTranscript }; errors?: Array<{ message: string }> } = await response.json();

    if (data.errors && data.errors.length > 0) {
      throw new Error(`Fireflies API GraphQL error: ${data.errors[0].message}`);
    }

    if (!data.data?.transcript) {
      return null;
    }

    const transcript = data.data.transcript;

    // Combine all sentences into full transcript text
    const fullTranscript = transcript.sentences
      ? transcript.sentences.map((s) => s.text).join(" ")
      : "";

    // Participants is already an array of strings
    const participants = transcript.participants || [];

    // Normalize sentences to include speaker labels
    const normalizedSentences = transcript.sentences
      ? transcript.sentences.map((s) => ({
          text: s.text,
          speakerName: s.speaker_name,
          speakerId: s.speaker_id,
        }))
      : undefined;

    return {
      id: transcript.id,
      title: transcript.title || "Untitled Meeting",
      date: transcript.date,
      duration: transcript.duration,
      transcript: fullTranscript,
      participants,
      sentences: normalizedSentences,
      notes: transcript.summary?.notes,
    };
  },
});

/**
 * Sync transcripts from Fireflies AI and store them in the database
 */
export const syncFirefliesTranscripts = action({
  args: {
    email: v.string(),
  },
  handler: async (ctx: ActionCtx, args): Promise<{ synced: number; skipped: number; total: number }> => {
    const transcripts: Array<{
      id: string;
      title: string;
      date: string;
      duration?: number;
      transcript: string;
      participants?: string[];
      sentences?: Array<{ text: string; speakerName?: string; speakerId?: string }>;
      notes?: string;
    }> = await ctx.runAction(api.firefliesActions.fetchFirefliesTranscripts, {
      email: args.email,
    });

    let synced = 0;
    let skipped = 0;

    const clients = await ctx.runQuery(api.clients.getClientsForLinking, { ownerEmail: args.email });
    const clientLookup = buildClientLookup(clients);

    for (const transcript of transcripts) {
      try {
        // Parse date string to timestamp
        const dateTimestamp = new Date(transcript.date).getTime();

        const attemptTimestamp = Date.now();
        const match = matchClientForParticipants(args.email, transcript.participants, clientLookup);

        const linkingStatus = match ? "auto_linked" : "unlinked";
        const linkingHistoryEntry = {
          stage: "auto",
          status: match ? ("success" as const) : ("no_match" as const),
          timestamp: attemptTimestamp,
          confidence: match?.confidence,
          clientId: match?.meta.client._id,
          reason:
            match?.reason ??
            (transcript.participants && transcript.participants.length > 0
              ? "No matching client found for participant emails."
              : "Transcript contained no participant emails to evaluate."),
        };

        await ctx.runMutation(api.fireflies.storeTranscript, {
          email: args.email,
          transcriptId: transcript.id,
          meetingId: transcript.id, // Using transcript ID as meeting ID for now
          title: transcript.title,
          transcript: transcript.transcript,
          sentences: transcript.sentences,
          date: dateTimestamp,
          duration: transcript.duration,
          participants: transcript.participants,
          notes: transcript.notes,
          clientId: match ? match.meta.client._id : undefined,
          linkingStatus,
          lastLinkAttemptAt: attemptTimestamp,
          linkingHistoryEntry,
        });
        synced++;

        if (!match) {
          try {
            const aiOutcome = await ctx.runAction(api.firefliesActions.analyzeTranscriptForLinking, {
              email: args.email,
              transcriptId: transcript.id,
            });
          } catch (aiError) {
            console.error(`AI linking attempt failed for transcript ${transcript.id}:`, aiError);
          }
        }
      } catch (error) {
        console.error(`Failed to store transcript ${transcript.id}:`, error);
        skipped++;
      }
    }

    return {
      synced,
      skipped,
      total: transcripts.length,
    };
  },
});

/**
 * Fetch a transcript by ID and store it in the database
 * Used when processing webhook notifications
 */
export const fetchAndStoreTranscriptById = action({
  args: {
    email: v.string(),
    meetingId: v.string(),
  },
  handler: async (ctx: ActionCtx, args): Promise<void> => {
    try {
      const transcript = await ctx.runAction(api.firefliesActions.fetchTranscriptById, {
        email: args.email,
        meetingId: args.meetingId,
      });

      if (!transcript) {
        console.warn(`Transcript ${args.meetingId} not found in Fireflies API`);
        return;
      }

      // Parse date string to timestamp
      const dateTimestamp = new Date(transcript.date).getTime();

      const clients = await ctx.runQuery(api.clients.getClientsForLinking, { ownerEmail: args.email });
      const clientLookup = buildClientLookup(clients);
      const attemptTimestamp = Date.now();
      const match = matchClientForParticipants(args.email, transcript.participants, clientLookup);
      const linkingStatus = match ? "auto_linked" : "unlinked";
      const linkingHistoryEntry = {
        stage: "auto",
        status: match ? ("success" as const) : ("no_match" as const),
        timestamp: attemptTimestamp,
        confidence: match?.confidence,
        clientId: match?.meta.client._id,
        reason:
          match?.reason ??
          (transcript.participants && transcript.participants.length > 0
            ? "No matching client found for participant emails."
            : "Transcript contained no participant emails to evaluate."),
      };

      // Store the transcript data in the transcripts table
      await ctx.runMutation(api.fireflies.storeTranscript, {
        email: args.email,
        meetingId: args.meetingId,
        transcriptId: transcript.id,
        title: transcript.title,
        transcript: transcript.transcript,
        sentences: transcript.sentences,
        date: dateTimestamp,
        duration: transcript.duration,
        participants: transcript.participants,
        notes: transcript.notes,
        clientId: match ? match.meta.client._id : undefined,
        linkingStatus,
        lastLinkAttemptAt: attemptTimestamp,
        linkingHistoryEntry,
      });

      // Note: AI linking is now handled in Next.js API route (/api/fireflies/process-linking)
      // This allows it to use Next.js environment variables instead of Convex env vars
      // The webhook handler will call that route after this action completes
    } catch (error) {
      console.error(`Failed to fetch and store transcript ${args.meetingId}:`, error);
      throw error;
    }
  },
});

export const analyzeTranscriptForLinking = action({
  args: {
    email: v.string(),
    transcriptId: v.string(),
  },
  handler: async (
    ctx: ActionCtx,
    args
  ): Promise<
    | { status: "already_linked"; transcriptId: string }
    | { status: "linked"; transcriptId: string; clientId: string; confidence: number }
    | { status: "needs_human"; transcriptId: string; reason: string; confidence: number }
  > => {
    const transcript = await ctx.runQuery(api.fireflies.getTranscriptById, {
      transcriptId: args.transcriptId,
    });

    if (!transcript) {
      throw new Error(`Transcript not found: ${args.transcriptId}`);
    }

    if (transcript.clientId) {
      return { status: "already_linked", transcriptId: args.transcriptId };
    }

    const clients = await ctx.runQuery(api.clients.getClientsForLinking, {
      ownerEmail: args.email,
    });

    if (clients.length === 0) {
      const attemptTimestamp = Date.now();
      await ctx.runMutation(api.fireflies.recordLinkingAttempt, {
        transcriptId: args.transcriptId,
        linkingStatus: "needs_human",
        lastLinkAttemptAt: attemptTimestamp,
        linkingHistoryEntry: {
          stage: "ai",
          status: "no_match",
          timestamp: attemptTimestamp,
          reason: "No clients available for matching.",
        },
      });
      return {
        status: "needs_human",
        transcriptId: args.transcriptId,
        reason: "No clients available for matching.",
        confidence: 0,
      };
    }

    // Get OpenRouter API key from Convex (user-specific)
    const openrouterConfig = await ctx.runQuery(api.openrouter.getConfigForEmail, {
      email: args.email,
    });

    // Fallback to environment variable for backwards compatibility
    const apiKey = openrouterConfig?.apiKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OpenRouter API key is not configured. Please set it in Settings → OpenRouter. " +
        "This API key is used for AI-powered transcript linking."
      );
    }

    const candidateSummaries = clients.map((client) => ({
      id: client._id,
      businessName: client.businessName ?? "",
      businessEmail: client.businessEmail ?? "",
      contactFirstName: client.contactFirstName ?? "",
      contactLastName: client.contactLastName ?? "",
      status: client.status ?? null,
    }));

    const participantList = Array.isArray(transcript.participants)
      ? transcript.participants.join(", ")
      : "None listed";

    const systemPrompt = `You link meeting transcripts with the correct client from a provided list.
- Only choose from the provided clients.
- Evaluate participant emails, domains, transcript content, and context clues.
- Respond with strict JSON matching this schema:
  {"decision":"link|no_link","clientId":null or client id string,"confidence":number between 0 and 1,"reason":"explanation"}
- If unsure, set decision to "no_link".`;

    const userPrompt = [
      `Owner email: ${args.email}`,
      `Transcript title: ${transcript.title}`,
      `Transcript date: ${new Date(transcript.date).toISOString()}`,
      `Participants: ${participantList}`,
      `Candidate clients:`,
      ...candidateSummaries.map(
        (client) =>
          `- ID: ${client.id}\n  Name: ${client.businessName}\n  Email: ${client.businessEmail || "N/A"}\n  Contact: ${[
            client.contactFirstName,
            client.contactLastName,
          ]
            .filter(Boolean)
            .join(" ") || "Unknown"}\n  Status: ${client.status || "unspecified"}`
      ),
      `Transcript content:\n"""${transcript.transcript}"""`,
    ].join("\n\n");

    let aiResult: {
      decision: "link" | "no_link";
      clientId: string | null;
      confidence: number;
      reason: string;
    } | null = null;

    const attemptTimestamp = Date.now();

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          // Using openrouter/auto to match the chat default, or fallback to gpt-4o-mini for cost efficiency
          // This will automatically select the best available model
          model: "openrouter/auto",
          temperature: 0.1,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter request failed with status ${response.status}`);
      }

      const data = (await response.json()) as any;
      const content = data?.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") {
        throw new Error("AI response missing content.");
      }

      const parsed = JSON.parse(content);
      aiResult = {
        decision: parsed.decision === "link" ? "link" : "no_link",
        clientId: typeof parsed.clientId === "string" ? parsed.clientId : null,
        confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
        reason: typeof parsed.reason === "string" ? parsed.reason : "No reason provided.",
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await ctx.runMutation(api.fireflies.recordLinkingAttempt, {
        transcriptId: args.transcriptId,
        linkingStatus: "needs_human",
        lastLinkAttemptAt: attemptTimestamp,
        linkingHistoryEntry: {
          stage: "ai",
          status: "error",
          timestamp: attemptTimestamp,
          reason: `AI invocation failed: ${err.message}`,
        },
      });
      return {
        status: "needs_human",
        transcriptId: args.transcriptId,
        reason: `AI invocation failed: ${err.message}`,
        confidence: 0,
      };
    }

    if (!aiResult) {
      await ctx.runMutation(api.fireflies.recordLinkingAttempt, {
        transcriptId: args.transcriptId,
        linkingStatus: "needs_human",
        lastLinkAttemptAt: attemptTimestamp,
        linkingHistoryEntry: {
          stage: "ai",
          status: "error",
          timestamp: attemptTimestamp,
          reason: "AI result was empty after parsing.",
        },
      });
      return {
        status: "needs_human",
        transcriptId: args.transcriptId,
        reason: "AI result was empty after parsing.",
        confidence: 0,
      };
    }

    if (aiResult.decision === "link" && aiResult.clientId) {
      const targetClient = clients.find((client) => client._id === aiResult.clientId);
      if (targetClient && aiResult.confidence >= 0.75) {
        await ctx.runMutation(api.clients.linkTranscriptToClient, {
          transcriptId: args.transcriptId,
          clientId: targetClient._id,
        });

        await ctx.runMutation(api.fireflies.recordLinkingAttempt, {
          transcriptId: args.transcriptId,
          clientId: targetClient._id,
          linkingStatus: "ai_linked",
          lastLinkAttemptAt: attemptTimestamp,
          linkingHistoryEntry: {
            stage: "ai",
            status: "success",
            timestamp: attemptTimestamp,
            confidence: aiResult.confidence,
            clientId: targetClient._id,
            reason: aiResult.reason,
          },
        });

        return {
          status: "linked",
          transcriptId: args.transcriptId,
          clientId: targetClient._id,
          confidence: aiResult.confidence,
        };
      }
    }

    await ctx.runMutation(api.fireflies.recordLinkingAttempt, {
      transcriptId: args.transcriptId,
      linkingStatus: "needs_human",
      lastLinkAttemptAt: attemptTimestamp,
      linkingHistoryEntry: {
        stage: "ai",
        status: "no_match",
        timestamp: attemptTimestamp,
        confidence: aiResult.confidence,
        clientId: aiResult.clientId ? (aiResult.clientId as Id<"clients">) : undefined,
        reason: aiResult.reason,
      },
    });

    try {
      await ctx.runAction(api.firefliesActions.notifyTranscriptLinkingViaTelegram, {
        transcriptId: args.transcriptId,
      });
    } catch (notifyError) {
      console.error(
        `Failed to send Telegram escalation for transcript ${args.transcriptId}:`,
        notifyError
      );
    }

    return {
      status: "needs_human",
      transcriptId: args.transcriptId,
      reason: aiResult.reason,
      confidence: aiResult.confidence,
    };
  },
});

export const notifyTranscriptLinkingViaTelegram = action({
  args: {
    transcriptId: v.string(),
  },
  handler: async (
    ctx: ActionCtx,
    args
  ): Promise<{ status: "sent"; transcriptId: string; messageId: number } | { status: "skipped"; reason: string }> => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) {
      return {
        status: "skipped",
        reason: "Telegram bot token or chat ID not configured.",
      };
    }

    const transcript = await ctx.runQuery(api.fireflies.getTranscriptById, {
      transcriptId: args.transcriptId,
    });

    if (!transcript) {
      return {
        status: "skipped",
        reason: `Transcript ${args.transcriptId} not found.`,
      };
    }

    const alreadyEscalated =
      Array.isArray(transcript.linkingHistory) &&
      transcript.linkingHistory.some(
        (entry: LinkingHistoryEntry) => entry.stage === "telegram" && entry.status === "success"
      );
    if (alreadyEscalated) {
      return {
        status: "skipped",
        reason: "Telegram notification already sent for this transcript.",
      };
    }

    const participants = Array.isArray(transcript.participants)
      ? transcript.participants.join(", ")
      : "None listed";

    const snippet = transcript.transcript.length > 500
      ? `${transcript.transcript.slice(0, 500)}…`
      : transcript.transcript;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    const manualLink = baseUrl
      ? `${baseUrl.replace(/\/$/, "")}/resolve-transcript/${transcript.transcriptId}`
      : null;

    const messageLines = [
      "🤖 *Transcript Linking Assistance Required*",
      "",
      `*Transcript ID:* ${transcript.transcriptId}`,
      `*Title:* ${transcript.title}`,
      `*Date:* ${new Date(transcript.date).toLocaleString()}`,
      `*Participants:* ${participants}`,
      `*Current Status:* ${transcript.linkingStatus ?? "unlinked"}`,
      "",
      manualLink ? `Manual link: ${manualLink}` : "",
      "Reply to this message with the correct client name or email (e.g., `Best Cleaners Inc` or `info@acme.com`).",
      "If we should hold off, reply with `manual` and we'll wait for more info.",
      "",
      `Preview:\n${snippet}`,
    ].filter(Boolean);

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageLines.join("\n"),
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to send Telegram notification: ${response.status} ${text}`);
    }

    const payload = (await response.json()) as { result?: { message_id?: number } };
    const messageId = payload?.result?.message_id ?? 0;

    const attemptTimestamp = Date.now();
    await ctx.runMutation(api.fireflies.recordLinkingAttempt, {
      transcriptId: args.transcriptId,
      linkingStatus: "needs_human",
      lastLinkAttemptAt: attemptTimestamp,
      linkingHistoryEntry: {
        stage: "telegram",
        status: "success",
        timestamp: attemptTimestamp,
        reason: `Escalated to Telegram (message ${messageId}).`,
      },
    });

    return {
      status: "sent",
      transcriptId: args.transcriptId,
      messageId,
    };
  },
});

/**
 * Create a test transcript and trigger the AI linking flow
 * Used for testing the intelligent linking pipeline
 */
export const createTestTranscript = action({
  args: {
    email: v.string(),
  },
  handler: async (ctx: ActionCtx, args): Promise<{ transcriptId: string; status: string }> => {
    // Create a test transcript with realistic data
    const testTranscriptId = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const testMeetingId = `meeting-${Date.now()}`;
    
    // Use a test email that might match a client domain
    const testParticipants = [
      args.email, // Owner email
      "john@acmecorp.com", // Test participant that might match a client
    ];
    
    const testTranscript = {
      id: testTranscriptId,
      title: "Test Meeting - AI Linking Demo",
      date: new Date().toISOString(),
      duration: 1800, // 30 minutes
      transcript: `This is a test transcript for demonstrating the AI linking functionality.

We discussed the quarterly results and upcoming projects. The team is excited about the new initiatives.

Key points:
- Revenue targets for Q4
- Marketing campaign planning
- Client onboarding process
- Team expansion plans

The meeting concluded with action items for next week.`,
      participants: testParticipants,
    };

    // Store the test transcript
    const dateTimestamp = new Date(testTranscript.date).getTime();
    
    const clients = await ctx.runQuery(api.clients.getClientsForLinking, { ownerEmail: args.email });
    const clientLookup = buildClientLookup(
      clients.map((client) => ({
        _id: client._id,
        businessEmail: client.businessEmail ?? null,
        businessName: client.businessName ?? null,
      }))
    );
    
    const attemptTimestamp = Date.now();
    const match = matchClientForParticipants(args.email, testTranscript.participants, clientLookup);
    const linkingStatus = match ? "auto_linked" : "unlinked";
    const linkingHistoryEntry = {
      stage: "auto",
      status: match ? ("success" as const) : ("no_match" as const),
      timestamp: attemptTimestamp,
      confidence: match?.confidence,
      clientId: match?.meta.client._id,
      reason: match?.reason ?? "No automatic match found.",
    };

    await ctx.runMutation(api.fireflies.storeTranscript, {
      email: args.email,
      transcriptId: testTranscriptId,
      meetingId: testMeetingId,
      title: testTranscript.title,
      transcript: testTranscript.transcript,
      date: dateTimestamp,
      duration: testTranscript.duration,
      participants: testTranscript.participants,
      clientId: match?.meta.client._id,
      linkingStatus,
      lastLinkAttemptAt: attemptTimestamp,
      linkingHistoryEntry,
    });

    // If auto-linked, return success
    if (match) {
      return {
        transcriptId: testTranscriptId,
        status: "auto_linked",
      };
    }

    // Otherwise, trigger AI linking via Next.js API route
    // This uses Next.js environment variables instead of Convex
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (!baseUrl) {
        return {
          transcriptId: testTranscriptId,
          status: "needs_manual_review",
        };
      }

      const linkingResponse = await fetch(`${baseUrl.replace(/\/$/, "")}/api/fireflies/process-linking`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: args.email,
          transcriptId: testTranscriptId,
        }),
      });

      if (!linkingResponse.ok) {
        const errorText = await linkingResponse.text();
        console.error(`AI linking failed: ${errorText}`);
        return {
          transcriptId: testTranscriptId,
          status: "error",
        };
      }

      const aiResult: any = await linkingResponse.json();
      
      if (aiResult.status === "linked") {
        return {
          transcriptId: testTranscriptId,
          status: "ai_linked",
        };
      }

      if (aiResult.status === "needs_human") {
        // Check if Telegram was sent by checking linking history
        const updatedTranscript = await ctx.runQuery(api.fireflies.getTranscriptById, {
          transcriptId: testTranscriptId,
        });
        
        const telegramSent = updatedTranscript?.linkingHistory?.some(
          (entry: LinkingHistoryEntry) => entry.stage === "telegram" && entry.status === "success"
        );

        if (telegramSent) {
          return {
            transcriptId: testTranscriptId,
            status: "escalated_to_telegram",
          };
        }

        return {
          transcriptId: testTranscriptId,
          status: "needs_manual_review",
        };
      }

      return {
        transcriptId: testTranscriptId,
        status: aiResult.status || "needs_manual_review",
      };
    } catch (error) {
      console.error("Error in test transcript linking flow:", error);
      return {
        transcriptId: testTranscriptId,
        status: "error",
      };
    }
  },
});

