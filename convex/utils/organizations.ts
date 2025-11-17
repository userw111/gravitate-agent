import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

type ReadCtx = QueryCtx | MutationCtx;

/**
 * Get the organization ID for a user by email.
 * Returns null if the user is not part of any organization.
 */
export async function getOrganizationIdForEmail(
  ctx: ReadCtx,
  email: string
): Promise<Id<"organizations"> | null> {
  const member = await ctx.db
    .query("organization_members")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();

  return member ? member.organizationId : null;
}

/**
 * Get or create the organization ID for a user by email.
 * Only available in mutation contexts.
 */
export async function getOrCreateOrganizationIdForEmail(
  ctx: MutationCtx,
  email: string
): Promise<Id<"organizations">> {
  const existing = await getOrganizationIdForEmail(ctx, email);
  if (existing) {
    return existing;
  }

  const now = Date.now();
  const organizationId = await ctx.db.insert("organizations", {
    name: `${email.split("@")[0]}'s Organization`,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("organization_members", {
    organizationId,
    email,
    role: "owner",
    createdAt: now,
    updatedAt: now,
  });

  return organizationId;
}


