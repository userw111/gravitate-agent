import { getCurrentUser } from "@/lib/auth";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

type MatchingStrategy = "participants_email" | "title_fuzzy" | "both";

interface MatchResult {
  transcriptId: string;
  transcriptTitle: string;
  clientId: string | null;
  clientName: string | null;
  matchReason: string;
  confidence: "high" | "medium" | "low";
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

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

function fuzzyMatch(str1: string, str2: string): boolean {
  const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, "");
  const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, "");
  return s1.includes(s2) || s2.includes(s1) || s1 === s2;
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!convex) {
      return new Response(
        JSON.stringify({ error: "Server configuration error: Convex not configured" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const body = await request.json() as {
      dryRun: boolean;
      limit?: number;
      strategy?: MatchingStrategy;
    };

    const { dryRun = true, limit = 50, strategy = "both" } = body;
    const maxLimit = Math.min(Math.max(limit, 1), 200);

    // Get unlinked transcripts (without full transcript text to save tokens)
    const transcriptsRaw = await convex.query(api.database.readTable, {
      table: "fireflies_transcripts",
      ownerEmail: user.email,
      filters: { unlinked: true },
      limit: maxLimit,
      includeTranscript: false,
    });
    // Narrow the type to the fields we actually use in this endpoint
    const transcripts = transcriptsRaw as Array<{
      transcriptId: string;
      title?: string;
      participants?: string[];
    }>;

    if (transcripts.length === 0) {
      return new Response(
        JSON.stringify({
          dryRun,
          matched: [],
          unmatched: [],
          summary: {
            total: 0,
            matched: 0,
            unmatched: 0,
            executed: 0,
          },
          message: "No unlinked transcripts found",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Get all clients
    const clients = await convex.query(api.clients.searchClients, {
      ownerEmail: user.email,
      query: "",
      limit: 200,
    });

    type ClientRecord = (typeof clients)[number];

    interface ClientMetadata {
      client: ClientRecord;
      emailNormalized: string | null;
      domain: string | null;
      domainKey: string | null;
      businessKey: string | null;
    }

    const clientMetadata: ClientMetadata[] = clients.map((client) => {
      const emailNormalized = client.businessEmail ? normalizeEmail(client.businessEmail) : null;
      const domain = client.businessEmail ? extractDomain(client.businessEmail) : null;
      const domainKey = domain ? getDomainKey(domain) : null;
      const businessKey = client.businessName ? normalizeKey(client.businessName) : null;
      return {
        client,
        emailNormalized,
        domain,
        domainKey,
        businessKey,
      };
    });

    // Build lookup maps for fast matching
    const emailToClient = new Map<string, ClientMetadata>();
    const domainToClients = new Map<string, ClientMetadata[]>();
    const domainKeyToClients = new Map<string, ClientMetadata[]>();

    for (const meta of clientMetadata) {
      if (meta.emailNormalized) {
        emailToClient.set(meta.emailNormalized, meta);
      }
      if (meta.domain) {
        const existing = domainToClients.get(meta.domain);
        if (existing) {
          existing.push(meta);
        } else {
          domainToClients.set(meta.domain, [meta]);
        }
      }
      if (meta.domainKey) {
        const existingKey = domainKeyToClients.get(meta.domainKey);
        if (existingKey) {
          existingKey.push(meta);
        } else {
          domainKeyToClients.set(meta.domainKey, [meta]);
        }
      }
    }

    // Match transcripts to clients
    const matches: MatchResult[] = [];
    const unmatched: Array<{ transcriptId: string; transcriptTitle: string }> = [];

    for (const transcript of transcripts) {
      let bestMatch: { meta: ClientMetadata; reason: string; confidence: "high" | "medium" | "low" } | null = null;

      // Strategy: participants_email
      if (strategy === "participants_email" || strategy === "both") {
        if (transcript.participants && Array.isArray(transcript.participants)) {
          for (const participantEmail of transcript.participants) {
            const normalized = normalizeEmail(participantEmail);
            const meta = emailToClient.get(normalized);
            if (meta) {
              bestMatch = {
                meta,
                reason: `Participant email matches business email: ${participantEmail}`,
                confidence: "high",
              };
              break;
            }

            // Domain-based matching
            const domain = extractDomain(participantEmail);
            if (!domain) continue;

            const domainCandidates = domainToClients.get(domain);
            if (!bestMatch && domainCandidates && domainCandidates.length === 1) {
              const matchedMeta = domainCandidates[0];
              bestMatch = {
                meta: matchedMeta,
                reason: `Participant email domain "${domain}" matches client domain for ${matchedMeta.client.businessName || "client"}`,
                confidence: "high",
              };
              break;
            }

            const participantDomainKey = domain ? getDomainKey(domain) : null;

            if (!bestMatch && participantDomainKey) {
              const keyCandidates = domainKeyToClients.get(participantDomainKey);
              if (keyCandidates && keyCandidates.length > 0) {
                let selected: ClientMetadata | null = null;
                if (keyCandidates.length === 1) {
                  selected = keyCandidates[0];
                } else {
                  const filtered = keyCandidates.filter(
                    (candidate) =>
                      candidate.businessKey &&
                      (candidate.businessKey.includes(participantDomainKey) ||
                        participantDomainKey.includes(candidate.businessKey))
                  );
                  if (filtered.length === 1) {
                    selected = filtered[0];
                  }
                }

                if (selected) {
                  bestMatch = {
                    meta: selected,
                    reason: `Participant email domain "${domain}" aligns with client domain/name for ${selected.client.businessName || "client"}`,
                    confidence: keyCandidates.length === 1 ? "medium" : "low",
                  };
                  break;
                }
              }
            }

            if (!bestMatch && participantDomainKey) {
              const fuzzyMatches = clientMetadata.filter(
                (candidate) =>
                  candidate.businessKey &&
                  (candidate.businessKey.includes(participantDomainKey) ||
                    participantDomainKey.includes(candidate.businessKey))
              );

              if (fuzzyMatches.length === 1) {
                const [selected] = fuzzyMatches;
                bestMatch = {
                  meta: selected,
                  reason: `Participant email domain "${domain}" closely matches client name "${selected.client.businessName}"`,
                  confidence: "low",
                };
                break;
              }
            }
          }
        }
      }

      // Strategy: title_fuzzy
      if (!bestMatch && (strategy === "title_fuzzy" || strategy === "both")) {
        const transcriptTitle = transcript.title || "";
        for (const meta of clientMetadata) {
          const client = meta.client;
          if (client.businessName && fuzzyMatch(transcriptTitle, client.businessName)) {
            bestMatch = {
              meta,
              reason: `Title fuzzy match: "${transcriptTitle}" ≈ "${client.businessName}"`,
              confidence: "medium",
            };
            break;
          }
        }
      }

      if (bestMatch) {
        matches.push({
          transcriptId: transcript.transcriptId,
          transcriptTitle: transcript.title || "Untitled",
          clientId: bestMatch.meta.client._id,
          clientName: bestMatch.meta.client.businessName,
          matchReason: bestMatch.reason,
          confidence: bestMatch.confidence,
        });
      } else {
        unmatched.push({
          transcriptId: transcript.transcriptId,
          transcriptTitle: transcript.title || "Untitled",
        });
      }
    }

    // Execute links if not dry run
    let executed = 0;
    const executionResults: Array<{ transcriptId: string; success: boolean; error?: string }> = [];

    if (!dryRun && matches.length > 0) {
      for (const match of matches) {
        try {
          await convex.mutation(api.database.linkTranscriptToClient, {
            transcriptId: match.transcriptId,
            clientId: match.clientId as any,
            ownerEmail: user.email,
          });
          executed++;
          executionResults.push({ transcriptId: match.transcriptId, success: true });
        } catch (error: any) {
          executionResults.push({
            transcriptId: match.transcriptId,
            success: false,
            error: error.message || "Unknown error",
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        dryRun,
        matched: matches,
        unmatched,
        executionResults: dryRun ? undefined : executionResults,
        summary: {
          total: transcripts.length,
          matched: matches.length,
          unmatched: unmatched.length,
          executed,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("[Link Unlinked Transcripts Tool] Error:", err);
    return new Response(
      JSON.stringify({
        error: err.message || "Failed to process batch linking",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

