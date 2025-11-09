import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),
  typeform_configs: defineTable({
    email: v.string(),
    secret: v.optional(v.string()),
    accessToken: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),
  typeform_webhooks: defineTable({
    email: v.string(),
    payload: v.any(),
    eventType: v.optional(v.string()),
    formId: v.optional(v.string()),
    receivedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_email_received", ["email", "receivedAt"]),
  typeform_responses: defineTable({
    email: v.string(),
    formId: v.string(),
    responseId: v.string(),
    payload: v.any(),
    syncedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_email_form", ["email", "formId"])
    .index("by_email_synced", ["email", "syncedAt"])
    .index("by_response_id", ["responseId"]),
});


