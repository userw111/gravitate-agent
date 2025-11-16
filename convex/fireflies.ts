import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getOrganizationIdForEmail, getOrCreateOrganizationIdForEmail } from "./utils/organizations";

type LinkingHistoryEntry = {
  stage: string;
  status: "success" | "no_match" | "error";
  timestamp: number;
  confidence?: number;
  clientId?: Id<"clients">;
  reason?: string;
};

export const getConfigForEmail = query({
  args: { email: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    const organizationId = await getOrganizationIdForEmail(ctx, args.email);
    if (!organizationId) {
      return null;
    }
    return await ctx.db
      .query("fireflies_configs")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .unique();
  },
});

export const setApiKeyForEmail = mutation({
  args: { email: v.string(), apiKey: v.string() },
  handler: async (ctx: MutationCtx, args) => {
    const organizationId = await getOrCreateOrganizationIdForEmail(ctx, args.email);
    const existing = await ctx.db
      .query("fireflies_configs")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { apiKey: args.apiKey, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("fireflies_configs", {
      organizationId,
      email: args.email,
      apiKey: args.apiKey,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setWebhookSecretForEmail = mutation({
  args: { email: v.string(), webhookSecret: v.string() },
  handler: async (ctx: MutationCtx, args) => {
    const organizationId = await getOrCreateOrganizationIdForEmail(ctx, args.email);
    const existing = await ctx.db
      .query("fireflies_configs")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { webhookSecret: args.webhookSecret, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("fireflies_configs", {
      organizationId,
      email: args.email,
      webhookSecret: args.webhookSecret,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const storeWebhook = mutation({
  args: {
    email: v.string(),
    payload: v.any(),
    eventType: v.optional(v.string()),
    meetingId: v.optional(v.string()),
    transcriptId: v.optional(v.string()),
  },
  handler: async (ctx: MutationCtx, args) => {
    const organizationId = await getOrCreateOrganizationIdForEmail(ctx, args.email);
    return await ctx.db.insert("fireflies_webhooks", {
      organizationId,
      email: args.email,
      payload: args.payload,
      eventType: args.eventType,
      meetingId: args.meetingId,
      transcriptId: args.transcriptId,
      receivedAt: Date.now(),
    });
  },
});

export const getLatestWebhookForEmail = query({
  args: { email: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    const organizationId = await getOrganizationIdForEmail(ctx, args.email);
    if (!organizationId) {
      return null;
    }
    const webhooks = await ctx.db
      .query("fireflies_webhooks")
      .withIndex("by_organization_received", (q) => q.eq("organizationId", organizationId))
      .order("desc")
      .take(1);
    return webhooks[0] ?? null;
  },
});

export const getAllTranscriptsForEmail = query({
  args: { email: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    const organizationId = await getOrganizationIdForEmail(ctx, args.email);
    if (!organizationId) {
      return [];
    }
    const transcripts = await ctx.db
      .query("fireflies_transcripts")
      .withIndex("by_organization_synced", (q) => q.eq("organizationId", organizationId))
      .order("desc")
      .collect();
    return transcripts;
  },
});

/**
 * Get all unlinked transcripts for an owner
 */
export const getUnlinkedTranscriptsForEmail = query({
  args: { email: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    const organizationId = await getOrganizationIdForEmail(ctx, args.email);
    if (!organizationId) {
      return [];
    }
    // Get all transcripts for this owner
    const allTranscripts = await ctx.db
      .query("fireflies_transcripts")
      .withIndex("by_organization_synced", (q) => q.eq("organizationId", organizationId))
      .order("desc")
      .collect();
    
    // Filter to only unlinked transcripts
    return allTranscripts.filter((t) => !t.clientId);
  },
});

/**
 * Get all transcripts for a specific client
 */
export const getTranscriptsForClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx: QueryCtx, args) => {
    const transcripts = await ctx.db
      .query("fireflies_transcripts")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .collect();
    return transcripts;
  },
});

export const getTranscriptById = query({
  args: { transcriptId: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db
      .query("fireflies_transcripts")
      .withIndex("by_transcript_id", (q) => q.eq("transcriptId", args.transcriptId))
      .first();
  },
});

export const storeTranscript = mutation({
  args: {
    email: v.string(),
    transcriptId: v.string(),
    meetingId: v.string(),
    title: v.string(),
    transcript: v.string(),
    sentences: v.optional(
      v.array(
        v.object({
          text: v.string(),
          speakerName: v.optional(v.string()),
          speakerId: v.optional(v.string()),
        })
      )
    ),
    date: v.number(),
    duration: v.optional(v.number()),
    participants: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    linkingStatus: v.optional(
      v.union(
        v.literal("unlinked"),
        v.literal("auto_linked"),
        v.literal("ai_pending"),
        v.literal("ai_linked"),
        v.literal("needs_human"),
        v.literal("manually_linked")
      )
    ),
    lastLinkAttemptAt: v.optional(v.number()),
    linkingHistoryEntry: v.optional(
      v.object({
        stage: v.string(),
        status: v.union(v.literal("success"), v.literal("no_match"), v.literal("error")),
        timestamp: v.number(),
        confidence: v.optional(v.number()),
        clientId: v.optional(v.id("clients")),
        reason: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx: MutationCtx, args) => {
    // Check if transcript already exists
    const existing = await ctx.db
      .query("fireflies_transcripts")
      .withIndex("by_transcript_id", (q) => q.eq("transcriptId", args.transcriptId))
      .first();
    
    if (existing) {
      // Update existing transcript
      const updateData: {
        title: string;
        transcript: string;
        sentences?: Array<{ text: string; speakerName?: string; speakerId?: string }>;
        date: number;
        duration?: number;
        participants?: string[];
        notes?: string;
        syncedAt: number;
        clientId?: Id<"clients">;
        linkingStatus?: typeof args.linkingStatus;
        lastLinkAttemptAt?: number;
        linkingHistory?: LinkingHistoryEntry[];
      } = {
        title: args.title,
        transcript: args.transcript,
        sentences: args.sentences,
        date: args.date,
        duration: args.duration,
        participants: args.participants,
        notes: args.notes,
        syncedAt: Date.now(),
      };
      
      // Only update clientId if it's not already set (preserve manual links)
      if (args.clientId && !existing.clientId) {
        updateData.clientId = args.clientId;
      }
      if (args.linkingStatus) {
        updateData.linkingStatus = args.linkingStatus;
      }
      if (typeof args.lastLinkAttemptAt === "number") {
        updateData.lastLinkAttemptAt = args.lastLinkAttemptAt;
      }
      if (args.linkingHistoryEntry) {
        const history = Array.isArray(existing.linkingHistory)
          ? (existing.linkingHistory as LinkingHistoryEntry[]).slice()
          : [];
        history.push(args.linkingHistoryEntry as LinkingHistoryEntry);
        updateData.linkingHistory = history;
      }
      
      await ctx.db.patch(existing._id, updateData);
      return existing._id;
    }
    
    // Get organizationId from client or email
    let organizationId: Id<"organizations">;
    if (args.clientId) {
      const client = await ctx.db.get(args.clientId);
      if (!client || !client.organizationId) {
        throw new Error("Client not found or missing organization");
      }
      organizationId = client.organizationId;
    } else {
      organizationId = await getOrCreateOrganizationIdForEmail(ctx, args.email);
    }

    // Insert new transcript
    const record: {
      organizationId: Id<"organizations">;
      email: string;
      transcriptId: string;
      meetingId: string;
      title: string;
      transcript: string;
      sentences?: Array<{ text: string; speakerName?: string; speakerId?: string }>;
      date: number;
      duration?: number;
      participants?: string[];
      notes?: string;
      syncedAt: number;
      clientId?: Id<"clients">;
      linkingStatus?: typeof args.linkingStatus;
      lastLinkAttemptAt?: number;
      linkingHistory?: LinkingHistoryEntry[];
    } = {
      organizationId,
      email: args.email,
      transcriptId: args.transcriptId,
      meetingId: args.meetingId,
      title: args.title,
      transcript: args.transcript,
      sentences: args.sentences,
      date: args.date,
      duration: args.duration,
      participants: args.participants,
      notes: args.notes,
      syncedAt: Date.now(),
      clientId: args.clientId,
    };

    if (args.linkingStatus) {
      record.linkingStatus = args.linkingStatus;
    }
    if (typeof args.lastLinkAttemptAt === "number") {
      record.lastLinkAttemptAt = args.lastLinkAttemptAt;
    }
    if (args.linkingHistoryEntry) {
      record.linkingHistory = [args.linkingHistoryEntry as LinkingHistoryEntry];
    }
    
    return await ctx.db.insert("fireflies_transcripts", record);
  },
});

export const recordLinkingAttempt = mutation({
  args: {
    transcriptId: v.string(),
    linkingStatus: v.optional(
      v.union(
        v.literal("unlinked"),
        v.literal("auto_linked"),
        v.literal("ai_pending"),
        v.literal("ai_linked"),
        v.literal("needs_human"),
        v.literal("manually_linked")
      )
    ),
    lastLinkAttemptAt: v.optional(v.number()),
    linkingHistoryEntry: v.optional(
      v.object({
        stage: v.string(),
        status: v.union(v.literal("success"), v.literal("no_match"), v.literal("error")),
        timestamp: v.number(),
        confidence: v.optional(v.number()),
        clientId: v.optional(v.id("clients")),
        reason: v.optional(v.string()),
      })
    ),
    clientId: v.optional(v.id("clients")),
    overwriteClient: v.optional(v.boolean()),
  },
  handler: async (ctx: MutationCtx, args) => {
    const transcript = await ctx.db
      .query("fireflies_transcripts")
      .withIndex("by_transcript_id", (q) => q.eq("transcriptId", args.transcriptId))
      .first();

    if (!transcript) {
      throw new Error(`Transcript not found: ${args.transcriptId}`);
    }

    const update: {
      clientId?: Id<"clients">;
      linkingStatus?: typeof args.linkingStatus;
      lastLinkAttemptAt?: number;
      linkingHistory?: LinkingHistoryEntry[];
    } = {};

    if (
      args.clientId &&
      (!transcript.clientId || args.overwriteClient)
    ) {
      update.clientId = args.clientId;
    }

    if (args.linkingStatus) {
      update.linkingStatus = args.linkingStatus;
    }

    if (typeof args.lastLinkAttemptAt === "number") {
      update.lastLinkAttemptAt = args.lastLinkAttemptAt;
    }

    if (args.linkingHistoryEntry) {
      const history = Array.isArray(transcript.linkingHistory)
        ? (transcript.linkingHistory as LinkingHistoryEntry[]).slice()
        : [];
      history.push(args.linkingHistoryEntry as LinkingHistoryEntry);
      update.linkingHistory = history;
    }

    if (Object.keys(update).length === 0) {
      return transcript._id;
    }

    await ctx.db.patch(transcript._id, update);
    return transcript._id;
  },
});

