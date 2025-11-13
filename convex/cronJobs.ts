import { mutation, query, QueryCtx, MutationCtx, action, ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * Get cron jobs for a client
 */
export const getCronJobsForClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db
      .query("cron_jobs")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
  },
});

/**
 * Get active cron jobs scheduled to run soon
 */
export const getUpcomingCronJobs = query({
  args: { 
    ownerEmail: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx: QueryCtx, args) => {
    const limit = Math.min(args.limit ?? 50, 100);
    const now = Date.now();
    
    let query = ctx.db
      .query("cron_jobs")
      .withIndex("by_scheduled_time", (q) => q.gte("scheduledTime", now))
      .filter((q) => q.eq(q.field("status"), "scheduled"));
    
    if (args.ownerEmail) {
      query = query.filter((q) => q.eq(q.field("ownerEmail"), args.ownerEmail));
    }
    
    return await query.order("asc").take(limit);
  },
});

/**
 * Schedule cron jobs for a client based on template or client-specific schedule
 */
export const scheduleCronJobsForClient = action({
  args: {
    clientId: v.id("clients"),
    ownerEmail: v.string(),
    baseTime: v.optional(v.number()), // Unix timestamp to calculate from (defaults to now)
  },
  handler: async (ctx: ActionCtx, args): Promise<{ scheduled: number }> => {
    const baseTime = args.baseTime || Date.now();
    
    // Get client
    const client = await ctx.runQuery(api.clients.getClientById, {
      clientId: args.clientId,
    });
    
    if (!client) {
      throw new Error(`Client not found: ${args.clientId}`);
    }
    
    // Check if cron jobs are enabled for this client
    if (client.cronJobEnabled === false) {
      console.log(`[CronJobs] Cron jobs disabled for client ${args.clientId}`);
      return { scheduled: 0 };
    }
    
    // Cancel existing scheduled jobs for this client
    await ctx.runMutation(api.cronJobs.cancelJobsForClient, {
      clientId: args.clientId,
    });
    
    // Fixed schedule pattern:
    // 1. Immediate (already done when client is created)
    // 2. 25 days after creation
    // 3. 30 days after that (55 days total from creation) - this date's day becomes the recurring day
    // 4. Then every month on that same day of the month
    
    let scheduledCount = 0;
    
    // First cron job: 25 days after creation
    const firstJobTime = baseTime + (25 * 24 * 60 * 60 * 1000);
    const firstJobDate = new Date(firstJobTime);
    const firstJobDayOfMonth = firstJobDate.getDate();
    
    const firstCronJobId = await ctx.runMutation(api.cronJobs.createCronJobRecord, {
      ownerEmail: args.ownerEmail,
      clientId: args.clientId,
      scheduledTime: firstJobTime,
      dayOfMonth: firstJobDayOfMonth,
      isRepeating: false, // This is a one-time job
    });
    
    await scheduleCloudflareCronTrigger(ctx, {
      cronJobId: firstCronJobId,
      clientId: args.clientId,
      ownerEmail: args.ownerEmail,
      scheduledTime: firstJobTime,
      isRepeating: false,
      dayOfMonth: firstJobDayOfMonth,
    });
    
    scheduledCount++;
    
    // Second cron job: 30 days after first job (55 days total from creation)
    // This exact date's day of month becomes the recurring monthly day
    const secondJobTime = firstJobTime + (30 * 24 * 60 * 60 * 1000);
    const secondJobDate = new Date(secondJobTime);
    const recurringDayOfMonth = secondJobDate.getDate();
    
    // Schedule the second job for the exact date (55 days from creation)
    // When it executes, it will schedule the next month's occurrence
    const secondCronJobId = await ctx.runMutation(api.cronJobs.createCronJobRecord, {
      ownerEmail: args.ownerEmail,
      clientId: args.clientId,
      scheduledTime: secondJobTime,
      dayOfMonth: recurringDayOfMonth,
      isRepeating: true, // This will become the recurring monthly job
    });
    
    await scheduleCloudflareCronTrigger(ctx, {
      cronJobId: secondCronJobId,
      clientId: args.clientId,
      ownerEmail: args.ownerEmail,
      scheduledTime: secondJobTime,
      isRepeating: true,
      dayOfMonth: recurringDayOfMonth,
    });
    
    scheduledCount++;
    
    console.log(`[CronJobs] Scheduled ${scheduledCount} cron jobs for client ${args.clientId}: first at day ${firstJobDayOfMonth} (25 days), recurring on day ${recurringDayOfMonth} (monthly)`);
    return { scheduled: scheduledCount };
  },
});

