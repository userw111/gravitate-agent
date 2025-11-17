import { mutation, query, QueryCtx, MutationCtx, action, ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * Get all clients for an owner
 */
export const getAllClientsForOwner = query({
  args: { ownerEmail: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db
      .query("clients")
      .withIndex("by_owner", (q) => q.eq("ownerEmail", args.ownerEmail))
      .collect();
  },
});

/**
 * Get client by business email
 */
export const getClientByBusinessEmail = query({
  args: { ownerEmail: v.string(), businessEmail: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    // Note: businessEmail is now optional, so this query may not work for all cases
    // Consider using searchClients instead if businessEmail might be null
    return await ctx.db
      .query("clients")
      .withIndex("by_owner_business_email", (q) =>
        q.eq("ownerEmail", args.ownerEmail).eq("businessEmail", args.businessEmail)
      )
      .unique();
  },
});

/**
 * Get client by ID
 */
export const getClientById = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db.get(args.clientId);
  },
});

export const getClientByOnboardingResponseId = query({
  args: { ownerEmail: v.string(), onboardingResponseId: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    const clients = await ctx.db
      .query("clients")
      .withIndex("by_owner", (q) => q.eq("ownerEmail", args.ownerEmail))
      .collect();
    
    return clients.find((client) => client.onboardingResponseId === args.onboardingResponseId);
  },
});

/**
 * Check for duplicate clients based on identifying information
 */
export const findDuplicateClient = query({
  args: {
    ownerEmail: v.string(),
    businessEmail: v.optional(v.string()),
    businessName: v.optional(v.string()),
    website: v.optional(v.string()),
  },
  handler: async (ctx: QueryCtx, args) => {
    const allClients = await ctx.db
      .query("clients")
      .withIndex("by_owner", (q) => q.eq("ownerEmail", args.ownerEmail))
      .collect();
    
    // Normalize inputs for comparison
    const normalizedBusinessEmail = args.businessEmail?.toLowerCase().trim();
    const normalizedBusinessName = args.businessName?.toLowerCase().trim();
    const normalizedWebsite = args.website?.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "");
    
    for (const client of allClients) {
      // Check business email match
      if (normalizedBusinessEmail && client.businessEmail) {
        if (client.businessEmail.toLowerCase().trim() === normalizedBusinessEmail) {
          return client;
        }
      }
      
      // Check business name match (case-insensitive)
      if (normalizedBusinessName && client.businessName) {
        if (client.businessName.toLowerCase().trim() === normalizedBusinessName) {
          return client;
        }
      }
      
      // Check website match (normalize URLs)
      if (normalizedWebsite && client.businessEmails) {
        // Check if any business email domain matches website
        for (const email of client.businessEmails) {
          const emailDomain = email.toLowerCase().trim().split("@")[1];
          if (emailDomain && normalizedWebsite.includes(emailDomain)) {
            return client;
          }
        }
      }
    }
    
    return null;
  },
});

/**
 * Create a manual client (not from Typeform)
 */
