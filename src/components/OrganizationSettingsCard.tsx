"use client";

import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Loader2, Shield, UserPlus, Trash2 } from "lucide-react";

type MemberRole = "owner" | "admin" | "member";

type OrganizationWithRole = {
  _id: Id<"organizations">;
  name: string;
  createdAt: number;
  updatedAt: number;
  memberRole: MemberRole;
};

type OrganizationMember = {
  _id: Id<"organization_members">;
  email: string;
  role: MemberRole;
  createdAt: number;
};

export default function OrganizationSettingsCard({ email }: { email: string }) {
  const org = useQuery(api.organizations.getOrganizationForUser, { email }) as
    | OrganizationWithRole
    | null
    | undefined;

  const members = useQuery(
    api.organizations.getOrganizationMembers,
    org?._id ? { organizationId: org._id } : "skip"
  ) as OrganizationMember[] | undefined;

  const getOrCreateOrganization = useMutation(api.organizations.getOrCreateDefaultOrganization);
  const updateOrganization = useMutation(api.organizations.updateOrganization);
  const addMember = useMutation(api.organizations.addMember);
  const updateMemberRole = useMutation(api.organizations.updateMemberRole);
  const removeMember = useMutation(api.organizations.removeMember);

  const [orgName, setOrgName] = React.useState("");
  const [isSavingName, setIsSavingName] = React.useState(false);
  const [isCreatingOrg, setIsCreatingOrg] = React.useState(false);

  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<MemberRole>("member");
  const [isInviting, setIsInviting] = React.useState(false);

  const [feedback, setFeedback] = React.useState<{ type: "success" | "error"; message: string } | null>(null);

  React.useEffect(() => {
    if (org?.name) {
      setOrgName(org.name);
    }
  }, [org?.name]);

  const canInvite = org?.memberRole === "owner" || org?.memberRole === "admin";
  const canChangeRoles = org?.memberRole === "owner";
  const canRemoveMembers = org?.memberRole === "owner" || org?.memberRole === "admin";

  const handleCreateOrganization = React.useCallback(async () => {
    setIsCreatingOrg(true);
    setFeedback(null);
    try {
      await getOrCreateOrganization({ email });
      setFeedback({ type: "success", message: "Organization created successfully." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create organization.";
      setFeedback({ type: "error", message });
    } finally {
      setIsCreatingOrg(false);
    }
  }, [email, getOrCreateOrganization]);

  const handleSaveName = React.useCallback(async () => {
    if (!org) return;
    const trimmed = orgName.trim();
    if (!trimmed) {
      setFeedback({ type: "error", message: "Organization name cannot be empty." });
      return;
    }

    setIsSavingName(true);
    setFeedback(null);
    try {
      await updateOrganization({
        organizationId: org._id,
        name: trimmed,
        updaterEmail: email,
      });
      setFeedback({ type: "success", message: "Organization name updated." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update organization.";
      setFeedback({ type: "error", message });
    } finally {
      setIsSavingName(false);
    }
  }, [email, org, orgName, updateOrganization]);

  const handleInviteMember = React.useCallback(async () => {
    if (!org) return;
    const normalizedEmail = inviteEmail.trim().toLowerCase();

    if (!normalizedEmail) {
      setFeedback({ type: "error", message: "Please enter an email address." });
      return;
    }

    setIsInviting(true);
    setFeedback(null);
    try {
      await addMember({
        organizationId: org._id,
        email: normalizedEmail,
        role: inviteRole,
        inviterEmail: email,
      });
      setInviteEmail("");
      setInviteRole("member");
      setFeedback({ type: "success", message: `Invited ${normalizedEmail} as ${inviteRole}.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to invite member.";
      setFeedback({ type: "error", message });
    } finally {
      setIsInviting(false);
    }
  }, [addMember, email, inviteEmail, inviteRole, org]);

  const handleRoleChange = React.useCallback(
    async (memberEmail: string, newRole: MemberRole) => {
      if (!org || !canChangeRoles) return;
      setFeedback(null);
      try {
        await updateMemberRole({
          organizationId: org._id,
          email: memberEmail,
          newRole,
          updaterEmail: email,
        });
        setFeedback({ type: "success", message: `Updated ${memberEmail} to ${newRole}.` });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update role.";
        setFeedback({ type: "error", message });
      }
    },
    [canChangeRoles, email, org, updateMemberRole]
  );

  const handleRemoveMember = React.useCallback(
    async (memberEmail: string) => {
      if (!org || !canRemoveMembers) return;
      if (!window.confirm(`Remove ${memberEmail} from the organization?`)) {
        return;
      }
      setFeedback(null);
      try {
        await removeMember({
          organizationId: org._id,
          email: memberEmail,
          removerEmail: email,
        });
        setFeedback({ type: "success", message: `Removed ${memberEmail}.` });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to remove member.";
        setFeedback({ type: "error", message });
      }
    },
    [canRemoveMembers, email, org, removeMember]
  );

  const renderMemberRow = (member: OrganizationMember) => {
    const joined = new Date(member.createdAt).toLocaleDateString();
    const isCurrentUser = member.email === email;

    return (
      <div
        key={member._id}
        className="grid grid-cols-1 sm:grid-cols-4 gap-3 border-t border-foreground/10 py-3 text-sm items-center"
      >
        <div className="font-medium">{member.email}</div>
        <div className="text-foreground/70">{joined}</div>
        <div>
          {canChangeRoles ? (
            <select
              className="w-full rounded-md border border-foreground/15 bg-background px-2 py-1 text-sm"
              value={member.role}
              disabled={!canChangeRoles || (isCurrentUser && member.role === "owner")}
              onChange={(event) =>
                handleRoleChange(member.email, event.target.value as MemberRole)
              }
            >
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="member">Member</option>
            </select>
          ) : (
            <span className="capitalize text-foreground/70">{member.role}</span>
          )}
        </div>
        <div className="flex justify-start sm:justify-end">
          {canRemoveMembers && !isCurrentUser ? (
            <button
              type="button"
              onClick={() => handleRemoveMember(member.email)}
              className="inline-flex items-center gap-1 rounded-md border border-foreground/15 px-3 py-1 text-xs text-foreground/80 hover:bg-foreground/5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          ) : (
            <span className="text-xs text-foreground/50">—</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 rounded-lg border border-foreground/10 p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-light">Organization</h2>
        <p className="text-sm text-foreground/60">
          Manage your workspace name, team members, and access levels.
        </p>
      </div>

      {feedback && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            feedback.type === "success"
              ? "border-green-500/60 bg-green-500/10 text-green-700 dark:text-green-300"
              : "border-red-500/60 bg-red-500/10 text-red-700 dark:text-red-300"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {org === undefined && (
        <div className="flex items-center gap-2 text-sm text-foreground/60">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading organization…
        </div>
      )}

      {org === null && (
        <div className="space-y-3 rounded-md border border-dashed border-foreground/15 p-4 text-sm text-foreground/70">
          <p>You don’t have an organization yet. Create one to invite teammates and share data.</p>
          <button
            type="button"
            onClick={handleCreateOrganization}
            disabled={isCreatingOrg}
            className="inline-flex items-center gap-2 rounded-md border border-foreground/15 bg-foreground text-background px-4 py-2 text-sm font-light hover:bg-foreground/90 disabled:opacity-50"
          >
            {isCreatingOrg ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Shield className="h-4 w-4" />
                Create Organization
              </>
            )}
          </button>
        </div>
      )}

      {org && (
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm text-foreground/70">Organization name</label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                value={orgName}
                onChange={(event) => setOrgName(event.target.value)}
                className="w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm"
                placeholder="e.g. SunsUp Studio"
                disabled={org.memberRole === "member"}
              />
              {org.memberRole !== "member" && (
                <button
                  type="button"
                  onClick={handleSaveName}
                  disabled={isSavingName}
                  className="rounded-md border border-foreground/15 bg-foreground px-4 py-2 text-sm font-light text-background hover:bg-foreground/90 disabled:opacity-50"
                >
                  {isSavingName ? "Saving…" : "Save"}
                </button>
              )}
            </div>
            <p className="text-xs text-foreground/60">
              Current role: <span className="font-medium capitalize">{org.memberRole}</span>
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-foreground/60" />
              <div>
                <p className="text-sm font-medium text-foreground">Invite teammate</p>
                <p className="text-xs text-foreground/60">
                  Owners and admins can invite teammates via email.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="teammate@example.com"
                disabled={!canInvite}
                className="w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm"
              />
              <select
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as MemberRole)}
                disabled={!canInvite}
                className="rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </select>
              <button
                type="button"
                onClick={handleInviteMember}
                disabled={!canInvite || isInviting}
                className="rounded-md border border-foreground/15 bg-foreground px-4 py-2 text-sm font-light text-background hover:bg-foreground/90 disabled:opacity-50"
              >
                {isInviting ? "Inviting…" : "Send Invite"}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Members</p>
                <p className="text-xs text-foreground/60">
                  Manage roles or remove access for your workspace.
                </p>
              </div>
              <span className="text-xs text-foreground/60">{members?.length ?? 0} total</span>
            </div>

            <div className="rounded-md border border-foreground/10">
              <div className="hidden grid-cols-4 gap-3 border-b border-foreground/10 px-4 py-2 text-xs font-medium uppercase tracking-wide text-foreground/60 sm:grid">
                <span>Email</span>
                <span>Joined</span>
                <span>Role</span>
                <span className="text-right">Actions</span>
              </div>

              {!members && (
                <div className="flex items-center gap-2 px-4 py-4 text-sm text-foreground/60">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading members…
                </div>
              )}

              {members?.length === 0 && (
                <div className="px-4 py-4 text-sm text-foreground/60">No members yet.</div>
              )}

              {members?.map((member) => renderMemberRow(member))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


