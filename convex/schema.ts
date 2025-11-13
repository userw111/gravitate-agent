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
    businessEmails: v.optional(v.array(v.string())), // Multiple emails associated with the client
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
    notes: v.optional(v.string()), // Notes/observations about the client
    
    // Cron job configuration (per-client override)
    // Not used directly - cron jobs are calculated as: 25 days, then 30 days later, then monthly
    // This field is kept for backwards compatibility but the schedule is fixed
    cronJobSchedule: v.optional(v.array(v.number())), // Deprecated - schedule is fixed: 25d, then 30d, then monthly
    cronJobEnabled: v.optional(v.boolean()), // Whether cron jobs are enabled for this client
    // Optional pause window; when set, UI can indicate resume time
    pausedUntil: v.optional(v.number()),
    
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
    // Optional structured sentences preserving speaker labels
    sentences: v.optional(
      v.array(
        v.object({
          text: v.string(),
          speakerName: v.optional(v.string()),
          speakerId: v.optional(v.string()),
        })
      )
    ),
    date: v.number(),
    duration: v.optional(v.number()),
    participants: v.optional(v.array(v.string())),
    syncedAt: v.number(),
    // Link to client
    clientId: v.optional(v.id("clients")),
    linkingStatus: v.optional(
      v.union(
        v.literal("unlinked"),
        v.literal("auto_linked"),
        v.literal("ai_pending"),
        v.literal("ai_linked"),
        v.literal("needs_human"),
        v.literal("manually_linked")
      )
    ),
    lastLinkAttemptAt: v.optional(v.number()),
    linkingHistory: v.optional(
      v.array(
        v.object({
          stage: v.string(),
          status: v.union(v.literal("success"), v.literal("no_match"), v.literal("error")),
          timestamp: v.number(),
          confidence: v.optional(v.number()),
          clientId: v.optional(v.id("clients")),
          reason: v.optional(v.string()),
        })
      )
    ),
  })
    .index("by_email", ["email"])
    .index("by_email_synced", ["email", "syncedAt"])
    .index("by_transcript_id", ["transcriptId"])
    .index("by_meeting_id", ["meetingId"])
    .index("by_client", ["clientId"])
    .index("by_email_unlinked", ["email", "clientId"]), // For finding unlinked transcripts
  scripts: defineTable({
    ownerEmail: v.string(),
    clientId: v.id("clients"),
    title: v.string(),
    contentHtml: v.string(), // HTML content matching TipTap format
    source: v.object({
      type: v.union(v.literal("typeform"), v.literal("manual"), v.literal("cron")),
      responseId: v.optional(v.string()), // For typeform source
      cronJobId: v.optional(v.string()), // For future cron jobs
    }),
    model: v.optional(v.string()), // Model used for generation (e.g., "openai/gpt-5")
    thinkingEffort: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    status: v.union(v.literal("draft"), v.literal("final")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_client", ["clientId", "createdAt"])
    .index("by_owner", ["ownerEmail", "createdAt"])
    .index("by_source_response", ["source.responseId"]),
  script_settings: defineTable({
    email: v.string(),
    defaultModel: v.optional(v.string()), // Default model for script generation
    defaultThinkingEffort: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    // Feature flags / preferences
    autoGenerateOnSync: v.optional(v.boolean()),
    // A publicly reachable base URL for the Next.js app, used by Convex actions
    publicAppUrl: v.optional(v.string()),
    // Cron job template: fixed schedule pattern
    // Pattern: immediate, then 25 days, then 30 days later (which becomes monthly recurring day)
    // This field is kept for backwards compatibility but the schedule is fixed
    cronJobTemplate: v.optional(v.array(v.number())), // Deprecated - schedule is fixed: 25d, then 30d, then monthly
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),
  script_generation_runs: defineTable({
    ownerEmail: v.string(),
    responseId: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    // high-level status of the run
    status: v.union(
      v.literal("queued"),
      v.literal("started"),
      v.literal("generating"),
      v.literal("storing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    error: v.optional(v.string()),
    // steps timeline for detailed visibility
    steps: v.optional(v.array(v.object({
      name: v.string(),
      status: v.union(v.literal("pending"), v.literal("running"), v.literal("success"), v.literal("error")),
      timestamp: v.number(),
      detail: v.optional(v.string()),
    }))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerEmail", "createdAt"])
    .index("by_owner_response", ["ownerEmail", "responseId"]),
  cron_jobs: defineTable({
    ownerEmail: v.string(),
    clientId: v.id("clients"),
    cronJobId: v.string(), // Cloudflare cron job ID
    scheduledTime: v.number(), // Unix timestamp when this job should run
    dayOfMonth: v.number(), // Day of month (1-31) for this job
    isRepeating: v.boolean(), // Whether this is a repeating monthly job
    status: v.union(
      v.literal("scheduled"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_client", ["clientId"])
    .index("by_owner", ["ownerEmail"])
    .index("by_scheduled_time", ["scheduledTime"])
    .index("by_status", ["status"])
    .index("by_cron_id", ["cronJobId"]),
  google_drive_configs: defineTable({
    email: v.string(),
    accessToken: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    tokenExpiry: v.optional(v.number()), // Unix timestamp when access token expires
    userEmail: v.optional(v.string()), // Google account email
    userName: v.optional(v.string()), // Google account display name
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),
});