/**
 * Calculate the next occurrence of a specific day of the month
 * Handles edge cases like day 31 when month has fewer days (uses last day of month)
 */
function calculateNextDayOfMonth(fromTime: number, dayOfMonth: number): number {
  const fromDate = new Date(fromTime);
  const currentYear = fromDate.getFullYear();
  const currentMonth = fromDate.getMonth();
  const currentDay = fromDate.getDate();
  
  // Try this month first
  const thisMonthDate = new Date(currentYear, currentMonth, dayOfMonth);
  
  // If day doesn't exist in this month (e.g., Feb 31), use last day of month
  if (thisMonthDate.getDate() !== dayOfMonth) {
    // Get last day of current month
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    thisMonthDate.setDate(Math.min(dayOfMonth, lastDayOfMonth));
  }
  
  // If this month's occurrence has passed or is today, move to next month
  if (thisMonthDate.getTime() <= fromTime || thisMonthDate.getDate() < currentDay) {
    // Move to next month
    const nextMonth = currentMonth + 1;
    const nextMonthDate = new Date(currentYear, nextMonth, dayOfMonth);
    
    // If day doesn't exist in next month, use last day
    if (nextMonthDate.getDate() !== dayOfMonth) {
      const lastDayOfNextMonth = new Date(currentYear, nextMonth + 1, 0).getDate();
      nextMonthDate.setDate(Math.min(dayOfMonth, lastDayOfNextMonth));
    }
    
    return nextMonthDate.getTime();
  }
  
  return thisMonthDate.getTime();
}

/**
 * Helper to schedule Cloudflare cron trigger
 * Note: Cloudflare cron triggers are configured in wrangler.toml, but we can also
 * use the Cloudflare API to create scheduled events dynamically
 */
async function scheduleCloudflareCronTrigger(
  ctx: ActionCtx,
  params: {
    cronJobId: string;
    clientId: Id<"clients">;
    ownerEmail: string;
    scheduledTime: number;
    isRepeating?: boolean;
    dayOfMonth?: number;
  }
): Promise<void> {
  // For now, we'll store the cron job info and use a scheduled Convex function
  // Cloudflare cron triggers are typically configured statically in wrangler.toml
  // We'll use Convex scheduler.runAfter for dynamic scheduling
  
  const delayMs = params.scheduledTime - Date.now();
  
  if (delayMs <= 0) {
    // Already past due, run immediately
    ctx.scheduler.runAfter(0, api.cronJobs.executeCronJob, {
      cronJobId: params.cronJobId,
      clientId: params.clientId,
      ownerEmail: params.ownerEmail,
    });
  } else {
    // Schedule for later
    ctx.scheduler.runAfter(delayMs, api.cronJobs.executeCronJob, {
      cronJobId: params.cronJobId,
      clientId: params.clientId,
      ownerEmail: params.ownerEmail,
    });
    
    // If repeating monthly, schedule the next month's occurrence
    if (params.isRepeating && params.dayOfMonth) {
      // Calculate next month's occurrence
      const nextMonthTime = calculateNextDayOfMonth(params.scheduledTime + 1, params.dayOfMonth);
      const nextDelay = nextMonthTime - Date.now();
      
      if (nextDelay > 0) {
        ctx.scheduler.runAfter(nextDelay, api.cronJobs.scheduleNextRepeatingJob, {
          cronJobId: params.cronJobId,
          clientId: params.clientId,
          ownerEmail: params.ownerEmail,
          dayOfMonth: params.dayOfMonth,
        });
      }
    }
  }
}

