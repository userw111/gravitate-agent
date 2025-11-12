import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";

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
  },
  handler: async (ctx: MutationCtx, args) => {
    const existing = await ctx.db
      .query("script_settings")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    
    const now = Date.now();
    
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.defaultModel !== undefined && { defaultModel: args.defaultModel }),
        ...(args.defaultThinkingEffort !== undefined && { defaultThinkingEffort: args.defaultThinkingEffort }),
        updatedAt: now,
      });
      return existing._id;
    }
    
    return await ctx.db.insert("script_settings", {
      email: args.email,
      defaultModel: args.defaultModel,
      defaultThinkingEffort: args.defaultThinkingEffort,
      createdAt: now,
      updatedAt: now,
    });
  },
});