export const createManualClient = mutation({
  args: {
    ownerEmail: v.string(),
    businessEmail: v.optional(v.string()),
    businessName: v.string(),
    contactFirstName: v.optional(v.string()),
    contactLastName: v.optional(v.string()),
    targetRevenue: v.optional(v.number()),
    website: v.optional(v.string()),
    generateScriptImmediately: v.optional(v.boolean()),
    enableCronJobs: v.optional(v.boolean()),
    cronJobBaseTime: v.optional(v.number()), // Base time for calculating cron job schedule (defaults to now)
    skipFirstCronJob: v.optional(v.boolean()), // When true, skip the 25-day cron job and start at recurring schedule
    monthlyStartTime: v.optional(v.number()), // Custom start time for monthly schedule (when skipping 25-day)
  },
  handler: async (ctx: MutationCtx, args) => {
    // Check for duplicates first
    const duplicate = await ctx.db
      .query("clients")
      .withIndex("by_owner", (q) => q.eq("ownerEmail", args.ownerEmail))
      .collect()
      .then(clients => {
        const normalizedBusinessEmail = args.businessEmail?.toLowerCase().trim();
        const normalizedBusinessName = args.businessName?.toLowerCase().trim();
        const normalizedWebsite = args.website?.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "");
        
        for (const client of clients) {
          // Check business email match
          if (normalizedBusinessEmail && client.businessEmail) {
            if (client.businessEmail.toLowerCase().trim() === normalizedBusinessEmail) {
              return client;
            }
          }
          
          // Check business name match (case-insensitive)
          if (normalizedBusinessName && client.businessName) {
            if (client.businessName.toLowerCase().trim() === normalizedBusinessName) {
              return client;
            }
          }
          
          // Check website match
          if (normalizedWebsite && client.businessEmails) {
            for (const email of client.businessEmails) {
              const emailDomain = email.toLowerCase().trim().split("@")[1];
              if (emailDomain && normalizedWebsite.includes(emailDomain)) {
                return client;
              }
            }
          }
        }
        return null;
      });
    
    if (duplicate) {
      throw new Error(`A client with matching information already exists: ${duplicate.businessName}`);
    }
    
    // Get or create organization for owner
    let member = await ctx.db
      .query("organization_members")
      .withIndex("by_email", (q) => q.eq("email", args.ownerEmail))
      .first();
    
    let organizationId: Id<"organizations">;
    if (member) {
      organizationId = member.organizationId;
    } else {
      // Create default organization for user inline
      const now = Date.now();
      organizationId = await ctx.db.insert("organizations", {
        name: `${args.ownerEmail.split("@")[0]}'s Organization`,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organization_members", {
        organizationId,
        email: args.ownerEmail,
        role: "owner",
        createdAt: now,
        updatedAt: now,
      });
    }

    const now = Date.now();
    const clientId = await ctx.db.insert("clients", {
      organizationId,
      ownerEmail: args.ownerEmail,
      businessEmail: args.businessEmail?.toLowerCase().trim() || undefined,
      businessName: args.businessName,
      contactFirstName: args.contactFirstName,
      contactLastName: args.contactLastName,
      targetRevenue: args.targetRevenue,
      status: "active",
      cronJobEnabled: args.enableCronJobs !== false, // Default to true
      createdAt: now,
      updatedAt: now,
    });
    
    // Schedule cron jobs if enabled
    if (args.enableCronJobs !== false) {
      const baseTime = args.monthlyStartTime || args.cronJobBaseTime || now;
      const skipFirstJob = args.skipFirstCronJob === true;
      ctx.scheduler.runAfter(0, api.cronJobs.scheduleCronJobsForClient, {
        clientId,
        ownerEmail: args.ownerEmail,
        baseTime,
        skipFirstJob,
      }).catch((error) => {
        console.error(`[createManualClient] Failed to schedule cron jobs for client ${clientId}:`, error);
      });
    }
    
    // Trigger script generation if requested
    if (args.generateScriptImmediately) {
      ctx.scheduler.runAfter(0, api.clients.triggerScriptGeneration, {
        clientId,
        ownerEmail: args.ownerEmail,
      }).catch((error) => {
        console.error(`[createManualClient] Failed to trigger script generation for client ${clientId}:`, error);
      });
    }
    
    return clientId;
  },
});

/**
 * Create or update a client from Typeform response
 */
