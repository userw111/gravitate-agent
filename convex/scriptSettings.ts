import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { getOrganizationIdForEmail, getOrCreateOrganizationIdForEmail } from "./utils/organizations";

/**
 * Get script generation settings for a user
 */
export const getSettingsForEmail = query({
  args: { email: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    const organizationId = await getOrganizationIdForEmail(ctx, args.email);
    if (!organizationId) {
      return await ctx.db
        .query("script_settings")
        .withIndex("by_email", (q) => q.eq("email", args.email))
        .unique();
    }
    let settings = await ctx.db
      .query("script_settings")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .unique();

    if (!settings) {
      settings = await ctx.db
        .query("script_settings")
        .withIndex("by_email", (q) => q.eq("email", args.email))
        .unique();
    }

    return settings;
  },
});

/**
 * Update script generation settings
 */
export const updateSettings = mutation({
  args: {
    email: v.string(),
    defaultModel: v.optional(v.string()),
    defaultThinkingEffort: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    autoGenerateOnSync: v.optional(v.boolean()),
    publicAppUrl: v.optional(v.string()),
    cronJobTemplate: v.optional(v.array(v.number())), // e.g., [15] for 15th of every month, [5, 20] for 5th and 20th
  },
  handler: async (ctx: MutationCtx, args) => {
    const organizationId = await getOrCreateOrganizationIdForEmail(ctx, args.email);
    const existing = await ctx.db
      .query("script_settings")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .unique();
    
    const now = Date.now();
    
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.defaultModel !== undefined && { defaultModel: args.defaultModel }),
        ...(args.defaultThinkingEffort !== undefined && { defaultThinkingEffort: args.defaultThinkingEffort }),
        ...(args.autoGenerateOnSync !== undefined && { autoGenerateOnSync: args.autoGenerateOnSync }),
        ...(args.publicAppUrl !== undefined && { publicAppUrl: args.publicAppUrl }),
        ...(args.cronJobTemplate !== undefined && { cronJobTemplate: args.cronJobTemplate }),
        updatedAt: now,
      });
      return existing._id;
    }
    
    return await ctx.db.insert("script_settings", {
      organizationId,
      email: args.email,
      defaultModel: args.defaultModel,
      defaultThinkingEffort: args.defaultThinkingEffort,
      autoGenerateOnSync: args.autoGenerateOnSync,
      publicAppUrl: args.publicAppUrl,
      cronJobTemplate: args.cronJobTemplate,
      createdAt: now,
      updatedAt: now,
    });
  },
});

