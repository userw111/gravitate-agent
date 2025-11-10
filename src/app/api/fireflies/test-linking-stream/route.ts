import { NextResponse } from "next/server";
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
  if (!convex) {
    return NextResponse.json({ error: "Convex not configured" }, { status: 500 });
  }

  const body = await request.json() as { email: string };
  const { email } = body;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      try {
        sendLog(controller, "🚀 Starting test transcript creation...", "info");
        
        sendLog(controller, "📝 Creating test transcript with dummy data...", "info");
        const testResult = await convex.action(api.firefliesActions.createTestTranscript, { email });
        
        sendLog(controller, `✅ Test transcript created: ${testResult.transcriptId}`, "success");
        
        if (testResult.status === "auto_linked") {
          sendLog(controller, `🎯 Auto-linked to client via participant email matching`, "success");
          sendLog(controller, `✅ Test complete: ${testResult.status}`, "success");
          sendLog(controller, "[DONE]", "success");
          controller.close();
          return;
        }

        sendLog(controller, "🤖 Auto-linking failed, triggering AI analysis...", "info");
        sendLog(controller, "   Analyzing transcript with GPT-5 (medium reasoning)...", "info");
        
        // Call the AI linking API route
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        sendLog(controller, `🔗 Calling AI linking service...`, "info");
        sendLog(controller, `   Fetching transcript and client data...`, "info");
        
        const linkingResponse = await fetch(`${baseUrl.replace(/\/$/, "")}/api/fireflies/process-linking`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            transcriptId: testResult.transcriptId,
          }),
        });

        if (!linkingResponse.ok) {
          const errorText = await linkingResponse.text();
          sendLog(controller, `❌ AI linking failed: ${errorText}`, "error");
          sendLog(controller, "[DONE]", "error");
          controller.close();
          return;
        }

        sendLog(controller, `   Sending analysis request to GPT-5...`, "info");
        sendLog(controller, `   Waiting for AI response...`, "info");
        
        const aiResult = (await linkingResponse.json()) as {
          status: string;
          confidence?: number;
          reason?: string;
          telegramSent?: boolean;
        };
        
        sendLog(controller, `   AI analysis complete`, "success");
        
        if (aiResult.status === "linked") {
          sendLog(controller, `✅ AI successfully linked transcript to client`, "success");
          sendLog(controller, `   Confidence: ${((aiResult.confidence || 0) * 100).toFixed(1)}%`, "info");
          sendLog(controller, `   Linking transcript in database...`, "info");
          sendLog(controller, `✅ Test complete: ${aiResult.status}`, "success");
        } else if (aiResult.status === "needs_human") {
          sendLog(controller, `⚠️ AI could not confidently link transcript`, "warning");
          sendLog(controller, `   AI Decision: No confident match found`, "info");
          sendLog(controller, `   Reason: ${aiResult.reason || "Unknown"}`, "info");
          
          if (aiResult.telegramSent) {
            sendLog(controller, `📱 Sending Telegram notification...`, "info");
            sendLog(controller, `📱 Telegram notification sent`, "success");
            sendLog(controller, `   Check your Telegram for the notification`, "info");
            sendLog(controller, `✅ Test complete: escalated_to_telegram`, "success");
          } else {
            sendLog(controller, `⚠️ Telegram not configured or failed to send`, "warning");
            sendLog(controller, `   Make sure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set`, "info");
            sendLog(controller, `✅ Test complete: ${testResult.status}`, "info");
          }
        } else {
          sendLog(controller, `✅ Test complete: ${aiResult.status}`, "info");
        }
        
        sendLog(controller, "[DONE]", "success");
        controller.close();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        sendLog(controller, `❌ Error: ${errorMessage}`, "error");
        sendLog(controller, "[DONE]", "error");
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
}