/**
 * Create a cron job record in the database
 */
export const createCronJobRecord = mutation({
  args: {
    ownerEmail: v.string(),
    clientId: v.id("clients"),
    scheduledTime: v.number(),
    dayOfMonth: v.number(),
    isRepeating: v.boolean(),
  },
  handler: async (ctx: MutationCtx, args) => {
    const now = Date.now();
    const cronJobId = `cron_${args.clientId}_${args.scheduledTime}_${Math.random().toString(36).substring(7)}`;
    
    await ctx.db.insert("cron_jobs", {
      ownerEmail: args.ownerEmail,
      clientId: args.clientId,
      cronJobId,
      scheduledTime: args.scheduledTime,
      dayOfMonth: args.dayOfMonth,
      isRepeating: args.isRepeating,
      status: "scheduled",
      createdAt: now,
      updatedAt: now,
    });
    
    return cronJobId;
  },
});

/**
 * Execute a cron job (generate script)
 */
export const executeCronJob = action({
  args: {
    cronJobId: v.string(),
    clientId: v.id("clients"),
    ownerEmail: v.string(),
  },
  handler: async (ctx: ActionCtx, args): Promise<void> => {
    // Get the cron job record
    const cronJobs = await ctx.runQuery(api.cronJobs.getCronJobsForClient, {
      clientId: args.clientId,
    });
    
    const cronJob = cronJobs.find((job) => job.cronJobId === args.cronJobId);
    
    if (!cronJob) {
      console.error(`[CronJobs] Cron job not found: ${args.cronJobId}`);
      return;
    }
    
    if (cronJob.status !== "scheduled") {
      console.log(`[CronJobs] Cron job ${args.cronJobId} is not scheduled (status: ${cronJob.status})`);
      return;
    }
    
    // Get client
    const client = await ctx.runQuery(api.clients.getClientById, {
      clientId: args.clientId,
    });
    
    if (!client) {
      console.error(`[CronJobs] Client not found: ${args.clientId}`);
      await ctx.runMutation(api.cronJobs.updateCronJobStatus, {
        cronJobId: args.cronJobId,
        status: "failed",
      });
      return;
    }
    
    // Check if cron jobs are still enabled
    if (client.cronJobEnabled === false) {
      console.log(`[CronJobs] Cron jobs disabled for client ${args.clientId}, cancelling job`);
      await ctx.runMutation(api.cronJobs.updateCronJobStatus, {
        cronJobId: args.cronJobId,
        status: "cancelled",
      });
      return;
    }
    
    // Get the onboarding response ID to generate script from
    if (!client.onboardingResponseId) {
      console.error(`[CronJobs] Client ${args.clientId} has no onboardingResponseId`);
      await ctx.runMutation(api.cronJobs.updateCronJobStatus, {
        cronJobId: args.cronJobId,
        status: "failed",
      });
      return;
    }
    
    try {
      // Trigger script generation
      const settings = await ctx.runQuery(api.scriptSettings.getSettingsForEmail, {
        email: args.ownerEmail,
      });
      
      const baseUrl = settings?.publicAppUrl || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
      
      if (!baseUrl) {
        throw new Error("Base URL not configured");
      }
      
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/scripts/generate-from-response`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          responseId: client.onboardingResponseId,
          email: args.ownerEmail,
          clientId: args.clientId,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Script generation failed: ${response.status} - ${errorText}`);
      }
      
      // Mark cron job as completed
      await ctx.runMutation(api.cronJobs.updateCronJobStatus, {
        cronJobId: args.cronJobId,
        status: "completed",
      });
      
      console.log(`[CronJobs] Successfully executed cron job ${args.cronJobId} for client ${args.clientId}`);
      
      // If this is a repeating job, schedule the next month's occurrence
      if (cronJob.isRepeating) {
        await ctx.runAction(api.cronJobs.scheduleNextRepeatingJob, {
          cronJobId: args.cronJobId,
          clientId: args.clientId,
          ownerEmail: args.ownerEmail,
          dayOfMonth: cronJob.dayOfMonth,
        }).catch((error) => {
          console.error(`[CronJobs] Failed to schedule next repeating job for ${args.cronJobId}:`, error);
        });
      }
    } catch (error) {
      console.error(`[CronJobs] Failed to execute cron job ${args.cronJobId}:`, error);
      await ctx.runMutation(api.cronJobs.updateCronJobStatus, {
        cronJobId: args.cronJobId,
        status: "failed",
      });
      throw error;
    }
  },
});

