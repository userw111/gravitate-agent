import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),
  typeform_configs: defineTable({
    email: v.string(),
    secret: v.string(),
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
});