export const upsertClientFromTypeform = mutation({
  args: {
    ownerEmail: v.string(),
    businessEmail: v.optional(v.string()),
    businessName: v.string(),
    contactFirstName: v.optional(v.string()),
    contactLastName: v.optional(v.string()),
    onboardingResponseId: v.optional(v.string()),
    targetRevenue: v.optional(v.number()),
  },
  handler: async (ctx: MutationCtx, args) => {
    // If businessEmail is provided, try to find existing client by it
    let existing = null;
    if (args.businessEmail) {
      existing = await ctx.db
        .query("clients")
        .withIndex("by_owner_business_email", (q) =>
          q.eq("ownerEmail", args.ownerEmail).eq("businessEmail", args.businessEmail)
        )
        .unique();
    }

    const now = Date.now();
    const updateData: {
      businessName: string;
      contactFirstName?: string;
      contactLastName?: string;
      onboardingResponseId?: string;
      targetRevenue?: number;
      updatedAt: number;
    } = {
      businessName: args.businessName,
      contactFirstName: args.contactFirstName,
      contactLastName: args.contactLastName,
      updatedAt: now,
    };

    if (args.onboardingResponseId !== undefined) {
      updateData.onboardingResponseId = args.onboardingResponseId;
    }
    if (args.targetRevenue !== undefined) {
      updateData.targetRevenue = args.targetRevenue;
    }

    if (existing) {
      await ctx.db.patch(existing._id, updateData);
      return existing._id;
    }

    // Get or create organization for owner
    let member = await ctx.db
      .query("organization_members")
      .withIndex("by_email", (q) => q.eq("email", args.ownerEmail))
      .first();
    
    let organizationId: Id<"organizations">;
    if (member) {
      organizationId = member.organizationId;
    } else {
      // Create default organization for user inline
      const now = Date.now();
      organizationId = await ctx.db.insert("organizations", {
        name: `${args.ownerEmail.split("@")[0]}'s Organization`,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organization_members", {
        organizationId,
        email: args.ownerEmail,
        role: "owner",
        createdAt: now,
        updatedAt: now,
      });
    }

    const newClientId = await ctx.db.insert("clients", {
      organizationId,
      ownerEmail: args.ownerEmail,
      businessEmail: args.businessEmail,
      businessName: args.businessName,
      contactFirstName: args.contactFirstName,
      contactLastName: args.contactLastName,
      onboardingResponseId: args.onboardingResponseId,
      targetRevenue: args.targetRevenue,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    // Trigger script generation for new clients (not updates) if enabled in user settings
    const settings = await ctx.db
      .query("script_settings")
      .withIndex("by_email", (q) => q.eq("email", args.ownerEmail))
      .unique();
    const autoGenEnabled = settings?.autoGenerateOnSync === true;
    if (autoGenEnabled) {
      ctx.scheduler.runAfter(0, api.clients.triggerScriptGeneration, {
        clientId: newClientId,
        ownerEmail: args.ownerEmail,
      }).catch((error) => {
        console.error(`[Script Generation] Failed to schedule script generation for client ${newClientId}:`, error);
      });
    } else {
      console.log("[Script Generation] Auto-generation disabled in user settings. Skipping client trigger.", {
        clientId: String(newClientId),
        ownerEmail: args.ownerEmail,
      });
    }
    
    // Schedule cron jobs for new clients (cron jobs are enabled by default if template exists)
    // Use the client's createdAt as the base time
    ctx.scheduler.runAfter(0, api.cronJobs.scheduleCronJobsForClient, {
      clientId: newClientId,
      ownerEmail: args.ownerEmail,
      baseTime: now,
    }).catch((error) => {
      console.error(`[CronJobs] Failed to schedule cron jobs for new client ${newClientId}:`, error);
    });

    return newClientId;
  },
});

/**
 * Find client by participant email (for auto-linking transcripts)
 */
export const findClientByParticipantEmail = query({
  args: { ownerEmail: v.string(), participantEmail: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    // Normalize email for comparison (lowercase)
    const normalizedEmail = args.participantEmail.toLowerCase().trim();
    
    // Try exact match first
    const exactMatch = await ctx.db
      .query("clients")
      .withIndex("by_owner_business_email", (q) =>
        q.eq("ownerEmail", args.ownerEmail).eq("businessEmail", normalizedEmail)
      )
      .unique();
    
    if (exactMatch) {
      return exactMatch;
    }
    
    // If no exact match, return null (could extend to fuzzy matching later)
    return null;
  },
});

/**
 * Retrieve all clients for an owner (used for intelligent transcript linking)
 */
export const getClientsForLinking = query({
  args: { ownerEmail: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db
      .query("clients")
      .withIndex("by_owner", (q) => q.eq("ownerEmail", args.ownerEmail))
      .collect();
  },
});

/**
 * Get clients with schedule and activity summary for dashboard table view
 */
export const getClientsWithScheduleSummary = query({
  args: { ownerEmail: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    const clients = await ctx.db
      .query("clients")
      .withIndex("by_owner", (q) => q.eq("ownerEmail", args.ownerEmail))
      .collect();

    // For each client, fetch last script, last call, and next scheduled job
    const summaries = await Promise.all(
      clients.map(async (client) => {
        const clientId = client._id as Id<"clients">;

        // Last script for client
        const scripts = await ctx.db
          .query("scripts")
          .withIndex("by_client", (q) => q.eq("clientId", clientId))
          .order("desc")
          .take(1);
        const lastScript = scripts[0] ?? null;

        // Last call transcript for client
        const transcripts = await ctx.db
          .query("fireflies_transcripts")
          .withIndex("by_client", (q) => q.eq("clientId", clientId))
          .order("desc")
          .take(1);
        const lastTranscript = transcripts[0] ?? null;

        // Next scheduled cron job for client
        const nextJob = await ctx.db
          .query("cron_jobs")
          .withIndex("by_client", (q) => q.eq("clientId", clientId))
          .filter((q) => q.eq(q.field("status"), "scheduled"))
          .order("asc")
          .take(1);
        const nextScheduled = nextJob[0] ?? null;

        return {
          ...client,
          lastScriptDate: lastScript ? lastScript.createdAt : null,
          lastCallDate: lastTranscript ? lastTranscript.date : null,
          nextScriptDate: nextScheduled ? nextScheduled.scheduledTime : null,
        };
      })
    );

    return summaries;
  },
});

/**
 * Link a transcript to a client
 */
export const linkTranscriptToClient = mutation({
  args: {
    transcriptId: v.string(),
    clientId: v.id("clients"),
  },
  handler: async (ctx: MutationCtx, args) => {
    const transcript = await ctx.db
      .query("fireflies_transcripts")
      .withIndex("by_transcript_id", (q) => q.eq("transcriptId", args.transcriptId))
      .first();

    if (!transcript) {
      throw new Error(`Transcript not found: ${args.transcriptId}`);
    }

    await ctx.db.patch(transcript._id, {
      clientId: args.clientId,
    });

    return transcript._id;
  },
});

/**
 * Unlink a transcript from a client
 */
export const unlinkTranscriptFromClient = mutation({
  args: {
    transcriptId: v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
    const transcript = await ctx.db
      .query("fireflies_transcripts")
      .withIndex("by_transcript_id", (q) => q.eq("transcriptId", args.transcriptId))
      .first();

    if (!transcript) {
      throw new Error(`Transcript not found: ${args.transcriptId}`);
    }

    await ctx.db.patch(transcript._id, {
      clientId: undefined,
    });

    return transcript._id;
  },
});

/**
 * Link a Typeform response to a client (by updating client's onboardingResponseId)
 */
export const linkResponseToClient = mutation({
  args: {
    clientId: v.id("clients"),
    responseId: v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client) {
      throw new Error(`Client not found: ${args.clientId}`);
    }

    await ctx.db.patch(args.clientId, {
      onboardingResponseId: args.responseId,
      updatedAt: Date.now(),
    });

    return args.clientId;
  },
});

/**
 * Update client's business email (for adding participant emails for auto-linking)
 */
export const updateClientEmail = mutation({
  args: {
    clientId: v.id("clients"),
    email: v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client) {
      throw new Error(`Client not found: ${args.clientId}`);
    }

    // Update businessEmail if it's not set, or set it to the new email
    // This allows auto-linking future transcripts with this email
    await ctx.db.patch(args.clientId, {
      businessEmail: args.email.toLowerCase().trim(),
      updatedAt: Date.now(),
    });

    return args.clientId;
  },
});

