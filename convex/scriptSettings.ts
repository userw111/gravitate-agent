import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

async function ensureOrganizationForEmail(ctx: MutationCtx, email: string): Promise<Id<"organizations">> {
  const existingMember = await ctx.db
    .query("organization_members")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();

  if (existingMember) {
    return existingMember.organizationId;
  }

  const now = Date.now();
  const organizationId = await ctx.db.insert("organizations", {
    name: `${email.split("@")[0]}'s Organization`,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("organization_members", {
    organizationId,
    email,
    role: "owner",
    createdAt: now,
    updatedAt: now,
  });

  return organizationId;
}

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
    
    const organizationId = await ensureOrganizationForEmail(ctx, args.email);

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

