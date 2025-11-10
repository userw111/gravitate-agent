import { getCurrentUser } from "@/lib/auth";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await request.json() as {
      query?: string;
      limit?: number;
    };

    if (!convex) {
      return new Response(
        JSON.stringify({ error: "Server configuration error: Convex not configured" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const query = typeof body.query === "string" ? body.query : "";
    const requestedLimit = typeof body.limit === "number" ? body.limit : undefined;
    const defaultLimit = query.trim() ? 10 : 100;
    const effectiveLimit = Math.min(Math.max(requestedLimit ?? defaultLimit, 1), 200);

    // Search for clients
    const clients = await convex.query(api.clients.searchClients, {
      ownerEmail: user.email,
      query: query || undefined,
      limit: effectiveLimit,
    });

    // Enrich with transcript counts and recent activity
    const enrichedClients = await Promise.all(
      clients.map(async (client: typeof clients[0]) => {
        // Get transcript count for this client
        const transcripts = await convex.query(api.fireflies.getTranscriptsForClient, {
          clientId: client._id,
        });

        // Get onboarding response if available
        let onboardingData = null;
        if (client.onboardingResponseId) {
          try {
            const response = await convex.query(api.typeform.getResponseByResponseId, {
              responseId: client.onboardingResponseId,
            });
            onboardingData = response;
          } catch (e) {
            // Response might not exist, ignore
          }
        }

        return {
          id: client._id,
          businessName: client.businessName,
          businessEmail: client.businessEmail,
          contactName: client.contactFirstName && client.contactLastName
            ? `${client.contactFirstName} ${client.contactLastName}`
            : client.contactFirstName || client.contactLastName || null,
          status: client.status || "inactive",
          targetRevenue: client.targetRevenue,
          createdAt: client.createdAt,
          updatedAt: client.updatedAt,
          transcriptCount: transcripts.length,
          lastTranscriptDate: transcripts.length > 0
            ? transcripts[0].date
            : null,
          hasOnboardingData: !!onboardingData,
        };
      })
    );

    return new Response(JSON.stringify({ clients: enrichedClients }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[Client Lookup Tool] Error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to search clients" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

