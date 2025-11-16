import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

/**
 * Get Google Drive config for an organization
 */
export const getConfigForOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db
      .query("google_drive_configs")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .unique();
  },
});

/**
 * Get Google Drive config for a user's organization (backwards compatibility)
 */
export const getConfigForEmail = query({
  args: { email: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    // First try to get by organization (new way)
    // Get user's organization
    const member = await ctx.db
      .query("organization_members")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (member) {
      const orgConfig = await ctx.db
        .query("google_drive_configs")
        .withIndex("by_organization", (q) => q.eq("organizationId", member.organizationId))
        .unique();
      if (orgConfig) {
        return orgConfig;
      }
    }

    // Fallback to old email-based lookup (for migration)
    return await ctx.db
      .query("google_drive_configs")
      .withIndex("by_email", (q) => q.eq("connectedByEmail", args.email))
      .first();
  },
});

/**
 * Set Google Drive tokens for an organization
 */
export const setTokensForOrganization = mutation({
  args: {
    organizationId: v.id("organizations"),
    connectedByEmail: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    tokenExpiry: v.number(),
    userEmail: v.optional(v.string()),
    userName: v.optional(v.string()),
  },
  handler: async (ctx: MutationCtx, args) => {
    const existing = await ctx.db
      .query("google_drive_configs")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        connectedByEmail: args.connectedByEmail,
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        tokenExpiry: args.tokenExpiry,
        userEmail: args.userEmail,
        userName: args.userName,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("google_drive_configs", {
      organizationId: args.organizationId,
      connectedByEmail: args.connectedByEmail,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      tokenExpiry: args.tokenExpiry,
      userEmail: args.userEmail,
      userName: args.userName,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Set tokens for email (backwards compatibility - gets user's org)
 */
export const setTokensForEmail = mutation({
  args: {
    email: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    tokenExpiry: v.number(),
    userEmail: v.optional(v.string()),
    userName: v.optional(v.string()),
  },
  handler: async (ctx: MutationCtx, args) => {
    // Get or create organization for user
    const member = await ctx.db
      .query("organization_members")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    let organizationId: Id<"organizations">;
    if (member) {
      organizationId = member.organizationId;
    } else {
      // Create default organization for user inline
      const now = Date.now();
      organizationId = await ctx.db.insert("organizations", {
        name: `${args.email.split("@")[0]}'s Organization`,
        createdAt: now,
        updatedAt: now,
      });

      // Add user as owner
      await ctx.db.insert("organization_members", {
        organizationId,
        email: args.email,
        role: "owner",
        createdAt: now,
        updatedAt: now,
      });
    }

    // Use the same logic as setTokensForOrganization
    const existing = await ctx.db
      .query("google_drive_configs")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        connectedByEmail: args.email,
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        tokenExpiry: args.tokenExpiry,
        userEmail: args.userEmail,
        userName: args.userName,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("google_drive_configs", {
      organizationId,
      connectedByEmail: args.email,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      tokenExpiry: args.tokenExpiry,
      userEmail: args.userEmail,
      userName: args.userName,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Disconnect Google Drive for an organization
 */
export const disconnectAccount = mutation({
  args: { 
    organizationId: v.optional(v.id("organizations")),
    email: v.optional(v.string()), // For backwards compatibility
  },
  handler: async (ctx: MutationCtx, args) => {
    let organizationId: Id<"organizations"> | undefined = args.organizationId;

    // If email provided but no orgId, get user's org
    if (!organizationId && args.email) {
      const member = await ctx.db
        .query("organization_members")
        .withIndex("by_email", (q) => q.eq("email", args.email!))
        .first();
      if (member) {
        organizationId = member.organizationId;
      }
    }

    if (!organizationId) {
      // Fallback to old email-based lookup
      if (args.email) {
        const existing = await ctx.db
          .query("google_drive_configs")
          .withIndex("by_email", (q) => q.eq("connectedByEmail", args.email!))
          .first();
        if (existing) {
          await ctx.db.patch(existing._id, {
            accessToken: undefined,
            refreshToken: undefined,
            tokenExpiry: undefined,
            userEmail: undefined,
            userName: undefined,
            updatedAt: Date.now(),
          });
          return existing._id;
        }
      }
      return null;
    }

    const existing = await ctx.db
      .query("google_drive_configs")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId!))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        accessToken: undefined,
        refreshToken: undefined,
        tokenExpiry: undefined,
        userEmail: undefined,
        userName: undefined,
        updatedAt: Date.now(),
      });
      return existing._id;
    }
    return null;
  },
});

