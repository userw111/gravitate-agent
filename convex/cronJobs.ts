import { mutation, query, QueryCtx, MutationCtx, action, ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id, Doc } from "./_generated/dataModel";

/**
 * Timezone helpers - schedule at 12:00am America/New_York (ET)
 */
const ET_TZ = "America/New_York";

function getTimeZoneOffsetMs(tz: string, d: Date): number {
  // Convert a UTC date into tz calendar parts, then compare epoch
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(d).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - d.getTime();
}

function getMidnightInTimeZone(year: number, monthIndex: number, day: number, tz: string): number {
  // Initial guess: midnight UTC of that calendar date
  let guessUtc = Date.UTC(year, monthIndex, day, 0, 0, 0);
  let offset = getTimeZoneOffsetMs(tz, new Date(guessUtc));
  // Adjust UTC time by the timezone offset so that wall clock == 00:00:00
  let utc = Date.UTC(year, monthIndex, day, 0, 0, 0) - offset;
  // Recompute in case DST boundary changed the offset
  const offset2 = getTimeZoneOffsetMs(tz, new Date(utc));
  if (offset2 !== offset) {
    utc = Date.UTC(year, monthIndex, day, 0, 0, 0) - offset2;
  }
  return utc;
}

function getEtDatePartsFromUtc(ms: number): { year: number; monthIndex: number; day: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(ms)).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  return {
    year: Number(parts.year),
    monthIndex: Number(parts.month) - 1,
    day: Number(parts.day),
  };
}

function etMidnightForSameCalendarDay(ms: number): number {
  const { year, monthIndex, day } = getEtDatePartsFromUtc(ms);
  return getMidnightInTimeZone(year, monthIndex, day, ET_TZ);
}

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
 * Get cron job by its cronJobId
 */
export const getCronJobByCronId = query({
  args: { cronJobId: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db
      .query("cron_jobs")
      .withIndex("by_cron_id", (q) => q.eq("cronJobId", args.cronJobId))
      .unique();
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
    skipFirstJob: v.optional(v.boolean()), // When true, skip the 25-day job and start at the recurring schedule
  },
  handler: async (ctx: ActionCtx, args): Promise<{ scheduled: number }> => {
    const baseTime = args.baseTime || Date.now();
    const skipFirstJob = args.skipFirstJob === true;
    
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
    
    let firstJobDayOfMonth: number | null = null;

    // First cron job: 25 days after creation (optional)
    if (!skipFirstJob) {
      const firstJobTarget = baseTime + 25 * 24 * 60 * 60 * 1000;
      const firstJobTime = etMidnightForSameCalendarDay(firstJobTarget);
      firstJobDayOfMonth = getEtDatePartsFromUtc(firstJobTime).day;

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
    }

    // Second cron job:
    // - Normal mode: 30 days after first job (55 days total from creation)
    // - Skip-first mode: baseTime becomes the first monthly run date
    const secondJobTarget = skipFirstJob
      ? baseTime // Use baseTime directly as the first monthly date
      : (baseTime + 25 * 24 * 60 * 60 * 1000) + 30 * 24 * 60 * 60 * 1000;
    const secondJobTime = etMidnightForSameCalendarDay(secondJobTarget);
    const recurringDayOfMonth = getEtDatePartsFromUtc(secondJobTime).day;
    
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
    
    console.log(
      `[CronJobs] Scheduled ${scheduledCount} cron jobs for client ${args.clientId}:` +
        (skipFirstJob
          ? ` starting at day ${recurringDayOfMonth} (55 days from base, then monthly)`
          : ` first at day ${firstJobDayOfMonth} (25 days), recurring on day ${recurringDayOfMonth} (monthly)`)
    );
    return { scheduled: scheduledCount };
  },
});

/**
 * Calculate the next occurrence of a specific day of the month
 * Handles edge cases like day 31 when month has fewer days (uses last day of month)
 */
