import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

/**
 * Create a new script
 */
export const createScript = mutation({
  args: {
    ownerEmail: v.string(),
    clientId: v.id("clients"),
    title: v.string(),
    contentHtml: v.string(),
    source: v.object({
      type: v.union(v.literal("typeform"), v.literal("manual"), v.literal("cron")),
      responseId: v.optional(v.string()),
      cronJobId: v.optional(v.string()),
    }),
    model: v.optional(v.string()),
    thinkingEffort: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    status: v.optional(v.union(v.literal("draft"), v.literal("final"))),
  },
  handler: async (ctx: MutationCtx, args) => {
    // Get organizationId from client
    const client = await ctx.db.get(args.clientId);
    if (!client || !client.organizationId) {
      throw new Error("Client not found or missing organization");
    }
    
    const now = Date.now();
    return await ctx.db.insert("scripts", {
      organizationId: client.organizationId,
      ownerEmail: args.ownerEmail,
      clientId: args.clientId,
      title: args.title,
      contentHtml: args.contentHtml,
      source: args.source,
      model: args.model,
      thinkingEffort: args.thinkingEffort,
      status: args.status || "draft",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update script content
 */
export const updateScriptContent = mutation({
  args: {
    scriptId: v.id("scripts"),
    ownerEmail: v.string(),
    contentHtml: v.string(),
    status: v.optional(v.union(v.literal("draft"), v.literal("final"))),
  },
  handler: async (ctx: MutationCtx, args) => {
    const script = await ctx.db.get(args.scriptId);
    if (!script || script.ownerEmail !== args.ownerEmail) {
      throw new Error("Script not found or access denied");
    }
    
    await ctx.db.patch(args.scriptId, {
      contentHtml: args.contentHtml,
      updatedAt: Date.now(),
      ...(args.status !== undefined && { status: args.status }),
    });
    
    return args.scriptId;
  },
});

/**
 * Get all scripts for a client
 */
export const getScriptsForClient = query({
  args: {
    clientId: v.id("clients"),
    ownerEmail: v.string(),
  },
  handler: async (ctx: QueryCtx, args) => {
    // Verify client ownership
    const client = await ctx.db.get(args.clientId);
    if (!client || client.ownerEmail !== args.ownerEmail) {
      return [];
    }
    
    return await ctx.db
      .query("scripts")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .collect();
  },
});

/**
 * Get script by ID
 */
export const getScriptById = query({
  args: {
    scriptId: v.id("scripts"),
    ownerEmail: v.string(),
  },
  handler: async (ctx: QueryCtx, args) => {
    const script = await ctx.db.get(args.scriptId);
    if (!script || script.ownerEmail !== args.ownerEmail) {
      return null;
    }
    return script;
  },
});

/**
 * Get script by source response ID (for idempotency checks)
 */
export const getScriptByResponseId = query({
  args: {
    responseId: v.string(),
    ownerEmail: v.string(),
  },
  handler: async (ctx: QueryCtx, args) => {
    const scripts = await ctx.db
      .query("scripts")
      .withIndex("by_source_response", (q) => q.eq("source.responseId", args.responseId))
      .collect();
    
    // Filter by owner and return first match
    return scripts.find((s) => s.ownerEmail === args.ownerEmail) || null;
  },
});

/**
 * Delete a script
 */
export const deleteScript = mutation({
  args: {
    scriptId: v.id("scripts"),
    ownerEmail: v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
    const script = await ctx.db.get(args.scriptId);
    if (!script || script.ownerEmail !== args.ownerEmail) {
      throw new Error("Script not found or access denied");
    }
    
    await ctx.db.delete(args.scriptId);
    return args.scriptId;
  },
});

/**
 * Get script count for a client
 */
export const getScriptCountForClient = query({
  args: {
    clientId: v.id("clients"),
    ownerEmail: v.string(),
  },
  handler: async (ctx: QueryCtx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client || client.ownerEmail !== args.ownerEmail) {
      return 0;
    }
    
    const scripts = await ctx.db
      .query("scripts")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    
    return scripts.length;
  },
});

