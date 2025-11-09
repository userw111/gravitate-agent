import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getConfigForEmail = query({
  args: { email: v.string() },
  handler: async (ctx: any, { email }: { email: string }) => {
    return await ctx.db
      .query("typeform_configs")
      .withIndex("by_email", (q: any) => q.eq("email", email))
      .unique();
  },
});

export const setSecretForEmail = mutation({
  args: { email: v.string(), secret: v.string() },
  handler: async (ctx: any, { email, secret }: { email: string; secret: string }) => {
    const existing = await ctx.db
      .query("typeform_configs")
      .withIndex("by_email", (q: any) => q.eq("email", email))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { secret, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("typeform_configs", {
      email,
      secret,
      createdAt: now,
      updatedAt: now,
    });
  },
});