function calculateNextDayOfMonth(fromTime: number, dayOfMonth: number): number {
  // Work in ET calendar to determine the next date, then return ET midnight
  const { year, monthIndex, day } = getEtDatePartsFromUtc(fromTime);
  // Try this month first in ET
  const lastDayThisMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const desiredDayThisMonth = Math.min(dayOfMonth, lastDayThisMonth);
  const thisMonthEtMidnight = getMidnightInTimeZone(year, monthIndex, desiredDayThisMonth, ET_TZ);
  if (thisMonthEtMidnight > fromTime && desiredDayThisMonth >= day) {
    return thisMonthEtMidnight;
  }
  // Next month in ET
  const nextMonthIndex = (monthIndex + 1) % 12;
  const nextYear = monthIndex === 11 ? year + 1 : year;
  const lastDayNextMonth = new Date(Date.UTC(nextYear, nextMonthIndex + 1, 0)).getUTCDate();
  const desiredDayNextMonth = Math.min(dayOfMonth, lastDayNextMonth);
  return getMidnightInTimeZone(nextYear, nextMonthIndex, desiredDayNextMonth, ET_TZ);
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
    const client = await ctx.db.get(args.clientId);
    if (!client) {
      throw new Error(`Client not found: ${args.clientId}`);
    }

    const now = Date.now();
    const cronJobId = `cron_${args.clientId}_${args.scheduledTime}_${Math.random().toString(36).substring(7)}`;
    
    await ctx.db.insert("cron_jobs", {
      organizationId: client.organizationId,
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
    // Get the cron job record directly by cronJobId (indexed)
    const cronJob = await ctx.runQuery(api.cronJobs.getCronJobByCronId, {
      cronJobId: args.cronJobId,
    });
    
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
      
      // Ensure Google Drive folder structure exists for this client and month
      try {
        await fetch(`${baseUrl.replace(/\/$/, "")}/api/google-drive/create-folders`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            clientId: args.clientId,
            email: args.ownerEmail,
            dateMs: cronJob.scheduledTime,
          }),
        });
      } catch (e) {
        console.error(`[CronJobs] Failed to ensure Google Drive folders for client ${args.clientId}:`, e);
        // Continue anyway; do not fail the cron job due to Drive errors
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
 * Get the next scheduled job for a client (earliest by scheduledTime)
 */
export const getNextScheduledJob = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx: QueryCtx, args) => {
    const jobs = await ctx.db
      .query("cron_jobs")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .filter((q) => q.eq(q.field("status"), "scheduled"))
      .collect();
    if (jobs.length === 0) return null;
    jobs.sort((a, b) => a.scheduledTime - b.scheduledTime);
    return jobs[0];
  },
});

/**
 * Override the next scheduled run to a specific date.
 * Will keep repeating status if current next job is repeating.
 */
export const overrideNextRun = action({
  args: {
    clientId: v.id("clients"),
    ownerEmail: v.string(),
    nextTime: v.number(), // arbitrary ms; will be converted to ET midnight of that day
  },
  handler: async (ctx: ActionCtx, args): Promise<{ cronJobId: string; scheduledTime: number; dayOfMonth: number; isRepeating: boolean }> => {
    const nextJob: Doc<"cron_jobs"> | null = await ctx.runQuery(api.cronJobs.getNextScheduledJob, {
      clientId: args.clientId,
    });
    const keepRepeating: boolean = nextJob?.isRepeating === true;
    if (nextJob) {
      await ctx.runMutation(api.cronJobs.updateCronJobStatus, {
        cronJobId: nextJob.cronJobId,
        status: "cancelled",
      });
    }
    const scheduledTime = etMidnightForSameCalendarDay(args.nextTime);
    const dayOfMonth = getEtDatePartsFromUtc(scheduledTime).day;
    const newId: string = await ctx.runMutation(api.cronJobs.createCronJobRecord, {
      ownerEmail: args.ownerEmail,
      clientId: args.clientId,
      scheduledTime,
      dayOfMonth,
      isRepeating: keepRepeating,
    });
    await scheduleCloudflareCronTrigger(ctx, {
      cronJobId: newId,
      clientId: args.clientId,
      ownerEmail: args.ownerEmail,
      scheduledTime,
      isRepeating: keepRepeating,
      dayOfMonth,
    });
    return { cronJobId: newId, scheduledTime, dayOfMonth, isRepeating: keepRepeating };
  },
});

/**
 * Skip the next scheduled run. If it's a repeating job, schedule the following month.
 */
export const skipNextRun = action({
  args: {
    clientId: v.id("clients"),
    ownerEmail: v.string(),
  },
  handler: async (ctx: ActionCtx, args): Promise<{ skipped: boolean; cronJobId?: string; scheduledTime?: number }> => {
    const nextJob: Doc<"cron_jobs"> | null = await ctx.runQuery(api.cronJobs.getNextScheduledJob, {
      clientId: args.clientId,
    });
    if (!nextJob) {
      return { skipped: false };
    }
    // Cancel the next job
    await ctx.runMutation(api.cronJobs.updateCronJobStatus, {
      cronJobId: nextJob.cronJobId,
      status: "cancelled",
    });
    if (nextJob.isRepeating) {
      const nextMonthTime = calculateNextDayOfMonth(nextJob.scheduledTime + 1, nextJob.dayOfMonth);
      const createdId: string = await ctx.runMutation(api.cronJobs.createCronJobRecord, {
        ownerEmail: args.ownerEmail,
        clientId: args.clientId,
        scheduledTime: nextMonthTime,
        dayOfMonth: nextJob.dayOfMonth,
        isRepeating: true,
      });
      await scheduleCloudflareCronTrigger(ctx, {
        cronJobId: createdId,
        clientId: args.clientId,
        ownerEmail: args.ownerEmail,
        scheduledTime: nextMonthTime,
        isRepeating: true,
        dayOfMonth: nextJob.dayOfMonth,
      });
      return { skipped: true, cronJobId: createdId, scheduledTime: nextMonthTime };
    }
    return { skipped: true };
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
    
    const originalJob = cronJobs.find((job: Doc<"cron_jobs">) => job.cronJobId === args.cronJobId);
    
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