/**
 * Search clients by name, email, or business name
 * Used by AI chat tool for looking up client information
 */
export const searchClients = query({
  args: {
    ownerEmail: v.string(),
    query: v.optional(v.string()), // Search term (name, email, business name)
    limit: v.optional(v.number()),
  },
  handler: async (ctx: QueryCtx, args) => {
    const maxLimit = 200;
    const requestedLimit = args.limit ?? (args.query ? 10 : 100);
    const limit = Math.min(Math.max(requestedLimit, 1), maxLimit);

    const rawQuery = (args.query ?? "").trim();
    const statusMatch = rawQuery.match(/status:(active|paused|inactive)/i);
    const statusFilter = statusMatch ? (statusMatch[1].toLowerCase() as "active" | "paused" | "inactive") : null;
    const cleanedQuery = statusMatch ? rawQuery.replace(statusMatch[0], "").trim() : rawQuery;
    const searchTerm = cleanedQuery.toLowerCase();

    // Get all clients for the owner
    const allClients = await ctx.db
      .query("clients")
      .withIndex("by_owner", (q) => q.eq("ownerEmail", args.ownerEmail))
      .collect();

    // Filter clients that match the search term and status (if provided)
    const matchingClients = allClients
      .filter((client) => {
        const matchesStatus =
          !statusFilter ||
          (client.status ? client.status.toLowerCase() === statusFilter : statusFilter === "inactive");
        if (!matchesStatus) return false;

        if (!searchTerm) {
          return true;
        }

        const businessName = client.businessName?.toLowerCase() || "";
        const businessEmail = client.businessEmail?.toLowerCase() || "";
        const contactFirstName = client.contactFirstName?.toLowerCase() || "";
        const contactLastName = client.contactLastName?.toLowerCase() || "";
        const fullName = `${contactFirstName} ${contactLastName}`.trim();
        
        return (
          businessName.includes(searchTerm) ||
          businessEmail.includes(searchTerm) ||
          fullName.includes(searchTerm) ||
          contactFirstName.includes(searchTerm) ||
          contactLastName.includes(searchTerm)
        );
      })
      .sort((a, b) => {
        const aTimestamp = a.updatedAt ?? a.createdAt ?? 0;
        const bTimestamp = b.updatedAt ?? b.createdAt ?? 0;
        return bTimestamp - aTimestamp;
      })
      .slice(0, limit);

    return matchingClients;
  },
});

