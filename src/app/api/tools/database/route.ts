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
      operation: "read" | "create" | "update" | "delete" | "link_transcript" | "link_response";
      table: string;
      id?: string;
      data?: unknown;
      filters?: unknown;
      limit?: number;
      includeTranscript?: boolean;
      // For linking operations
      transcriptId?: string;
      responseId?: string;
      clientId?: string;
    };

    const { operation, table, id, data, filters, limit, includeTranscript, transcriptId, responseId, clientId } = body;

    // Validate operation
    const validOperations = ["read", "create", "update", "delete", "link_transcript", "link_response"];
    if (!validOperations.includes(operation)) {
      return new Response(
        JSON.stringify({ error: `Invalid operation: ${operation}. Valid operations: ${validOperations.join(", ")}` }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    try {
      switch (operation) {
        case "read": {
          const results = await convex.query(api.database.readTable, {
            table,
            ownerEmail: user.email,
            filters,
            limit,
            includeTranscript: includeTranscript !== false, // Default to true
          });
          return new Response(JSON.stringify({ results }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        case "create": {
          if (!data) {
            return new Response(
              JSON.stringify({ error: "Data is required for create operation" }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              }
            );
          }
          const result = await convex.mutation(api.database.createRecord, {
            table,
            ownerEmail: user.email,
            data,
          });
          return new Response(JSON.stringify({ id: result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        case "update": {
          if (!id || !data) {
            return new Response(
              JSON.stringify({ error: "Id and data are required for update operation" }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              }
            );
          }
          const result = await convex.mutation(api.database.updateRecord, {
            table,
            id: id as any, // Type will be validated in Convex
            ownerEmail: user.email,
            data,
          });
          return new Response(JSON.stringify({ id: result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        case "delete": {
          if (!id) {
            return new Response(
              JSON.stringify({ error: "Id is required for delete operation" }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              }
            );
          }
          const result = await convex.mutation(api.database.deleteRecord, {
            table,
            id: id as any,
            ownerEmail: user.email,
          });
          return new Response(JSON.stringify({ id: result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        case "link_transcript": {
          if (!transcriptId || !clientId) {
            return new Response(
              JSON.stringify({ error: "transcriptId and clientId are required for link_transcript operation" }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              }
            );
          }
          
          // Resolve clientId if it's a businessEmail (not a Convex ID)
          let resolvedClientId = clientId;
          if (!clientId.startsWith("j") && clientId.includes("@")) {
            // Looks like an email, resolve to client ID
            const client = await convex.query(api.clients.getClientByBusinessEmail, {
              ownerEmail: user.email,
              businessEmail: clientId,
            });
            if (!client) {
              return new Response(
                JSON.stringify({ error: `Client not found with businessEmail: ${clientId}` }),
                {
                  status: 404,
                  headers: { "Content-Type": "application/json" },
                }
              );
            }
            resolvedClientId = client._id;
          }
          
          const result = await convex.mutation(api.database.linkTranscriptToClient, {
            transcriptId,
            clientId: resolvedClientId as any,
            ownerEmail: user.email,
          });
          return new Response(JSON.stringify({ id: result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        case "link_response": {
          if (!responseId || !clientId) {
            return new Response(
              JSON.stringify({ error: "responseId and clientId are required for link_response operation" }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              }
            );
          }
          
          // Resolve clientId if it's a businessEmail (not a Convex ID)
          let resolvedClientId = clientId;
          if (!clientId.startsWith("j") && clientId.includes("@")) {
            // Looks like an email, resolve to client ID
            const client = await convex.query(api.clients.getClientByBusinessEmail, {
              ownerEmail: user.email,
              businessEmail: clientId,
            });
            if (!client) {
              return new Response(
                JSON.stringify({ error: `Client not found with businessEmail: ${clientId}` }),
                {
                  status: 404,
                  headers: { "Content-Type": "application/json" },
                }
              );
            }
            resolvedClientId = client._id;
          }
          
          const result = await convex.mutation(api.database.linkResponseToClient, {
            responseId,
            clientId: resolvedClientId as any,
            ownerEmail: user.email,
          });
          return new Response(JSON.stringify({ id: result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        default:
          return new Response(
            JSON.stringify({ error: `Unsupported operation: ${operation}` }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
      }
    } catch (error: any) {
      console.error("[Database Tool] Error:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Database operation failed",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  } catch (err) {
    console.error("[Database Tool] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to process database operation" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

