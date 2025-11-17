import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { getOrganizationIdForEmail, getOrCreateOrganizationIdForEmail } from "./utils/organizations";

export const getConfigForEmail = query({
  args: { email: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    const organizationId = await getOrganizationIdForEmail(ctx, args.email);
    if (!organizationId) {
      return null;
    }
    return await ctx.db
      .query("openrouter_configs")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .unique();
  },
});

export const setApiKeyForEmail = mutation({
  args: { email: v.string(), apiKey: v.string() },
  handler: async (ctx: MutationCtx, args) => {
    const organizationId = await getOrCreateOrganizationIdForEmail(ctx, args.email);
    const existing = await ctx.db
      .query("openrouter_configs")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { apiKey: args.apiKey, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("openrouter_configs", {
      organizationId,
      email: args.email,
      apiKey: args.apiKey,
      createdAt: now,
      updatedAt: now,
    });
  },
});