/**
 * Update client information
 */
export const updateClient = mutation({
  args: {
    clientId: v.id("clients"),
    businessName: v.optional(v.string()),
    businessEmail: v.optional(v.string()),
    businessEmails: v.optional(v.array(v.string())),
    contactFirstName: v.optional(v.string()),
    contactLastName: v.optional(v.string()),
    targetRevenue: v.optional(v.number()),
    onboardingResponseId: v.optional(v.string()),
    servicesOffered: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("inactive")
    )),
    notes: v.optional(v.string()),
    cronJobSchedule: v.optional(v.array(v.number())), // e.g., [25, 30] for +25d then every 30d
    cronJobEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx: MutationCtx, args) => {
    console.log("[updateClient] Mutation called with args:", JSON.stringify(args, null, 2));
    
    const client = await ctx.db.get(args.clientId);
    if (!client) {
      throw new Error(`Client not found: ${args.clientId}`);
    }

    console.log("[updateClient] Current client state:", {
      businessEmail: client.businessEmail,
      businessEmails: client.businessEmails,
    });

    const updateData: {
      businessName?: string;
      businessEmail?: string;
      businessEmails?: string[];
      contactFirstName?: string;
      contactLastName?: string;
      targetRevenue?: number;
      onboardingResponseId?: string;
      servicesOffered?: string;
      status?: "active" | "paused" | "inactive";
      notes?: string;
      cronJobSchedule?: number[];
      cronJobEnabled?: boolean;
      updatedAt: number;
    } = {
      updatedAt: Date.now(),
    };

    if (args.businessName !== undefined) {
      updateData.businessName = args.businessName;
    }
    if (args.businessEmail !== undefined) {
      updateData.businessEmail = args.businessEmail.toLowerCase().trim() || undefined;
    }
    if (args.businessEmails !== undefined) {
      console.log("[updateClient] Processing businessEmails:", args.businessEmails);
      // Filter out empty strings and normalize emails
      const normalizedEmails = args.businessEmails.map(email => email.toLowerCase().trim()).filter(Boolean);
      console.log("[updateClient] Normalized emails:", normalizedEmails);
      // Always save the array, even if empty (to allow clearing emails)
      // Only set to undefined if we want to remove the field entirely
      updateData.businessEmails = normalizedEmails;
      console.log("[updateClient] Setting businessEmails to:", updateData.businessEmails);
    }
    if (args.contactFirstName !== undefined) {
      updateData.contactFirstName = args.contactFirstName || undefined;
    }
    if (args.contactLastName !== undefined) {
      updateData.contactLastName = args.contactLastName || undefined;
    }
    if (args.targetRevenue !== undefined) {
      updateData.targetRevenue = args.targetRevenue || undefined;
    }
    if (args.onboardingResponseId !== undefined) {
      updateData.onboardingResponseId = args.onboardingResponseId || undefined;
    }
    if (args.servicesOffered !== undefined) {
      updateData.servicesOffered = args.servicesOffered || undefined;
    }
    if (args.status !== undefined) {
      updateData.status = args.status;
    }
    if (args.notes !== undefined) {
      updateData.notes = args.notes || undefined;
    }
    if (args.cronJobSchedule !== undefined) {
      updateData.cronJobSchedule = args.cronJobSchedule;
    }
    if (args.cronJobEnabled !== undefined) {
      updateData.cronJobEnabled = args.cronJobEnabled;
    }

    console.log("[updateClient] Final updateData:", JSON.stringify(updateData, null, 2));

    await ctx.db.patch(args.clientId, updateData);
    
    // If cron job schedule or enabled status changed, reschedule cron jobs
    if (args.cronJobSchedule !== undefined || args.cronJobEnabled !== undefined) {
      const updatedClient = await ctx.db.get(args.clientId);
      if (updatedClient && updatedClient.cronJobEnabled !== false) {
        // Schedule cron jobs in the background
        ctx.scheduler.runAfter(0, api.cronJobs.scheduleCronJobsForClient, {
          clientId: args.clientId,
          ownerEmail: updatedClient.ownerEmail || "",
          baseTime: updatedClient.createdAt,
        }).catch((error) => {
          console.error(`[updateClient] Failed to schedule cron jobs for client ${args.clientId}:`, error);
        });
      } else if (updatedClient && updatedClient.cronJobEnabled === false) {
        // Cancel existing cron jobs (mutation, can be called directly)
        await ctx.runMutation(api.cronJobs.cancelJobsForClient, {
          clientId: args.clientId,
        }).catch((error) => {
          console.error(`[updateClient] Failed to cancel cron jobs for client ${args.clientId}:`, error);
        });
      }
    }

    // Verify the update
    const updatedClient = await ctx.db.get(args.clientId);
    console.log("[updateClient] Client after update:", {
      businessEmail: updatedClient?.businessEmail,
      businessEmails: updatedClient?.businessEmails,
    });

    return args.clientId;
  },
});

