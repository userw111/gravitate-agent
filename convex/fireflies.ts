import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";

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
  },
  handler: async (ctx: MutationCtx, args) => {
    // Check if transcript already exists
    const existing = await ctx.db
      .query("fireflies_transcripts")
      .withIndex("by_transcript_id", (q) => q.eq("transcriptId", args.transcriptId))
      .first();
    
    if (existing) {
      // Update existing transcript
      await ctx.db.patch(existing._id, {
        title: args.title,
        transcript: args.transcript,
        date: args.date,
        duration: args.duration,
        participants: args.participants,
        syncedAt: Date.now(),
      });
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
    });
  },
});

