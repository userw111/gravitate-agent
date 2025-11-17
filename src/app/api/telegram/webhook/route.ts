import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const manualBaseUrl = process.env.NEXT_PUBLIC_APP_URL;

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function normalizeKey(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
}

async function sendTelegramMessage(chatId: number, text: string) {
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  }

  console.log(`[Telegram] Sending message to chat ${chatId}:`, text.substring(0, 100));

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Telegram] Failed to send message: ${response.status} - ${errorText}`);
    throw new Error(`Telegram API error: ${response.status} - ${errorText}`);
  }

  const result = (await response.json()) as { ok: boolean; description?: string };
  if (!result.ok) {
    console.error(`[Telegram] Telegram API returned error:`, result);
    throw new Error(`Telegram API error: ${result.description || JSON.stringify(result)}`);
  }

  console.log(`[Telegram] Message sent successfully`);
}

function extractTranscriptId(source?: string | null): string | null {
  if (!source) return null;
  // Try multiple patterns to extract transcript ID
  const patterns = [
    /Transcript ID:\s*([A-Za-z0-9\-_]+)/i,
    /transcript[_\s]*id[:\s]*([A-Za-z0-9\-_]+)/i,
    /test-[\d]+-[a-z0-9]+/i, // Match test transcript IDs directly
  ];
  
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }
  
  return null;
}

type ClientDoc = Awaited<ReturnType<typeof getClientsForOwner>>[number];
type TranscriptDoc = Awaited<ReturnType<typeof getTranscriptById>>;

type ClientMatch = {
  client: ClientDoc;
  confidence: number;
  reason: string;
};

function getTranscriptById(convex: ConvexHttpClient, transcriptId: string) {
  return convex.query(api.fireflies.getTranscriptById, { transcriptId });
}

function getClientsForOwner(convex: ConvexHttpClient, ownerEmail: string) {
  return convex.query(api.clients.getClientsForLinking, { ownerEmail });
}

function matchClientFromInput(input: string, clients: ClientDoc[]): ClientMatch | { multiple: ClientDoc[] } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  const sanitized = lower
    .replace(/^link\s+/, "")
    .replace(/^belongs\s+to\s+/, "")
    .replace(/^this\s+is\s+/, "")
    .replace(/^that\s+is\s+/, "")
    .replace(/^its?\s+/, "")
    .trim();

  if (!sanitized) return null;

  if (sanitized.includes("@")) {
    const emailNormalized = normalizeEmail(sanitized);
    const match = clients.find(
      (client) => client.businessEmail && normalizeEmail(client.businessEmail) === emailNormalized
    );
    if (match) {
      return {
        client: match,
        confidence: 0.95,
        reason: "Matched business email provided in Telegram reply.",
      };
    }
  }

  const key = normalizeKey(sanitized);
  if (!key) return null;

  const scored: Array<{ client: ClientDoc; score: number; reason: string }> = [];

  for (const client of clients) {
    const businessKey = normalizeKey(client.businessName ?? "");
    const contactKey = normalizeKey(
      `${client.contactFirstName ?? ""} ${client.contactLastName ?? ""}`.trim()
    );

    if (businessKey && businessKey === key) {
      scored.push({ client, score: 3, reason: "Exact business name match." });
      continue;
    }

    if (businessKey && (businessKey.includes(key) || key.includes(businessKey))) {
      scored.push({ client, score: 2, reason: "Partial business name match." });
    }

    if (contactKey) {
      if (contactKey === key) {
        scored.push({ client, score: 2, reason: "Exact contact name match." });
      } else if (contactKey.includes(key) || key.includes(contactKey)) {
        scored.push({ client, score: 1.5, reason: "Partial contact name match." });
      }
    }
  }

  if (scored.length === 0) {
    return null;
  }

  scored.sort((a, b) => b.score - a.score);
  const topScore = scored[0].score;
  const topMatches = scored.filter((entry) => entry.score === topScore);

  if (topMatches.length > 1) {
    return { multiple: topMatches.map((entry) => entry.client) };
  }

  const best = topMatches[0];
  const confidence = Math.min(1, 0.5 + best.score / 4);
  return {
    client: best.client,
    confidence,
    reason: best.reason,
  };
}

// GET endpoint to check webhook status
export async function GET(request: Request) {
  if (!botToken) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not configured" }, { status: 500 });
  }

  try {
    const webhookInfo = (await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`).then((r) => r.json())) as {
      ok: boolean;
      result?: {
        url?: string;
        pending_update_count?: number;
        last_error_message?: string;
        last_error_date?: number;
      };
    };
    return NextResponse.json({
      webhookConfigured: webhookInfo.ok && !!webhookInfo.result?.url,
      webhookUrl: webhookInfo.result?.url,
      pendingUpdates: webhookInfo.result?.pending_update_count || 0,
      lastError: webhookInfo.result?.last_error_message,
      lastErrorDate: webhookInfo.result?.last_error_date,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  console.log("[Telegram Webhook] Received request");
  
  if (!convexUrl) {
    console.error("[Telegram Webhook] Missing NEXT_PUBLIC_CONVEX_URL");
    return NextResponse.json({ ok: false });
  }

  if (!botToken) {
    console.error("[Telegram Webhook] Missing TELEGRAM_BOT_TOKEN");
    return NextResponse.json({ ok: false });
  }

  const convex = new ConvexHttpClient(convexUrl);

  try {
    const update = (await request.json()) as any;
    console.log("[Telegram Webhook] Update received:", JSON.stringify(update, null, 2));
    
    const message = update?.message;
    if (!message) {
      console.log("[Telegram Webhook] No message in update, ignoring");
      return NextResponse.json({ ok: true });
    }

    const chatId: number | undefined = message.chat?.id;
    if (typeof chatId !== "number") {
      console.log("[Telegram Webhook] Invalid chat ID:", chatId);
      return NextResponse.json({ ok: true });
    }

    console.log("[Telegram Webhook] Message from chat:", chatId);
    console.log("[Telegram Webhook] Message text:", message.text);
    console.log("[Telegram Webhook] Reply to message:", JSON.stringify(message.reply_to_message, null, 2));

    const replyText: string | undefined = message.reply_to_message?.text;
    const replyCaption: string | undefined = message.reply_to_message?.caption;
    const fullReplyText = replyText || replyCaption || "";
    
    console.log("[Telegram Webhook] Full reply text:", fullReplyText);
    
    const transcriptId = extractTranscriptId(fullReplyText);

    console.log("[Telegram Webhook] Extracted transcript ID:", transcriptId);

    if (!transcriptId) {
      // Not a reply to one of our prompts; send a helpful message
      console.log("[Telegram Webhook] Not a reply to transcript notification");
      await sendTelegramMessage(
        chatId,
        "ℹ️ Please reply directly to a transcript notification message to link it to a client.\n\n" +
        "Or send a message starting with the transcript ID if you know it."
      );
      return NextResponse.json({ ok: true });
    }

    const transcript = await getTranscriptById(convex, transcriptId);
    if (!transcript) {
      await sendTelegramMessage(chatId, `⚠️ Could not find transcript ${transcriptId}. Please double-check the ID.`);
      return NextResponse.json({ ok: true });
    }

    const text: string = typeof message.text === "string" ? message.text.trim() : "";
    if (!text) {
      await sendTelegramMessage(chatId, "I couldn't read that message. Please provide the client name or email.");
      return NextResponse.json({ ok: true });
    }

    // Send initial acknowledgment
    await sendTelegramMessage(chatId, "⏳ Processing your request...");

    if (text.toLowerCase().includes("manual")) {
      const manualLink = manualBaseUrl
        ? `${manualBaseUrl.replace(/\/$/, "")}/resolve-transcript/${transcriptId}`
        : null;
      await convex.mutation(api.fireflies.recordLinkingAttempt, {
        transcriptId,
        linkingStatus: "needs_human",
        lastLinkAttemptAt: Date.now(),
        linkingHistoryEntry: {
          stage: "telegram",
          status: "no_match",
          timestamp: Date.now(),
          reason: "Operator requested manual handling via Telegram.",
        },
      });
      await sendTelegramMessage(
        chatId,
        manualLink
          ? `✅ Noted. You can complete the link manually here:\n${manualLink}`
          : "✅ Noted. We'll wait for manual linking in the dashboard."
      );
      return NextResponse.json({ ok: true });
    }

    await sendTelegramMessage(chatId, "🔍 Searching for matching client...");

    if (!transcript.email) {
      await sendTelegramMessage(chatId, "❌ This transcript doesn't have an associated email. Cannot match clients.");
      return NextResponse.json({ ok: true });
    }

    const clients = await getClientsForOwner(convex, transcript.email);
    if (!clients || clients.length === 0) {
      await sendTelegramMessage(chatId, "❌ I couldn't find any clients to match against. Please add the client first.");
      return NextResponse.json({ ok: true });
    }

    await sendTelegramMessage(chatId, `📋 Found ${clients.length} client(s). Matching against your input...`);

    const match = matchClientFromInput(text, clients);

    if (!match) {
      await sendTelegramMessage(
        chatId,
        `❌ *No Match Found*\n\nI couldn't map "${text}" to any existing client.\n\n` +
        `Please reply with:\n` +
        `• The exact business name\n` +
        `• The business email address\n` +
        `• Or reply "manual" to handle it manually`
      );
      
      await convex.mutation(api.fireflies.recordLinkingAttempt, {
        transcriptId,
        linkingStatus: "needs_human",
        lastLinkAttemptAt: Date.now(),
        linkingHistoryEntry: {
          stage: "telegram",
          status: "no_match",
          timestamp: Date.now(),
          reason: `Telegram reply "${text}" did not match any client.`,
        },
      });
      return NextResponse.json({ ok: true });
    }

    if ("multiple" in match) {
      const options = match.multiple
        .map((client) => `• ${client.businessName}${client.businessEmail ? ` (${client.businessEmail})` : ""}`)
        .join("\n");
      await sendTelegramMessage(
        chatId,
        `⚠️ I found multiple possible matches:\n${options}\n\nPlease reply with the exact business email to confirm.`
      );
      return NextResponse.json({ ok: true });
    }

    const target = match.client;
    
    await sendTelegramMessage(
      chatId,
      `✅ Found match: *${target.businessName}*\n🔗 Linking transcript...`
    );

    try {
      await convex.mutation(api.clients.linkTranscriptToClient, {
        transcriptId,
        clientId: target._id,
      });

      const attemptTimestamp = Date.now();
      await convex.mutation(api.fireflies.recordLinkingAttempt, {
        transcriptId,
        clientId: target._id,
        linkingStatus: "manually_linked",
        lastLinkAttemptAt: attemptTimestamp,
        linkingHistoryEntry: {
          stage: "telegram",
          status: "success",
          timestamp: attemptTimestamp,
          confidence: match.confidence,
          clientId: target._id,
          reason: `Linked to ${target.businessName} via Telegram reply: "${text}"`,
        },
      });

      const manualLink = manualBaseUrl
        ? `${manualBaseUrl.replace(/\/$/, "")}/resolve-transcript/${transcriptId}`
        : null;
      
      await sendTelegramMessage(
        chatId,
        `✅ *Success!*\n\nLinked transcript *${transcript.title}* to *${target.businessName}*.\n\n` +
        `📊 Confidence: ${(match.confidence * 100).toFixed(0)}%\n` +
        `📝 Reason: ${match.reason}\n\n` +
        (manualLink ? `View transcript: ${manualLink}` : "")
      );
    } catch (linkError) {
      const errorMsg = linkError instanceof Error ? linkError.message : String(linkError);
      console.error(`Failed to link transcript ${transcriptId} to client ${target._id}:`, linkError);
      
      await sendTelegramMessage(
        chatId,
        `❌ *Error*\n\nFailed to link transcript: ${errorMsg}\n\nPlease try again or use the manual link.`
      );
      
      // Record the error
      await convex.mutation(api.fireflies.recordLinkingAttempt, {
        transcriptId,
        linkingStatus: "needs_human",
        lastLinkAttemptAt: Date.now(),
        linkingHistoryEntry: {
          stage: "telegram",
          status: "error",
          timestamp: Date.now(),
          reason: `Link attempt failed: ${errorMsg}`,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[Telegram Webhook] Error:", err);
    console.error("[Telegram Webhook] Error stack:", err.stack);
    
    // Note: We can't re-read the request body here since it's already been consumed
    // But we've logged everything we need for debugging
    
    return NextResponse.json({ ok: false, error: err.message });
  }
}

