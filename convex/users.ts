import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsertUser = mutation({
  args: { email: v.string() },
  handler: async (ctx: any, { email }: { email: string }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q: any) => q.eq("email", email))
      .unique();
    if (existing) return existing._id;
    const id = await ctx.db.insert("users", {
      email,
      createdAt: Date.now(),
    });
    return id;
  },
});

export const getUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx: any, { email }: { email: string }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q: any) => q.eq("email", email))
      .unique();
  },
});


