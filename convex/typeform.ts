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

export const storeWebhook = mutation({
  args: {
    email: v.string(),
    payload: v.any(),
    eventType: v.optional(v.string()),
    formId: v.optional(v.string()),
  },
  handler: async (
    ctx: any,
    { email, payload, eventType, formId }: { email: string; payload: unknown; eventType?: string; formId?: string }
  ) => {
    // Check for duplicate payloads by comparing with existing webhooks for this email
    const existingWebhooks = await ctx.db
      .query("typeform_webhooks")
      .withIndex("by_email", (q: any) => q.eq("email", email))
      .collect();
    
    // Stringify the new payload for comparison
    const newPayloadString = JSON.stringify(payload);
    
    // Check if any existing webhook has the same payload
    for (const webhook of existingWebhooks) {
      const existingPayloadString = JSON.stringify(webhook.payload);
      if (existingPayloadString === newPayloadString) {
        // Duplicate found, return existing webhook ID without inserting
        return webhook._id;
      }
    }
    
    // No duplicate found, insert new webhook
    return await ctx.db.insert("typeform_webhooks", {
      email,
      payload,
      eventType,
      formId,
      receivedAt: Date.now(),
    });
  },
});

export const getLatestWebhookForEmail = query({
  args: { email: v.string() },
  handler: async (ctx: any, { email }: { email: string }) => {
    const webhooks = await ctx.db
      .query("typeform_webhooks")
      .withIndex("by_email_received", (q: any) => q.eq("email", email))
      .order("desc")
      .take(1);
    return webhooks[0] ?? null;
  },
});


