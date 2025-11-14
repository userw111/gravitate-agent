import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

/**
 * Process AI linking for a transcript
 * This runs in Next.js so it can use NEXT_PUBLIC_* and other Next.js env vars
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      email: string;
      transcriptId: string;
    };

    const { email, transcriptId } = body;

    if (!convex) {
      return NextResponse.json(
        { error: "Convex not configured" },
        { status: 500 }
      );
    }

    // Get transcript
    const transcript = await convex.query(api.fireflies.getTranscriptById, {
      transcriptId,
    });

    if (!transcript) {
      return NextResponse.json(
        { error: "Transcript not found" },
        { status: 404 }
      );
    }

    if (transcript.clientId) {
      return NextResponse.json({
        status: "already_linked",
        transcriptId,
      });
    }

    // Get clients
    const clients = await convex.query(api.clients.getClientsForLinking, {
      ownerEmail: email,
    });

    if (clients.length === 0) {
      const attemptTimestamp = Date.now();
      await convex.mutation(api.fireflies.recordLinkingAttempt, {
        transcriptId,
        linkingStatus: "needs_human",
        lastLinkAttemptAt: attemptTimestamp,
        linkingHistoryEntry: {
          stage: "ai",
          status: "no_match",
          timestamp: attemptTimestamp,
          reason: "No clients available for matching.",
        },
      });
      return NextResponse.json({
        status: "needs_human",
        transcriptId,
        reason: "No clients available for matching.",
        confidence: 0,
      });
    }

    // Get OpenRouter API key from Convex (user-specific)
    const openrouterConfig = await convex.query(api.openrouter.getConfigForEmail, {
      email,
    });

    // Fallback to environment variable for backwards compatibility
    const apiKey = openrouterConfig?.apiKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "OpenRouter API key not configured. Please set it in Settings → OpenRouter.",
        },
        { status: 500 }
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
      `Owner email: ${email}`,
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

    const attemptTimestamp = Date.now();
    let aiResult: {
      decision: "link" | "no_link";
      clientId: string | null;
      confidence: number;
      reason: string;
    } | null = null;

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-5",
          temperature: 0.1,
          reasoning: {
            effort: "medium",
          },
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
      await convex.mutation(api.fireflies.recordLinkingAttempt, {
        transcriptId,
        linkingStatus: "needs_human",
        lastLinkAttemptAt: attemptTimestamp,
        linkingHistoryEntry: {
          stage: "ai",
          status: "error",
          timestamp: attemptTimestamp,
          reason: `AI invocation failed: ${err.message}`,
        },
      });
      return NextResponse.json({
        status: "needs_human",
        transcriptId,
        reason: `AI invocation failed: ${err.message}`,
        confidence: 0,
      });
    }

    if (!aiResult) {
      await convex.mutation(api.fireflies.recordLinkingAttempt, {
        transcriptId,
        linkingStatus: "needs_human",
        lastLinkAttemptAt: attemptTimestamp,
        linkingHistoryEntry: {
          stage: "ai",
          status: "error",
          timestamp: attemptTimestamp,
          reason: "AI result was empty after parsing.",
        },
      });
      return NextResponse.json({
        status: "needs_human",
        transcriptId,
        reason: "AI result was empty after parsing.",
        confidence: 0,
      });
    }

    console.log(`[AI Linking] Result:`, {
      decision: aiResult.decision,
      clientId: aiResult.clientId,
      confidence: aiResult.confidence,
      reason: aiResult.reason,
    });

    if (aiResult.decision === "link" && aiResult.clientId) {
      const targetClient = clients.find((client) => client._id === aiResult.clientId);
      if (targetClient && aiResult.confidence >= 0.75) {
        console.log(`[AI Linking] Linking transcript ${transcriptId} to client ${targetClient._id} with confidence ${aiResult.confidence}`);
        
        await convex.mutation(api.clients.linkTranscriptToClient, {
          transcriptId,
          clientId: targetClient._id,
        });

        await convex.mutation(api.fireflies.recordLinkingAttempt, {
          transcriptId,
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

        return NextResponse.json({
          status: "linked",
          transcriptId,
          clientId: targetClient._id,
          confidence: aiResult.confidence,
        });
      } else {
        console.log(`[AI Linking] Decision was "link" but confidence ${aiResult.confidence} < 0.75 or client not found, proceeding to Telegram escalation`);
      }
    } else {
      console.log(`[AI Linking] Decision was "${aiResult.decision}", proceeding to Telegram escalation`);
    }

    await convex.mutation(api.fireflies.recordLinkingAttempt, {
      transcriptId,
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

    // Escalate to Telegram if configured
    let telegramSent = false;
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      
      console.log(`[Telegram] Checking configuration: botToken=${!!botToken}, chatId=${!!chatId}`);
      
      if (!botToken || !chatId) {
        console.warn(`[Telegram] Not configured: botToken=${!!botToken}, chatId=${!!chatId}`);
      } else {
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

        const messageText = messageLines.join("\n");
        console.log(`[Telegram] Sending message to chat ${chatId}...`);

        const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: messageText,
            parse_mode: "Markdown",
            disable_web_page_preview: true,
          }),
        });

        if (!telegramResponse.ok) {
          const errorText = await telegramResponse.text();
          throw new Error(`Telegram API error: ${telegramResponse.status} - ${errorText}`);
        }

        const telegramData = (await telegramResponse.json()) as { ok: boolean; result?: unknown };
        if (!telegramData.ok) {
          throw new Error(`Telegram API returned error: ${JSON.stringify(telegramData)}`);
        }

        console.log(`[Telegram] Message sent successfully: ${JSON.stringify(telegramData.result)}`);
        telegramSent = true;

        await convex.mutation(api.fireflies.recordLinkingAttempt, {
          transcriptId,
          linkingStatus: "needs_human",
          lastLinkAttemptAt: attemptTimestamp,
          linkingHistoryEntry: {
            stage: "telegram",
            status: "success",
            timestamp: attemptTimestamp,
            reason: "Escalated to Telegram.",
          },
        });
      }
    } catch (notifyError) {
      const errorMessage = notifyError instanceof Error ? notifyError.message : String(notifyError);
      console.error(`[Telegram] Failed to send escalation for transcript ${transcriptId}:`, errorMessage);
      
      // Still record the attempt as failed
      try {
        await convex.mutation(api.fireflies.recordLinkingAttempt, {
          transcriptId,
          linkingStatus: "needs_human",
          lastLinkAttemptAt: attemptTimestamp,
          linkingHistoryEntry: {
            stage: "telegram",
            status: "error",
            timestamp: attemptTimestamp,
            reason: `Telegram send failed: ${errorMessage}`,
          },
        });
      } catch (recordError) {
        console.error(`[Telegram] Failed to record failed attempt:`, recordError);
      }
    }

    return NextResponse.json({
      status: "needs_human",
      transcriptId,
      reason: aiResult.reason,
      confidence: aiResult.confidence,
      telegramSent,
    });
  } catch (error) {
    console.error("Error processing AI linking:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

