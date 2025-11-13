import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";

export const getConfigForEmail = query({
  args: { email: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db
      .query("google_drive_configs")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
  },
});

export const setTokensForEmail = mutation({
  args: {
    email: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    tokenExpiry: v.number(),
    userEmail: v.optional(v.string()),
    userName: v.optional(v.string()),
  },
  handler: async (ctx: MutationCtx, args) => {
    const existing = await ctx.db
      .query("google_drive_configs")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        tokenExpiry: args.tokenExpiry,
        userEmail: args.userEmail,
        userName: args.userName,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("google_drive_configs", {
      email: args.email,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      tokenExpiry: args.tokenExpiry,
      userEmail: args.userEmail,
      userName: args.userName,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const disconnectAccount = mutation({
  args: { email: v.string() },
  handler: async (ctx: MutationCtx, args) => {
    const existing = await ctx.db
      .query("google_drive_configs")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        accessToken: undefined,
        refreshToken: undefined,
        tokenExpiry: undefined,
        userEmail: undefined,
        userName: undefined,
        updatedAt: Date.now(),
      });
      return existing._id;
    }
    return null;
  },
});

