import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";

// Tables that are allowed for database operations
const ALLOWED_TABLES = [
  "clients",
  "fireflies_transcripts",
  "fireflies_webhooks",
  "typeform_responses",
  "typeform_webhooks",
  "users",
] as const;

type AllowedTable = typeof ALLOWED_TABLES[number];

// Tables that contain API keys - BLOCKED
const BLOCKED_TABLES = ["typeform_configs", "fireflies_configs"] as const;

function validateTable(table: string): table is AllowedTable {
  if (BLOCKED_TABLES.includes(table as any)) {
    throw new Error(`Access denied: Table '${table}' contains sensitive API keys`);
  }
  if (!ALLOWED_TABLES.includes(table as AllowedTable)) {
    throw new Error(`Invalid table: '${table}'. Allowed tables: ${ALLOWED_TABLES.join(", ")}`);
  }
  return true;
}

/**
 * Read data from a table
 */
export const readTable = query({
  args: {
    table: v.string(),
    ownerEmail: v.string(), // For filtering by owner
    filters: v.optional(v.any()), // Table-specific filters
    limit: v.optional(v.number()),
    includeTranscript: v.optional(v.boolean()), // For fireflies_transcripts: exclude full transcript text to save tokens
  },
  handler: async (ctx: QueryCtx, args) => {
    validateTable(args.table);
    const limit = Math.min(args.limit ?? 100, 200);
    const includeTranscript = args.includeTranscript !== false; // Default to true

    switch (args.table) {
      case "clients":
        return await ctx.db
          .query("clients")
          .withIndex("by_owner", (q) => q.eq("ownerEmail", args.ownerEmail))
          .order("desc")
          .take(limit);

      case "fireflies_transcripts":
        const transcripts = await ctx.db
          .query("fireflies_transcripts")
          .withIndex("by_email_synced", (q) => q.eq("email", args.ownerEmail))
          .order("desc")
          .collect();
        
        // Apply filters
        let filtered = transcripts;
        if (args.filters?.unlinked === true) {
          filtered = filtered.filter((t) => !t.clientId);
        }
        if (args.filters?.clientId) {
          filtered = filtered.filter((t) => t.clientId === args.filters.clientId);
        }
        
        const limited = filtered.slice(0, limit);
        
        // If includeTranscript is false, exclude the transcript field to save tokens
        if (!includeTranscript) {
          return limited.map((t) => ({
            _id: t._id,
            _creationTime: t._creationTime,
            email: t.email,
            transcriptId: t.transcriptId,
            meetingId: t.meetingId,
            title: t.title,
            // transcript: excluded
            date: t.date,
            duration: t.duration,
            participants: t.participants,
            syncedAt: t.syncedAt,
            clientId: t.clientId,
          }));
        }
        
        return limited;

      case "fireflies_webhooks":
        return await ctx.db
          .query("fireflies_webhooks")
          .withIndex("by_email_received", (q) => q.eq("email", args.ownerEmail))
          .order("desc")
          .take(limit);

      case "typeform_responses":
        const responses = await ctx.db
          .query("typeform_responses")
          .withIndex("by_email_synced", (q) => q.eq("email", args.ownerEmail))
          .order("desc")
          .collect();
        
        // Apply filters
        let filteredResponses = responses;
        if (args.filters?.unlinked === true) {
          // Get all clients to find linked responseIds
          const clients = await ctx.db
            .query("clients")
            .withIndex("by_owner", (q) => q.eq("ownerEmail", args.ownerEmail))
            .collect();
          const linkedResponseIds = new Set(
            clients
              .map((c) => c.onboardingResponseId)
              .filter((id): id is string => id !== undefined)
          );
          filteredResponses = filteredResponses.filter(
            (r) => !linkedResponseIds.has(r.responseId)
          );
        }
        
        return filteredResponses.slice(0, limit);

      case "typeform_webhooks":
        return await ctx.db
          .query("typeform_webhooks")
          .withIndex("by_email_received", (q) => q.eq("email", args.ownerEmail))
          .order("desc")
          .take(limit);

      case "users":
        return await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", args.ownerEmail))
          .collect();

      default:
        throw new Error(`Unsupported table: ${args.table}`);
    }
  },
});

/**
 * Create a new record in a table
 */
