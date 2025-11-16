import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

export const getBriefingForClient = query({
  args: {
    ownerEmail: v.string(),
    clientId: v.id("clients"),
  },
  handler: async (ctx: QueryCtx, args) => {
    const existing = await ctx.db
      .query("ad_briefings")
      .withIndex("by_owner_client", (q) =>
        q.eq("ownerEmail", args.ownerEmail).eq("clientId", args.clientId),
      )
      .unique();

    return existing;
  },
});

export const upsertBriefing = mutation({
  args: {
    ownerEmail: v.string(),
    clientId: v.id("clients"),
    briefing: v.any(),
  },
  handler: async (ctx: MutationCtx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("ad_briefings")
      .withIndex("by_owner_client", (q) =>
        q.eq("ownerEmail", args.ownerEmail).eq("clientId", args.clientId),
      )
      .unique();

    // Get organizationId from client
    const client = await ctx.db.get(args.clientId);
    if (!client || !client.organizationId) {
      throw new Error("Client not found or missing organization");
    }

    if (existing) {
      await ctx.db.patch(existing._id as Id<"ad_briefings">, {
        organizationId: client.organizationId, // Ensure organizationId is set
        briefing: args.briefing,
        updatedAt: now,
      });
      return existing._id;
    }

    const id = await ctx.db.insert("ad_briefings", {
      organizationId: client.organizationId,
      ownerEmail: args.ownerEmail,
      clientId: args.clientId,
      briefing: args.briefing,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

/**
 * Migration: Fix existing ad_briefings records missing organizationId
 * This should be run once to fix existing records
 */
export const migrateAdBriefingsOrganizationId = mutation({
  args: {},
  handler: async (ctx: MutationCtx) => {
    // Get all ad_briefings records
    const allBriefings = await ctx.db.query("ad_briefings").collect();
    
    let fixed = 0;
    let errors = 0;
    
    for (const briefing of allBriefings) {
      // Skip if already has organizationId
      if (briefing.organizationId) {
        continue;
      }
      
      // Get organizationId from client
      const client = await ctx.db.get(briefing.clientId);
      if (!client || !client.organizationId) {
        console.error(`Client not found or missing organization for briefing ${briefing._id}`);
        errors++;
        continue;
      }
      
      // Update the briefing with organizationId
      await ctx.db.patch(briefing._id, {
        organizationId: client.organizationId,
        updatedAt: Date.now(),
      });
      
      fixed++;
    }
    
    return {
      total: allBriefings.length,
      fixed,
      errors,
    };
  },
});


