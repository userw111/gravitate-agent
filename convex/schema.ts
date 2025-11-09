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
  fireflies_configs: defineTable({
    email: v.string(),
    apiKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),
  fireflies_transcripts: defineTable({
    email: v.string(),
    transcriptId: v.string(),
    meetingId: v.string(),
    title: v.string(),
    transcript: v.string(),
    date: v.number(),
    duration: v.optional(v.number()),
    participants: v.optional(v.array(v.string())),
    syncedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_email_synced", ["email", "syncedAt"])
    .index("by_transcript_id", ["transcriptId"])
    .index("by_meeting_id", ["meetingId"]),
});