export const createRecord = mutation({
  args: {
    table: v.string(),
    ownerEmail: v.string(),
    data: v.any(),
  },
  handler: async (ctx: MutationCtx, args) => {
    validateTable(args.table);
    const now = Date.now();

    switch (args.table) {
      case "clients": {
        const clientId = await ctx.db.insert("clients", {
          ownerEmail: args.ownerEmail,
          businessEmail: args.data.businessEmail || undefined,
          businessName: args.data.businessName,
          contactFirstName: args.data.contactFirstName,
          contactLastName: args.data.contactLastName,
          onboardingResponseId: args.data.onboardingResponseId,
          targetRevenue: args.data.targetRevenue,
          status: args.data.status || "active",
          createdAt: now,
          updatedAt: now,
        });

        // Trigger script generation for new clients
        // Use scheduler to call the action asynchronously
        try {
          ctx.scheduler.runAfter(0, api.clients.triggerScriptGeneration, {
            clientId,
            ownerEmail: args.ownerEmail,
          });
        } catch (error) {
          // If scheduler is not available, log and continue
          // Script generation will be handled by the API route if needed
          console.warn(`[Script Generation] Failed to schedule script generation for client ${clientId}:`, error);
        }

        return clientId;
      }

      case "fireflies_transcripts":
        return await ctx.db.insert("fireflies_transcripts", {
          email: args.ownerEmail,
          transcriptId: args.data.transcriptId,
          meetingId: args.data.meetingId,
          title: args.data.title,
          transcript: args.data.transcript,
          date: args.data.date,
          duration: args.data.duration,
          participants: args.data.participants,
          syncedAt: now,
          clientId: args.data.clientId,
        });

      case "fireflies_webhooks":
        return await ctx.db.insert("fireflies_webhooks", {
          email: args.ownerEmail,
          payload: args.data.payload,
          eventType: args.data.eventType,
          meetingId: args.data.meetingId,
          transcriptId: args.data.transcriptId,
          receivedAt: now,
        });

      case "typeform_responses":
        return await ctx.db.insert("typeform_responses", {
          email: args.ownerEmail,
          formId: args.data.formId,
          responseId: args.data.responseId,
          payload: args.data.payload,
          syncedAt: now,
          questions: args.data.questions,
          qaPairs: args.data.qaPairs,
        });

      case "typeform_webhooks":
        return await ctx.db.insert("typeform_webhooks", {
          email: args.ownerEmail,
          payload: args.data.payload,
          eventType: args.data.eventType,
          formId: args.data.formId,
          receivedAt: now,
        });

      case "users":
        return await ctx.db.insert("users", {
          email: args.data.email,
          createdAt: now,
        });

      default:
        throw new Error(`Unsupported table: ${args.table}`);
    }
  },
});

/**
 * Update a record in a table
 */
export const updateRecord = mutation({
  args: {
    table: v.string(),
    id: v.string(), // Will be validated and cast per table
    ownerEmail: v.string(),
    data: v.any(),
  },
  handler: async (ctx: MutationCtx, args) => {
    validateTable(args.table);
    const now = Date.now();

    // Verify ownership for tables that require it
    switch (args.table) {
      case "clients": {
        const recordId = args.id as Id<"clients">;
        const record = await ctx.db.get(recordId);
        if (!record || record.ownerEmail !== args.ownerEmail) {
          throw new Error("Client not found or access denied");
        }
        await ctx.db.patch(recordId, {
          ...args.data,
          updatedAt: now,
        });
        return recordId;
      }

      case "fireflies_transcripts": {
        const recordId = args.id as Id<"fireflies_transcripts">;
        const transcript = await ctx.db.get(recordId);
        if (!transcript || transcript.email !== args.ownerEmail) {
          throw new Error("Transcript not found or access denied");
        }
        await ctx.db.patch(recordId, {
          ...args.data,
          syncedAt: now,
        });
        return recordId;
      }

      case "fireflies_webhooks": {
        const recordId = args.id as Id<"fireflies_webhooks">;
        const webhook = await ctx.db.get(recordId);
        if (!webhook || webhook.email !== args.ownerEmail) {
          throw new Error("Webhook not found or access denied");
        }
        await ctx.db.patch(recordId, args.data);
        return recordId;
      }

      case "typeform_responses": {
        const recordId = args.id as Id<"typeform_responses">;
        const response = await ctx.db.get(recordId);
        if (!response || response.email !== args.ownerEmail) {
          throw new Error("Response not found or access denied");
        }
        await ctx.db.patch(recordId, args.data);
        return recordId;
      }

      case "typeform_webhooks": {
        const recordId = args.id as Id<"typeform_webhooks">;
        const tfWebhook = await ctx.db.get(recordId);
        if (!tfWebhook || tfWebhook.email !== args.ownerEmail) {
          throw new Error("Webhook not found or access denied");
        }
        await ctx.db.patch(recordId, args.data);
        return recordId;
      }

      case "users": {
        const recordId = args.id as Id<"users">;
        const user = await ctx.db.get(recordId);
        if (!user || user.email !== args.ownerEmail) {
          throw new Error("User not found or access denied");
        }
        await ctx.db.patch(recordId, args.data);
        return recordId;
      }

      default:
        throw new Error(`Unsupported table: ${args.table}`);
    }
  },
});

