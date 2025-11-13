import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { getCurrentUser } from "@/lib/auth";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!convex) {
      return NextResponse.json({ error: "Convex not configured" }, { status: 500 });
    }

    // Load all clients for owner
    const clients = await convex.query(api.clients.getAllClientsForOwner, {
      ownerEmail: user.email,
    });

    // Compute script counts per client
    const clientScriptCounts = await Promise.all(
      clients.map(async (c: any) => {
        const count = await convex.query(api.scripts.getScriptCountForClient, {
          clientId: c._id,
          ownerEmail: user.email,
        });
        return { clientId: c._id, count };
      })
    );

    const clientsWithScripts = clientScriptCounts.filter((c) => (c.count ?? 0) > 0).length;
    const clientsWithoutScripts = clients.length - clientsWithScripts;

    // Load typeform responses (using database read to avoid needing a custom query)
    const responsesRes = await convex.query(api.database.readTable, {
      table: "typeform_responses",
      ownerEmail: user.email,
      limit: 200,
    });
    const responses: Array<{ responseId: string }> = Array.isArray(responsesRes) ? responsesRes : (responsesRes as any)?.results ?? [];

    // Determine which responses have scripts
    let responsesWithScripts = 0;
    for (const r of responses) {
      if (!r?.responseId) continue;
      const s = await convex.query(api.scripts.getScriptByResponseId, {
        responseId: r.responseId,
        ownerEmail: user.email,
      });
      if (s) responsesWithScripts++;
    }
    const responsesWithoutScripts = Math.max(0, responses.length - responsesWithScripts);

    // Recent scripts (take latest 10 by querying all for each client and merging)
    // For simplicity and to avoid new queries, reuse getScriptsForClient and merge
    const recentScripts: any[] = [];
    for (const c of clients) {
      const scripts = await convex.query(api.scripts.getScriptsForClient, {
        clientId: c._id,
        ownerEmail: user.email,
      });
      if (Array.isArray(scripts)) {
        for (const s of scripts) {
          recentScripts.push({
            id: s._id,
            title: s.title,
            createdAt: s.createdAt,
            clientName: c.businessName,
          });
        }
      }
    }
    recentScripts.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const latest = recentScripts.slice(0, 10);

    // Load recent detailed runs
    const recentRuns = await convex.query(api.scriptGeneration.listRecentRuns, {
      ownerEmail: user.email,
      limit: 50,
    });

    return NextResponse.json({
      clients: {
        total: clients.length,
        withScripts: clientsWithScripts,
        withoutScripts: clientsWithoutScripts,
      },
      typeformResponses: {
        total: responses.length,
        withScripts: responsesWithScripts,
        withoutScripts: responsesWithoutScripts,
      },
      latestScripts: latest,
      runs: recentRuns,
      note: "Scripts are generated from Typeform responses. Transcripts do not automatically generate scripts.",
    });
  } catch (error) {
    console.error("[Status] Script generation status error:", error);
    return NextResponse.json({ error: "Failed to load status" }, { status: 500 });
  }
}


