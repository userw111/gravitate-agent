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
    // Note: businessEmail is now optional, so this query may not work for all cases
    // Consider using searchClients instead if businessEmail might be null
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
    businessEmail: v.optional(v.string()),
    businessName: v.string(),
    contactFirstName: v.optional(v.string()),
    contactLastName: v.optional(v.string()),
    onboardingResponseId: v.optional(v.string()),
    targetRevenue: v.optional(v.number()),
  },
  handler: async (ctx: MutationCtx, args) => {
    // If businessEmail is provided, try to find existing client by it
    let existing = null;
    if (args.businessEmail) {
      existing = await ctx.db
        .query("clients")
        .withIndex("by_owner_business_email", (q) =>
          q.eq("ownerEmail", args.ownerEmail).eq("businessEmail", args.businessEmail)
        )
        .unique();
    }

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
 * Retrieve all clients for an owner (used for intelligent transcript linking)
 */
export const getClientsForLinking = query({
  args: { ownerEmail: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db
      .query("clients")
      .withIndex("by_owner", (q) => q.eq("ownerEmail", args.ownerEmail))
      .collect();
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

/**
 * Update client's business email (for adding participant emails for auto-linking)
 */
export const updateClientEmail = mutation({
  args: {
    clientId: v.id("clients"),
    email: v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client) {
      throw new Error(`Client not found: ${args.clientId}`);
    }

    // Update businessEmail if it's not set, or set it to the new email
    // This allows auto-linking future transcripts with this email
    await ctx.db.patch(args.clientId, {
      businessEmail: args.email.toLowerCase().trim(),
      updatedAt: Date.now(),
    });

    return args.clientId;
  },
});

/**
 * Search clients by name, email, or business name
 * Used by AI chat tool for looking up client information
 */
export const searchClients = query({
  args: {
    ownerEmail: v.string(),
    query: v.optional(v.string()), // Search term (name, email, business name)
    limit: v.optional(v.number()),
  },
  handler: async (ctx: QueryCtx, args) => {
    const maxLimit = 200;
    const requestedLimit = args.limit ?? (args.query ? 10 : 100);
    const limit = Math.min(Math.max(requestedLimit, 1), maxLimit);

    const rawQuery = (args.query ?? "").trim();
    const statusMatch = rawQuery.match(/status:(active|paused|inactive)/i);
    const statusFilter = statusMatch ? (statusMatch[1].toLowerCase() as "active" | "paused" | "inactive") : null;
    const cleanedQuery = statusMatch ? rawQuery.replace(statusMatch[0], "").trim() : rawQuery;
    const searchTerm = cleanedQuery.toLowerCase();

    // Get all clients for the owner
    const allClients = await ctx.db
      .query("clients")
      .withIndex("by_owner", (q) => q.eq("ownerEmail", args.ownerEmail))
      .collect();

    // Filter clients that match the search term and status (if provided)
    const matchingClients = allClients
      .filter((client) => {
        const matchesStatus =
          !statusFilter ||
          (client.status ? client.status.toLowerCase() === statusFilter : statusFilter === "inactive");
        if (!matchesStatus) return false;

        if (!searchTerm) {
          return true;
        }

        const businessName = client.businessName?.toLowerCase() || "";
        const businessEmail = client.businessEmail?.toLowerCase() || "";
        const contactFirstName = client.contactFirstName?.toLowerCase() || "";
        const contactLastName = client.contactLastName?.toLowerCase() || "";
        const fullName = `${contactFirstName} ${contactLastName}`.trim();
        
        return (
          businessName.includes(searchTerm) ||
          businessEmail.includes(searchTerm) ||
          fullName.includes(searchTerm) ||
          contactFirstName.includes(searchTerm) ||
          contactLastName.includes(searchTerm)
        );
      })
      .sort((a, b) => {
        const aTimestamp = a.updatedAt ?? a.createdAt ?? 0;
        const bTimestamp = b.updatedAt ?? b.createdAt ?? 0;
        return bTimestamp - aTimestamp;
      })
      .slice(0, limit);

    return matchingClients;
  },
});