/**
 * Trigger script generation for a client
 * This action calls the Next.js API endpoint to generate a script
 * Uses the client's onboardingResponseId to generate from Typeform response data
 */
export const triggerScriptGeneration = action({
  args: {
    clientId: v.id("clients"),
    ownerEmail: v.string(),
  },
  handler: async (ctx: ActionCtx, args): Promise<void> => {
    // Respect per-user settings
    const settings = await ctx.runQuery(api.scriptSettings.getSettingsForEmail, { email: args.ownerEmail });
    if (settings?.autoGenerateOnSync !== true) {
      console.log("[Script Generation] Auto-generation disabled in user settings. Skipping triggerScriptGeneration.", {
        clientId: String(args.clientId),
        ownerEmail: args.ownerEmail,
      });
      return;
    }
    
    // Get the client to find the onboardingResponseId
    const client = await ctx.runQuery(api.clients.getClientById, {
      clientId: args.clientId,
    });
    
    if (!client) {
      console.error(`[Script Generation] Client not found: ${args.clientId}`);
      return;
    }
    
    // Use onboardingResponseId if available, otherwise fall back to client-based generation
    const responseId = client.onboardingResponseId;
    
    if (!responseId) {
      console.warn(`[Script Generation] Client ${args.clientId} has no onboardingResponseId, skipping script generation`);
      return;
    }
    
    // Get the base URL from environment or use a default
    const baseUrl = settings?.publicAppUrl || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
    console.log(
      "[Script Generation] triggerScriptGeneration",
      JSON.stringify({
        clientId: String(args.clientId),
        responseId,
        ownerEmail: args.ownerEmail,
        source: settings?.publicAppUrl ? "settings" : ((process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL) ? "env" : "fallback"),
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ? "set" : "unset",
        APP_URL: process.env.APP_URL ? "set" : "unset",
        baseUrl: baseUrl || null,
      })
    );
    if (!baseUrl) {
      console.warn(
        "[Script Generation] Base URL not set in Convex env (set NEXT_PUBLIC_APP_URL or APP_URL). Skipping.",
        JSON.stringify({ clientId: String(args.clientId), ownerEmail: args.ownerEmail })
      );
      return;
    }

    // Call the Next.js API endpoint to generate script from response
    // This runs asynchronously - we don't wait for the result
    fetch(`${baseUrl.replace(/\/$/, "")}/api/scripts/generate-from-response`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        responseId: responseId,
        clientId: String(args.clientId),
        email: args.ownerEmail,
      }),
    }).catch((error) => {
      console.error(`[Script Generation] Failed to trigger script generation for client ${args.clientId}:`, error);
      // Don't throw - script generation failure shouldn't break client creation
    });
  },
});

