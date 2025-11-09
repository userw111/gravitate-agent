import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

export const getConfigForEmail = query({
  args: { email: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db
      .query("fireflies_configs")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
  },
});

export const setApiKeyForEmail = mutation({
  args: { email: v.string(), apiKey: v.string() },
  handler: async (ctx: MutationCtx, args) => {
    const existing = await ctx.db
      .query("fireflies_configs")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { apiKey: args.apiKey, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("fireflies_configs", {
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
    const existing = await ctx.db
      .query("fireflies_configs")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { webhookSecret: args.webhookSecret, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("fireflies_configs", {
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
    return await ctx.db.insert("fireflies_webhooks", {
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
    const webhooks = await ctx.db
      .query("fireflies_webhooks")
      .withIndex("by_email_received", (q) => q.eq("email", args.email))
      .order("desc")
      .take(1);
    return webhooks[0] ?? null;
  },
});

export const getAllTranscriptsForEmail = query({
  args: { email: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    const transcripts = await ctx.db
      .query("fireflies_transcripts")
      .withIndex("by_email_synced", (q) => q.eq("email", args.email))
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
    // Get all transcripts for this owner
    const allTranscripts = await ctx.db
      .query("fireflies_transcripts")
      .withIndex("by_email_synced", (q) => q.eq("email", args.email))
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
    date: v.number(),
    duration: v.optional(v.number()),
    participants: v.optional(v.array(v.string())),
    clientId: v.optional(v.id("clients")),
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
        date: number;
        duration?: number;
        participants?: string[];
        syncedAt: number;
        clientId?: Id<"clients">;
      } = {
        title: args.title,
        transcript: args.transcript,
        date: args.date,
        duration: args.duration,
        participants: args.participants,
        syncedAt: Date.now(),
      };
      
      // Only update clientId if it's not already set (preserve manual links)
      if (args.clientId && !existing.clientId) {
        updateData.clientId = args.clientId;
      }
      
      await ctx.db.patch(existing._id, updateData);
      return existing._id;
    }
    
    // Insert new transcript
    return await ctx.db.insert("fireflies_transcripts", {
      email: args.email,
      transcriptId: args.transcriptId,
      meetingId: args.meetingId,
      title: args.title,
      transcript: args.transcript,
      date: args.date,
      duration: args.duration,
      participants: args.participants,
      syncedAt: Date.now(),
      clientId: args.clientId,
    });
  },
});

