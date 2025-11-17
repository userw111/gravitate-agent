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

    if (existing) {
      await ctx.db.patch(existing._id as Id<"ad_briefings">, {
        briefing: args.briefing,
        updatedAt: now,
      });
      return existing._id;
    }

    // Get organizationId from client
    const client = await ctx.db.get(args.clientId);
    if (!client || !client.organizationId) {
      throw new Error("Client not found or missing organization");
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


