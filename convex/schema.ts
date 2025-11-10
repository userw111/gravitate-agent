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
    // Form questions/fields structure
    questions: v.optional(v.array(v.object({
      id: v.string(),
      ref: v.string(),
      title: v.string(),
      type: v.string(),
    }))),
    // Question-Answer pairs
    qaPairs: v.optional(v.array(v.object({
      question: v.string(),
      answer: v.string(),
      fieldRef: v.optional(v.string()),
    }))),
  })
    .index("by_email", ["email"])
    .index("by_email_form", ["email", "formId"])
    .index("by_email_synced", ["email", "syncedAt"])
    .index("by_response_id", ["responseId"]),
  fireflies_configs: defineTable({
    email: v.string(),
    apiKey: v.optional(v.string()),
    webhookSecret: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),
  fireflies_webhooks: defineTable({
    email: v.string(),
    payload: v.any(),
    eventType: v.optional(v.string()),
    meetingId: v.optional(v.string()),
    transcriptId: v.optional(v.string()),
    receivedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_email_received", ["email", "receivedAt"]),
  clients: defineTable({
    // Platform owner (your client)
    ownerEmail: v.string(),
    
    // Business identification (from Typeform)
    businessEmail: v.optional(v.string()), // Primary identifier - email from onboarding
    businessName: v.string(),
    contactFirstName: v.optional(v.string()),
    contactLastName: v.optional(v.string()),
    
    // Onboarding data reference
    onboardingResponseId: v.optional(v.string()), // Links to typeform_responses.responseId
    
    // Business metadata
    targetRevenue: v.optional(v.number()),
    status: v.optional(v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("inactive")
    )),
    
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerEmail"])
    .index("by_business_email", ["businessEmail"])
    .index("by_owner_business_email", ["ownerEmail", "businessEmail"]),
  fireflies_transcripts: defineTable({
    email: v.string(), // Platform owner email
    transcriptId: v.string(),
    meetingId: v.string(),
    title: v.string(),
    transcript: v.string(),
    date: v.number(),
    duration: v.optional(v.number()),
    participants: v.optional(v.array(v.string())),
    syncedAt: v.number(),
    // Link to client
    clientId: v.optional(v.id("clients")),
  })
    .index("by_email", ["email"])
    .index("by_email_synced", ["email", "syncedAt"])
    .index("by_transcript_id", ["transcriptId"])
    .index("by_meeting_id", ["meetingId"])
    .index("by_client", ["clientId"])
    .index("by_email_unlinked", ["email", "clientId"]), // For finding unlinked transcripts
});