/**
 * Delete a record from a table
 */
export const deleteRecord = mutation({
  args: {
    table: v.string(),
    id: v.string(), // Will be validated and cast per table
    ownerEmail: v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
    validateTable(args.table);

    // Verify ownership before deletion
    switch (args.table) {
      case "clients": {
        const recordId = args.id as Id<"clients">;
        const record = await ctx.db.get(recordId);
        if (!record || record.ownerEmail !== args.ownerEmail) {
          throw new Error("Client not found or access denied");
        }
        await ctx.db.delete(recordId);
        return recordId;
      }

      case "fireflies_transcripts": {
        const recordId = args.id as Id<"fireflies_transcripts">;
        const record = await ctx.db.get(recordId);
        if (!record || record.email !== args.ownerEmail) {
          throw new Error("Transcript not found or access denied");
        }
        await ctx.db.delete(recordId);
        return recordId;
      }

      case "fireflies_webhooks": {
        const recordId = args.id as Id<"fireflies_webhooks">;
        const record = await ctx.db.get(recordId);
        if (!record || record.email !== args.ownerEmail) {
          throw new Error("Webhook not found or access denied");
        }
        await ctx.db.delete(recordId);
        return recordId;
      }

      case "typeform_responses": {
        const recordId = args.id as Id<"typeform_responses">;
        const record = await ctx.db.get(recordId);
        if (!record || record.email !== args.ownerEmail) {
          throw new Error("Response not found or access denied");
        }
        await ctx.db.delete(recordId);
        return recordId;
      }

      case "typeform_webhooks": {
        const recordId = args.id as Id<"typeform_webhooks">;
        const record = await ctx.db.get(recordId);
        if (!record || record.email !== args.ownerEmail) {
          throw new Error("Webhook not found or access denied");
        }
        await ctx.db.delete(recordId);
        return recordId;
      }

      case "users": {
        const recordId = args.id as Id<"users">;
        const record = await ctx.db.get(recordId);
        if (!record || record.email !== args.ownerEmail) {
          throw new Error("User not found or access denied");
        }
        await ctx.db.delete(recordId);
        return recordId;
      }

      default:
        throw new Error(`Unsupported table: ${args.table}`);
    }
  },
});

/**
 * Link a transcript to a client (convenience operation)
 */
export const linkTranscriptToClient = mutation({
  args: {
    transcriptId: v.string(),
    clientId: v.id("clients"),
    ownerEmail: v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
    // Verify ownership
    const client = await ctx.db.get(args.clientId);
    if (!client || client.ownerEmail !== args.ownerEmail) {
      throw new Error("Client not found or access denied");
    }

    const transcript = await ctx.db
      .query("fireflies_transcripts")
      .withIndex("by_transcript_id", (q) => q.eq("transcriptId", args.transcriptId))
      .first();

    if (!transcript || transcript.email !== args.ownerEmail) {
      throw new Error("Transcript not found or access denied");
    }

    await ctx.db.patch(transcript._id, {
      clientId: args.clientId,
    });

    return transcript._id;
  },
});

/**
 * Link a Typeform response to a client (convenience operation)
 */
export const linkResponseToClient = mutation({
  args: {
    responseId: v.string(),
    clientId: v.id("clients"),
    ownerEmail: v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
    // Verify ownership
    const client = await ctx.db.get(args.clientId);
    if (!client || client.ownerEmail !== args.ownerEmail) {
      throw new Error("Client not found or access denied");
    }

    const response = await ctx.db
      .query("typeform_responses")
      .withIndex("by_response_id", (q) => q.eq("responseId", args.responseId))
      .first();

    if (!response || response.email !== args.ownerEmail) {
      throw new Error("Response not found or access denied");
    }

    await ctx.db.patch(args.clientId, {
      onboardingResponseId: args.responseId,
      updatedAt: Date.now(),
    });

    return args.clientId;
  },
});

