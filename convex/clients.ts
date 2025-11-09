import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get all clients for an owner
 */
export const getAllClientsForOwner = query({
  args: { ownerEmail: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db
      .query("clients")
      .withIndex("by_owner", (q) => q.eq("ownerEmail", args.ownerEmail))
      .collect();
  },
});

/**
 * Get client by business email
 */
export const getClientByBusinessEmail = query({
  args: { ownerEmail: v.string(), businessEmail: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db
      .query("clients")
      .withIndex("by_owner_business_email", (q) =>
        q.eq("ownerEmail", args.ownerEmail).eq("businessEmail", args.businessEmail)
      )
      .unique();
  },
});

/**
 * Get client by ID
 */
export const getClientById = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db.get(args.clientId);
  },
});

export const getClientByOnboardingResponseId = query({
  args: { ownerEmail: v.string(), onboardingResponseId: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    const clients = await ctx.db
      .query("clients")
      .withIndex("by_owner", (q) => q.eq("ownerEmail", args.ownerEmail))
      .collect();
    
    return clients.find((client) => client.onboardingResponseId === args.onboardingResponseId);
  },
});

/**
 * Create or update a client from Typeform response
 */
export const upsertClientFromTypeform = mutation({
  args: {
    ownerEmail: v.string(),
    businessEmail: v.string(),
    businessName: v.string(),
    contactFirstName: v.optional(v.string()),
    contactLastName: v.optional(v.string()),
    onboardingResponseId: v.optional(v.string()),
    targetRevenue: v.optional(v.number()),
  },
  handler: async (ctx: MutationCtx, args) => {
    const existing = await ctx.db
      .query("clients")
      .withIndex("by_owner_business_email", (q) =>
        q.eq("ownerEmail", args.ownerEmail).eq("businessEmail", args.businessEmail)
      )
      .unique();

    const now = Date.now();
    const updateData: {
      businessName: string;
      contactFirstName?: string;
      contactLastName?: string;
      onboardingResponseId?: string;
      targetRevenue?: number;
      updatedAt: number;
    } = {
      businessName: args.businessName,
      contactFirstName: args.contactFirstName,
      contactLastName: args.contactLastName,
      updatedAt: now,
    };

    if (args.onboardingResponseId !== undefined) {
      updateData.onboardingResponseId = args.onboardingResponseId;
    }
    if (args.targetRevenue !== undefined) {
      updateData.targetRevenue = args.targetRevenue;
    }

    if (existing) {
      await ctx.db.patch(existing._id, updateData);
      return existing._id;
    }

    return await ctx.db.insert("clients", {
      ownerEmail: args.ownerEmail,
      businessEmail: args.businessEmail,
      businessName: args.businessName,
      contactFirstName: args.contactFirstName,
      contactLastName: args.contactLastName,
      onboardingResponseId: args.onboardingResponseId,
      targetRevenue: args.targetRevenue,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Find client by participant email (for auto-linking transcripts)
 */
export const findClientByParticipantEmail = query({
  args: { ownerEmail: v.string(), participantEmail: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    // Normalize email for comparison (lowercase)
    const normalizedEmail = args.participantEmail.toLowerCase().trim();
    
    // Try exact match first
    const exactMatch = await ctx.db
      .query("clients")
      .withIndex("by_owner_business_email", (q) =>
        q.eq("ownerEmail", args.ownerEmail).eq("businessEmail", normalizedEmail)
      )
      .unique();
    
    if (exactMatch) {
      return exactMatch;
    }
    
    // If no exact match, return null (could extend to fuzzy matching later)
    return null;
  },
});

/**
 * Link a transcript to a client
 */
export const linkTranscriptToClient = mutation({
  args: {
    transcriptId: v.string(),
    clientId: v.id("clients"),
  },
  handler: async (ctx: MutationCtx, args) => {
    const transcript = await ctx.db
      .query("fireflies_transcripts")
      .withIndex("by_transcript_id", (q) => q.eq("transcriptId", args.transcriptId))
      .first();

    if (!transcript) {
      throw new Error(`Transcript not found: ${args.transcriptId}`);
    }

    await ctx.db.patch(transcript._id, {
      clientId: args.clientId,
    });

    return transcript._id;
  },
});

/**
 * Unlink a transcript from a client
 */
export const unlinkTranscriptFromClient = mutation({
  args: {
    transcriptId: v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
    const transcript = await ctx.db
      .query("fireflies_transcripts")
      .withIndex("by_transcript_id", (q) => q.eq("transcriptId", args.transcriptId))
      .first();

    if (!transcript) {
      throw new Error(`Transcript not found: ${args.transcriptId}`);
    }

    await ctx.db.patch(transcript._id, {
      clientId: undefined,
    });

    return transcript._id;
  },
});

/**
 * Link a Typeform response to a client (by updating client's onboardingResponseId)
 */
export const linkResponseToClient = mutation({
  args: {
    clientId: v.id("clients"),
    responseId: v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client) {
      throw new Error(`Client not found: ${args.clientId}`);
    }

    await ctx.db.patch(args.clientId, {
      onboardingResponseId: args.responseId,
      updatedAt: Date.now(),
    });

    return args.clientId;
  },
});

