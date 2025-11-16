import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

/**
 * Get script generation settings for a user
 */
export const getSettingsForEmail = query({
  args: { email: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db
      .query("script_settings")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
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
    // Get or create organization for email
    let member = await ctx.db
      .query("organization_members")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    
    let organizationId: Id<"organizations">;
    if (member) {
      organizationId = member.organizationId;
    } else {
      // Create default organization for user inline
      const orgNow = Date.now();
      organizationId = await ctx.db.insert("organizations", {
        name: `${args.email.split("@")[0]}'s Organization`,
        createdAt: orgNow,
        updatedAt: orgNow,
      });
      await ctx.db.insert("organization_members", {
        organizationId,
        email: args.email,
        role: "owner",
        createdAt: orgNow,
        updatedAt: orgNow,
      });
    }
    
    const existing = await ctx.db
      .query("script_settings")
      .withIndex("by_email", (q) => q.eq("email", args.email))
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