/**
 * Schedule the next repeating cron job (next month's occurrence)
 */
export const scheduleNextRepeatingJob = action({
  args: {
    cronJobId: v.string(),
    clientId: v.id("clients"),
    ownerEmail: v.string(),
    dayOfMonth: v.number(),
  },
  handler: async (ctx: ActionCtx, args): Promise<void> => {
    // Get the cron job to find its pattern
    const cronJobs = await ctx.runQuery(api.cronJobs.getCronJobsForClient, {
      clientId: args.clientId,
    });
    
    const originalJob = cronJobs.find((job) => job.cronJobId === args.cronJobId);
    
    if (!originalJob || !originalJob.isRepeating) {
      console.log(`[CronJobs] Original job not found or not repeating: ${args.cronJobId}`);
      return;
    }
    
    // Calculate next month's occurrence of this day
    const now = Date.now();
    const nextScheduledTime = calculateNextDayOfMonth(now, args.dayOfMonth);
    
    // Create new cron job record
    const newCronJobId = await ctx.runMutation(api.cronJobs.createCronJobRecord, {
      ownerEmail: args.ownerEmail,
      clientId: args.clientId,
      scheduledTime: nextScheduledTime,
      dayOfMonth: args.dayOfMonth,
      isRepeating: true,
    });
    
    // Schedule the next execution
    await scheduleCloudflareCronTrigger(ctx, {
      cronJobId: newCronJobId,
      clientId: args.clientId,
      ownerEmail: args.ownerEmail,
      scheduledTime: nextScheduledTime,
      isRepeating: true,
      dayOfMonth: args.dayOfMonth,
    });
    
    console.log(`[CronJobs] Scheduled next repeating job ${newCronJobId} for client ${args.clientId} on day ${args.dayOfMonth}`);
  },
});

/**
 * Update cron job status
 */
export const updateCronJobStatus = mutation({
  args: {
    cronJobId: v.string(),
    status: v.union(
      v.literal("scheduled"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
  },
  handler: async (ctx: MutationCtx, args) => {
    const cronJobs = await ctx.db
      .query("cron_jobs")
      .filter((q) => q.eq(q.field("cronJobId"), args.cronJobId))
      .collect();
    
    if (cronJobs.length === 0) {
      throw new Error(`Cron job not found: ${args.cronJobId}`);
    }
    
    // Update all matching jobs (should only be one)
    for (const job of cronJobs) {
      await ctx.db.patch(job._id, {
        status: args.status,
        updatedAt: Date.now(),
      });
    }
    
    return cronJobs[0]._id;
  },
});

/**
 * Cancel all scheduled jobs for a client
 */
export const cancelJobsForClient = mutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx: MutationCtx, args) => {
    const jobs = await ctx.db
      .query("cron_jobs")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .filter((q) => q.eq(q.field("status"), "scheduled"))
      .collect();
    
    const now = Date.now();
    for (const job of jobs) {
      await ctx.db.patch(job._id, {
        status: "cancelled",
        updatedAt: now,
      });
    }
    
    return jobs.length;
  },
});

