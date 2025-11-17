import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

/**
 * Get or create a default organization for a user
 * If user doesn't have an org, creates one and adds them as owner
 */
export const getOrCreateDefaultOrganization = mutation({
  args: { email: v.string() },
  handler: async (ctx: MutationCtx, args) => {
    // Check if user is already a member of an organization
    const existingMember = await ctx.db
      .query("organization_members")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existingMember) {
      return existingMember.organizationId;
    }

    // Create a new organization
    const now = Date.now();
    const orgId = await ctx.db.insert("organizations", {
      name: `${args.email.split("@")[0]}'s Organization`,
      createdAt: now,
      updatedAt: now,
    });

    // Add user as owner
    await ctx.db.insert("organization_members", {
      organizationId: orgId,
      email: args.email,
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });

    return orgId;
  },
});

/**
 * Get organization for a user
 */
export const getOrganizationForUser = query({
  args: { email: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    const member = await ctx.db
      .query("organization_members")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!member) {
      return null;
    }

    const org = await ctx.db.get(member.organizationId);
    if (!org) {
      return null;
    }

    return {
      ...org,
      memberRole: member.role,
    };
  },
});

/**
 * Get all organizations for a user (in case they're in multiple)
 */
export const getOrganizationsForUser = query({
  args: { email: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    const members = await ctx.db
      .query("organization_members")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .collect();

    const orgs = await Promise.all(
      members.map(async (member) => {
        const org = await ctx.db.get(member.organizationId);
        if (!org) return null;
        return {
          ...org,
          memberRole: member.role,
        };
      })
    );

    return orgs.filter((org): org is NonNullable<typeof org> => org !== null);
  },
});

/**
 * Get organization by ID
 */
export const getOrganizationById = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db.get(args.organizationId);
  },
});

/**
 * Get all members of an organization
 */
export const getOrganizationMembers = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db
      .query("organization_members")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

/**
 * Create a new organization
 */
export const createOrganization = mutation({
  args: {
    name: v.string(),
    creatorEmail: v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
    const now = Date.now();
    const orgId = await ctx.db.insert("organizations", {
      name: args.name,
      createdAt: now,
      updatedAt: now,
    });

    // Add creator as owner
    await ctx.db.insert("organization_members", {
      organizationId: orgId,
      email: args.creatorEmail,
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });

    return orgId;
  },
});

/**
 * Update organization name
 */
export const updateOrganization = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    updaterEmail: v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
    // Verify user has permission (owner or admin)
    const member = await ctx.db
      .query("organization_members")
      .withIndex("by_organization_email", (q) =>
        q.eq("organizationId", args.organizationId).eq("email", args.updaterEmail)
      )
      .first();

    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      throw new Error("Unauthorized: Only owners and admins can update organizations");
    }

    await ctx.db.patch(args.organizationId, {
      name: args.name,
      updatedAt: Date.now(),
    });

    return args.organizationId;
  },
});

/**
 * Add a member to an organization
 */
export const addMember = mutation({
  args: {
    organizationId: v.id("organizations"),
    email: v.string(),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
    inviterEmail: v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
    // Verify inviter has permission (owner or admin)
    const inviter = await ctx.db
      .query("organization_members")
      .withIndex("by_organization_email", (q) =>
        q.eq("organizationId", args.organizationId).eq("email", args.inviterEmail)
      )
      .first();

    if (!inviter || (inviter.role !== "owner" && inviter.role !== "admin")) {
      throw new Error("Unauthorized: Only owners and admins can add members");
    }

    // Check if member already exists
    const existing = await ctx.db
      .query("organization_members")
      .withIndex("by_organization_email", (q) =>
        q.eq("organizationId", args.organizationId).eq("email", args.email)
      )
      .first();

    if (existing) {
      throw new Error("User is already a member of this organization");
    }

    const now = Date.now();
    await ctx.db.insert("organization_members", {
      organizationId: args.organizationId,
      email: args.email,
      role: args.role,
      createdAt: now,
      updatedAt: now,
    });

    return args.organizationId;
  },
});

/**
 * Remove a member from an organization
 */
export const removeMember = mutation({
  args: {
    organizationId: v.id("organizations"),
    email: v.string(),
    removerEmail: v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
    // Verify remover has permission (owner or admin)
    const remover = await ctx.db
      .query("organization_members")
      .withIndex("by_organization_email", (q) =>
        q.eq("organizationId", args.organizationId).eq("email", args.removerEmail)
      )
      .first();

    if (!remover || (remover.role !== "owner" && remover.role !== "admin")) {
      throw new Error("Unauthorized: Only owners and admins can remove members");
    }

    // Find the member to remove
    const member = await ctx.db
      .query("organization_members")
      .withIndex("by_organization_email", (q) =>
        q.eq("organizationId", args.organizationId).eq("email", args.email)
      )
      .first();

    if (!member) {
      throw new Error("Member not found");
    }

    // Don't allow removing the last owner
    if (member.role === "owner") {
      const owners = await ctx.db
        .query("organization_members")
        .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
        .collect();
      const ownerCount = owners.filter((m) => m.role === "owner").length;
      if (ownerCount <= 1) {
        throw new Error("Cannot remove the last owner of an organization");
      }
    }

    await ctx.db.delete(member._id);
    return args.organizationId;
  },
});

/**
 * Update member role
 */
export const updateMemberRole = mutation({
  args: {
    organizationId: v.id("organizations"),
    email: v.string(),
    newRole: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
    updaterEmail: v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
    // Verify updater has permission (owner only for role changes)
    const updater = await ctx.db
      .query("organization_members")
      .withIndex("by_organization_email", (q) =>
        q.eq("organizationId", args.organizationId).eq("email", args.updaterEmail)
      )
      .first();

    if (!updater || updater.role !== "owner") {
      throw new Error("Unauthorized: Only owners can change member roles");
    }

    // Find the member to update
    const member = await ctx.db
      .query("organization_members")
      .withIndex("by_organization_email", (q) =>
        q.eq("organizationId", args.organizationId).eq("email", args.email)
      )
      .first();

    if (!member) {
      throw new Error("Member not found");
    }

    // Don't allow demoting the last owner
    if (member.role === "owner" && args.newRole !== "owner") {
      const owners = await ctx.db
        .query("organization_members")
        .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
        .collect();
      const ownerCount = owners.filter((m) => m.role === "owner").length;
      if (ownerCount <= 1) {
        throw new Error("Cannot demote the last owner of an organization");
      }
    }

    await ctx.db.patch(member._id, {
      role: args.newRole,
      updatedAt: Date.now(),
    });

    return args.organizationId;
  },
});

/**
 * Check if user has permission in organization
 */
export const hasPermission = query({
  args: {
    organizationId: v.id("organizations"),
    email: v.string(),
    requiredRole: v.optional(v.union(v.literal("owner"), v.literal("admin"), v.literal("member"))),
  },
  handler: async (ctx: QueryCtx, args) => {
    const member = await ctx.db
      .query("organization_members")
      .withIndex("by_organization_email", (q) =>
        q.eq("organizationId", args.organizationId).eq("email", args.email)
      )
      .first();

    if (!member) {
      return false;
    }

    if (!args.requiredRole) {
      return true; // Just checking membership
    }

    const roleHierarchy: Record<string, number> = {
      member: 1,
      admin: 2,
      owner: 3,
    };

    return roleHierarchy[member.role] >= roleHierarchy[args.requiredRole];
  },
});

