import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";

export const getConfigForEmail = query({
  args: { email: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db
      .query("typeform_configs")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
  },
});

export const setSecretForEmail = mutation({
  args: { email: v.string(), secret: v.string() },
  handler: async (ctx: MutationCtx, args) => {
    const existing = await ctx.db
      .query("typeform_configs")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { secret: args.secret, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("typeform_configs", {
      email: args.email,
      secret: args.secret,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setAccessTokenForEmail = mutation({
  args: { email: v.string(), accessToken: v.string() },
  handler: async (ctx: MutationCtx, args) => {
    const existing = await ctx.db
      .query("typeform_configs")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { accessToken: args.accessToken, updatedAt: now });
      return existing._id;
    }
    // If config doesn't exist, create it with just the access token
    return await ctx.db.insert("typeform_configs", {
      email: args.email,
      accessToken: args.accessToken,
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
  handler: async (ctx: MutationCtx, args) => {
    // Check for duplicate payloads by comparing with existing webhooks for this email
    const existingWebhooks = await ctx.db
      .query("typeform_webhooks")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .collect();
    
    // Stringify the new payload for comparison
    const newPayloadString = JSON.stringify(args.payload);
    
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
      email: args.email,
      payload: args.payload,
      eventType: args.eventType,
      formId: args.formId,
      receivedAt: Date.now(),
    });
  },
});

export const getLatestWebhookForEmail = query({
  args: { email: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    const webhooks = await ctx.db
      .query("typeform_webhooks")
      .withIndex("by_email_received", (q) => q.eq("email", args.email))
      .order("desc")
      .take(1);
    return webhooks[0] ?? null;
  },
});

export const getLatestSyncedResponseForEmail = query({
  args: { email: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    const responses = await ctx.db
      .query("typeform_responses")
      .withIndex("by_email_synced", (q) => q.eq("email", args.email))
      .order("desc")
      .take(1);
    return responses[0] ?? null;
  },
});

export const getLatestActivityForEmail = query({
  args: { email: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    // Get latest webhook
    const webhooks = await ctx.db
      .query("typeform_webhooks")
      .withIndex("by_email_received", (q) => q.eq("email", args.email))
      .order("desc")
      .take(1);
    const latestWebhook = webhooks[0] ?? null;

    // Get latest synced response
    const responses = await ctx.db
      .query("typeform_responses")
      .withIndex("by_email_synced", (q) => q.eq("email", args.email))
      .order("desc")
      .take(1);
    const latestResponse = responses[0] ?? null;

    // Return the most recent one
    if (!latestWebhook && !latestResponse) {
      return null;
    }
    if (!latestWebhook) {
      return {
        type: "synced" as const,
        timestamp: latestResponse.syncedAt,
        formId: latestResponse.formId,
        payload: latestResponse.payload,
        responseId: latestResponse.responseId,
      };
    }
    if (!latestResponse) {
      return {
        type: "webhook" as const,
        timestamp: latestWebhook.receivedAt,
        formId: latestWebhook.formId,
        payload: latestWebhook.payload,
        eventType: latestWebhook.eventType,
      };
    }

    // Compare timestamps and return the most recent
    if (latestWebhook.receivedAt >= latestResponse.syncedAt) {
      return {
        type: "webhook" as const,
        timestamp: latestWebhook.receivedAt,
        formId: latestWebhook.formId,
        payload: latestWebhook.payload,
        eventType: latestWebhook.eventType,
      };
    } else {
      return {
        type: "synced" as const,
        timestamp: latestResponse.syncedAt,
        formId: latestResponse.formId,
        payload: latestResponse.payload,
        responseId: latestResponse.responseId,
      };
    }
  },
});

export const getResponseByResponseId = query({
  args: { responseId: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db
      .query("typeform_responses")
      .withIndex("by_response_id", (q) => q.eq("responseId", args.responseId))
      .first();
  },
});

export const storeResponse = mutation({
  args: {
    email: v.string(),
    formId: v.string(),
    responseId: v.string(),
    payload: v.any(),
  },
  handler: async (ctx: MutationCtx, args) => {
    return await ctx.db.insert("typeform_responses", {
      email: args.email,
      formId: args.formId,
      responseId: args.responseId,
      payload: args.payload,
      syncedAt: Date.now(),
    });
  },
});

export const getAllResponsesForEmail = query({
  args: { email: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    const responses = await ctx.db
      .query("typeform_responses")
      .withIndex("by_email_synced", (q) => q.eq("email", args.email))
      .order("desc")
      .collect();
    return responses;
  },
});



