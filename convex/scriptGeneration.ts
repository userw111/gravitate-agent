import { mutation, query, QueryCtx, MutationCtx, action, ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";

export const startRun = mutation({
  args: {
    ownerEmail: v.string(),
    responseId: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx: MutationCtx, args) => {
    // Get organizationId from client or ownerEmail
    let organizationId: Id<"organizations">;
    if (args.clientId) {
      const client = await ctx.db.get(args.clientId);
      if (!client || !client.organizationId) {
        throw new Error("Client not found or missing organization");
      }
      organizationId = client.organizationId;
    } else {
      // Get or create organization for ownerEmail
      let member = await ctx.db
        .query("organization_members")
        .withIndex("by_email", (q) => q.eq("email", args.ownerEmail))
        .first();
      
      if (member) {
        organizationId = member.organizationId;
      } else {
        // Create default organization for user inline
        const orgNow = Date.now();
        organizationId = await ctx.db.insert("organizations", {
          name: `${args.ownerEmail.split("@")[0]}'s Organization`,
          createdAt: orgNow,
          updatedAt: orgNow,
        });
        await ctx.db.insert("organization_members", {
          organizationId,
          email: args.ownerEmail,
          role: "owner",
          createdAt: orgNow,
          updatedAt: orgNow,
        });
      }
    }

    const now = Date.now();
    const runId = await ctx.db.insert("script_generation_runs", {
      organizationId,
      ownerEmail: args.ownerEmail,
      responseId: args.responseId,
      clientId: args.clientId,
      status: "started",
      createdAt: now,
      updatedAt: now,
      steps: [{
        name: "start",
        status: "success",
        timestamp: now,
      }],
    });
    return runId;
  },
});

export const updateStep = mutation({
  args: {
    runId: v.id("script_generation_runs"),
    step: v.object({
      name: v.string(),
      status: v.union(v.literal("pending"), v.literal("running"), v.literal("success"), v.literal("error")),
      detail: v.optional(v.string()),
    }),
    status: v.optional(v.union(
      v.literal("queued"),
      v.literal("started"),
      v.literal("generating"),
      v.literal("storing"),
      v.literal("completed"),
      v.literal("failed")
    )),
  },
  handler: async (ctx: MutationCtx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Run not found");
    }
    const now = Date.now();
    const steps = Array.isArray(run.steps) ? run.steps.slice() : [];
    steps.push({
      name: args.step.name,
      status: args.step.status,
      timestamp: now,
      detail: args.step.detail,
    });
    await ctx.db.patch(args.runId, {
      steps,
      status: args.status ?? run.status,
      updatedAt: now,
    });
    return args.runId;
  },
});

export const completeRun = mutation({
  args: {
    runId: v.id("script_generation_runs"),
  },
  handler: async (ctx: MutationCtx, args) => {
    const now = Date.now();
    // Preserve steps by fetching current and only updating status/updatedAt
    await ctx.db.patch(args.runId, {
      status: "completed",
      updatedAt: now,
    } as any);
    return args.runId;
  },
});

export const failRun = mutation({
  args: {
    runId: v.id("script_generation_runs"),
    error: v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
    const now = Date.now();
    const run = await ctx.db.get(args.runId);
    const steps = Array.isArray(run?.steps) ? run!.steps.slice() : [];
    steps.push({
      name: "error",
      status: "error",
      timestamp: now,
      detail: args.error,
    });
    await ctx.db.patch(args.runId, {
      status: "failed",
      error: args.error,
      steps,
      updatedAt: now,
    });
    return args.runId;
  },
});

export const listRecentRuns = query({
  args: {
    ownerEmail: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx: QueryCtx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
    return await ctx.db
      .query("script_generation_runs")
      .withIndex("by_owner", (q) => q.eq("ownerEmail", args.ownerEmail))
      .order("desc")
      .take(limit);
  },
});

/**
 * Action to trigger script generation via Next.js API
 * This properly awaits the HTTP call and handles errors
 */
export const triggerScriptGenerationFromResponse = action({
  args: {
    responseId: v.string(),
    ownerEmail: v.string(),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx: ActionCtx, args): Promise<{ success: boolean; error?: string }> => {
    // Resolve base URL: prefer per-user settings, then env, then localhost (best-effort)
    const ownerSettings = await ctx.runQuery(api.scriptSettings.getSettingsForEmail, { email: args.ownerEmail });
    const rawNextPublic = process.env.NEXT_PUBLIC_APP_URL;
    const rawAppUrl = process.env.APP_URL;
    const baseUrl = ownerSettings?.publicAppUrl || rawNextPublic || rawAppUrl || "http://localhost:3000";
    const cleanBaseUrl = baseUrl.replace(/\/$/, "");
    
    console.log(
      `[Script Generation][Action] Triggering script generation`,
      JSON.stringify({
        responseId: args.responseId,
        ownerEmail: args.ownerEmail,
        source: ownerSettings?.publicAppUrl ? "settings" : (rawNextPublic || rawAppUrl ? "env" : "fallback"),
        NEXT_PUBLIC_APP_URL: rawNextPublic ? "set" : "unset",
        APP_URL: rawAppUrl ? "set" : "unset",
        baseUrl: cleanBaseUrl,
      })
    );

    try {
      // Try workflow endpoint first
      const workflowUrl = `${cleanBaseUrl}/api/workflows/script-generation`;
      console.log("[Script Generation][Action] Calling workflow endpoint", JSON.stringify({ url: workflowUrl, responseId: args.responseId, ownerEmail: args.ownerEmail }));
      const workflowResponse = await fetch(workflowUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          responseId: args.responseId,
          email: args.ownerEmail,
          clientId: args.clientId,
        }),
      });

      if (workflowResponse.ok) {
        console.log(`[Script Generation][Action] Workflow endpoint succeeded for ${args.responseId}`, JSON.stringify({ status: workflowResponse.status }));
        return { success: true };
      }

      // Fallback to direct endpoint
      console.warn(
        `[Script Generation][Action] Workflow endpoint failed (${workflowResponse.status}), falling back to direct API for ${args.responseId}`
      );
      const directUrl = `${cleanBaseUrl}/api/scripts/generate-from-response`;
      console.log("[Script Generation][Action] Calling direct endpoint", JSON.stringify({ url: directUrl, responseId: args.responseId, ownerEmail: args.ownerEmail }));
      const directResponse = await fetch(directUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          responseId: args.responseId,
          email: args.ownerEmail,
          clientId: args.clientId,
        }),
      });

      if (directResponse.ok) {
        console.log(`[Script Generation][Action] Direct API succeeded for ${args.responseId}`, JSON.stringify({ status: directResponse.status }));
        return { success: true };
      }

      const errorText = await directResponse.text();
      console.error(
        `[Script Generation][Action] Direct API failed for ${args.responseId}: ${directResponse.status} - ${errorText}`
      );
      return {
        success: false,
        error: `Script generation failed: ${directResponse.status} - ${errorText}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Script Generation][Action] Failed to trigger script generation for ${args.responseId}:`, errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  },
});


