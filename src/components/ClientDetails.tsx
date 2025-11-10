"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { extractClientInfo } from "@/lib/typeform";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useRouter } from "next/navigation";
import * as React from "react";
import type { Id } from "../../convex/_generated/dataModel";
import UnlinkedTranscripts from "./UnlinkedTranscripts";

type ClientDetailsProps = {
  email: string;
  responseId: string; // Can be either clientId or onboardingResponseId
};

function formatShortDate(dateString: string | null): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatMonthYear(dateString: string | null): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatFullDate(dateString: string | null): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getNextScriptDate(submittedAt: string | null): string | null {
  if (!submittedAt) return null;
  const date = new Date(submittedAt);
  date.setDate(date.getDate() + 7);
  return date.toISOString();
}

function getInitials(name: string): string {
  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export default function ClientDetails({ email, responseId }: ClientDetailsProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState("overview");
  
  // Convex IDs typically start with 'j' or 'k' followed by alphanumeric characters
  // Typeform response IDs are longer strings without this prefix
  // Try onboardingResponseId first since that's what ClientTile uses when available
  const clientByResponseId = useQuery(
    api.clients.getClientByOnboardingResponseId,
    { ownerEmail: email, onboardingResponseId: responseId }
  );
  
  // Also try as clientId if it looks like a Convex ID (starts with 'j' or 'k')
  const looksLikeClientId = responseId.length > 15 && (responseId.startsWith("j") || responseId.startsWith("k"));
  const clientById = useQuery(
    api.clients.getClientById,
    looksLikeClientId && !clientByResponseId ? { clientId: responseId as Id<"clients"> } : "skip"
  );
  
  // Get the typeform response if we have an onboardingResponseId
  const typeformResponse = useQuery(
    api.typeform.getResponseByResponseId,
    clientById?.onboardingResponseId || clientByResponseId?.onboardingResponseId
      ? { responseId: clientById?.onboardingResponseId || clientByResponseId?.onboardingResponseId || "" }
      : "skip"
  );
  
  // Get transcripts for this client
  const transcripts = useQuery(
    api.fireflies.getTranscriptsForClient,
    (clientById?._id || clientByResponseId?._id)
      ? { clientId: (clientById?._id || clientByResponseId?._id) as Id<"clients"> }
      : "skip"
  );

  const client = clientByResponseId || clientById;

  // Show loading while queries are in progress
  if (clientByResponseId === undefined && (!looksLikeClientId || clientById === undefined)) {
    return (
      <div className="min-h-screen px-4 py-12 bg-background">
        <div className="mx-auto max-w-7xl">
          <div className="text-center py-12">
            <p className="text-sm text-foreground/60 font-light">Loading client details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen px-4 py-12 bg-background">
        <div className="mx-auto max-w-7xl">
          <div className="text-center py-12">
            <p className="text-sm text-foreground/60 font-light">Client not found.</p>
            <button
              onClick={() => router.push("/dashboard")}
              className="mt-4 px-4 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 transition-all duration-150 font-light"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Use client data from clients table as primary source
  const displayName = client.businessName || 
    (client.contactFirstName && client.contactLastName ? `${client.contactFirstName} ${client.contactLastName}` : 
    client.contactFirstName || "Unknown Client");

  // Extract additional info from typeform response if available
  let additionalInfo: Partial<ReturnType<typeof extractClientInfo>> = {};
  if (typeformResponse) {
    const extracted = extractClientInfo(typeformResponse.payload as Parameters<typeof extractClientInfo>[0]);
    additionalInfo = extracted;
  }

  const totalScriptsGenerated = 0; // TODO: Calculate from scripts table when implemented
  const submittedAt = additionalInfo.submittedAt || new Date(client.createdAt).toISOString();
  const nextScriptDate = getNextScriptDate(submittedAt);
  const lastCallDate = transcripts && transcripts.length > 0 
    ? new Date(transcripts[0].date).toISOString() 
    : submittedAt;
  const memberSinceDate = new Date(client.createdAt).toISOString();

  const initials = displayName
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);

  return (
    <div className="min-h-screen px-4 py-12 bg-background">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push("/dashboard")}
            className="mb-4 text-sm text-foreground/60 hover:text-foreground transition-colors font-light flex items-center gap-2"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M10 12L6 8L10 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back to Dashboard
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">{displayName}</h1>
              <div className="flex items-center gap-3">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    client.status === "active"
                      ? "bg-green-500 text-white"
                      : client.status === "paused"
                      ? "bg-yellow-500 text-white"
                      : "bg-foreground/10 text-foreground/70"
                  }`}
                >
                  {client.status ? client.status.charAt(0).toUpperCase() + client.status.slice(1) : "Inactive"}
                </span>
                <span className="text-sm text-foreground/60 font-light">
                  Next in 18d
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-2 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 transition-all duration-150 font-medium">
                Generate Scripts Now
              </button>
              <button className="px-4 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 transition-all duration-150 font-light">
                Recalculate Dates
              </button>
              <button className="px-4 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 transition-all duration-150 font-light">
                Open Drive Folder
              </button>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Column - Client Information */}
          <div className="lg:col-span-1 space-y-4">
            {/* Client Overview Card */}
            <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md">
              <CardHeader>
                <div className="flex flex-col items-center text-center">
                  <div className="h-20 w-20 rounded-full bg-blue-500 flex items-center justify-center text-white text-2xl font-bold mb-4">
                    {initials}
                  </div>
                  <CardTitle className="text-lg font-bold mb-1">{displayName}</CardTitle>
                  <p className="text-sm text-foreground/60 font-light mb-1">
                    owner: {email.split("@")[0]}
                  </p>
                  {client.businessEmail && (
                    <p className="text-sm text-foreground/60 font-light mb-3">
                      {client.businessEmail}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 justify-center">
                    <span className="px-2 py-1 rounded text-xs font-medium bg-foreground/10 text-foreground/70">
                      SaaS
                    </span>
                    <span className="px-2 py-1 rounded text-xs font-medium bg-foreground/10 text-foreground/70">
                      B2B
                    </span>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Status & Cadence Card */}
            <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md">
              <CardHeader>
                <CardTitle className="text-sm font-medium mb-4">Status & Cadence</CardTitle>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-foreground/60 font-light mb-1 block">Status</label>
                    <select className="w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm">
                      <option>Active</option>
                      <option>Paused</option>
                      <option>Unknown</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-foreground/60 font-light mb-1 block">Cadence</label>
                    <div className="space-y-2">
                      <button className="w-full px-3 py-2 text-sm rounded-md border border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 font-light">
                        +25d then every 4w
                      </button>
                      <button className="w-full px-3 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 font-light">
                        Monthly fixed day
                      </button>
                      <button className="w-full px-3 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 font-light">
                        Custom...
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-foreground/60 font-light mb-1 block">Next Script</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="mm/dd/yyyy"
                        className="flex-1 rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm"
                        defaultValue={nextScriptDate ? formatFullDate(nextScriptDate) : ""}
                      />
                      <button className="px-3 py-2 rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 text-sm">
                        📅
                      </button>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button className="flex-1 px-3 py-1.5 text-xs rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 font-light">
                        Save
                      </button>
                      <button className="flex-1 px-3 py-1.5 text-xs rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 font-light">
                        Revert
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-light cursor-pointer">
                      <input type="checkbox" className="rounded border-foreground/20" />
                      <span>Skip next drop</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm font-light cursor-pointer">
                      <input type="checkbox" defaultChecked className="rounded border-foreground/20" />
                      <span>Resume schedule</span>
                    </label>
                  </div>
                  <p className="text-xs text-foreground/50 font-light">
                    Cadence recalculates from Last Script Date unless you override Next.
                  </p>
                </div>
              </CardHeader>
            </Card>

            {/* Key Dates Card */}
            <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md">
              <CardHeader>
                <CardTitle className="text-sm font-medium mb-4">Key Dates</CardTitle>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-foreground/70">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="text-foreground/50"
                    >
                      <path
                        d="M12 2h-1V1h-1v1H6V1H5v1H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 12H4V7h8v7z"
                        fill="currentColor"
                      />
                    </svg>
                    <span className="font-light">Row Created: {formatFullDate(memberSinceDate)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-foreground/70">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="text-foreground/50"
                    >
                      <path
                        d="M12 2h-1V1h-1v1H6V1H5v1H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 12H4V7h8v7z"
                        fill="currentColor"
                      />
                    </svg>
                    <span className="font-light">Last Script: {formatFullDate(lastCallDate)}</span>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Links & Assets Card */}
            <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Links & Assets</CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Right Column - Overview and Tabs */}
          <div className="lg:col-span-3 space-y-6">
            {/* Metric Tiles - Persistent, above tabs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Scripts Generated */}
              <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-light text-foreground/70">Scripts Generated</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">{totalScriptsGenerated}</div>
                </CardContent>
              </Card>

              {/* Next Script */}
              <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-light text-foreground/70">Next Script</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
                    {nextScriptDate ? formatShortDate(nextScriptDate) : "N/A"}
                  </div>
                </CardContent>
              </Card>

              {/* Last Call */}
              <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-light text-foreground/70">Last Call</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
                    {lastCallDate ? formatShortDate(lastCallDate) : "N/A"}
                  </div>
                </CardContent>
              </Card>

              {/* Member Since */}
              <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-light text-foreground/70">Member Since</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
                    {memberSinceDate ? formatMonthYear(memberSinceDate) : "N/A"}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-foreground/10">
              {["Overview", "Scripts", "Inputs", "Call Intelligence", "Transcripts", "History & Logs"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab.toLowerCase().replace(" & ", "-").replace(" ", "-"))}
                  className={`px-4 py-2 text-sm font-light transition-colors ${
                    activeTab === tab.toLowerCase().replace(" & ", "-").replace(" ", "-")
                      ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                      : "text-foreground/60 hover:text-foreground"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            {activeTab === "overview" && (
              <div className="space-y-4">
                {/* Readiness Card */}
                <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md">
                  <CardHeader>
                    <CardTitle className="text-lg font-bold mb-4">
                      Next Script Due {nextScriptDate ? formatFullDate(nextScriptDate) : "N/A"}
                    </CardTitle>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-green-500">
                          <path d="M13 4L6 11L3 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="font-light">Typeform</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-green-500">
                          <path d="M13 4L6 11L3 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="font-light">Call notes (Oct 28)</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-green-500">
                          <path d="M13 4L6 11L3 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="font-light">Winning angle (CTR 2.8%)</span>
                      </div>
                    </div>
                    <CardContent className="pt-4">
                      <div className="flex gap-2">
                        <button className="px-4 py-2 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 transition-all duration-150 font-medium">
                          Generate Scripts Now
                        </button>
                        <button className="px-4 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 transition-all duration-150 font-light">
                          Preview inputs
                        </button>
                      </div>
                    </CardContent>
                  </CardHeader>
                </Card>

                {/* Angles & Strategy Card */}
                <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium mb-4">Angles & Strategy</CardTitle>
                    <div className="flex flex-wrap gap-2 mb-4">
                      <button className="px-3 py-1.5 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 font-light">
                        New service
                      </button>
                      <button className="px-3 py-1.5 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 font-light">
                        Social proof
                      </button>
                      <button className="px-3 py-1.5 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 font-light">
                        Objection handling
                      </button>
                    </div>
                    <textarea
                      placeholder="Angle notes for next drop..."
                      className="w-full min-h-[120px] rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm font-light resize-none"
                    />
                  </CardHeader>
                </Card>

                {/* Recent Activity Card */}
                <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium mb-4">Recent Activity</CardTitle>
                    <div className="space-y-2 text-sm">
                      <div className="text-foreground/70 font-light">
                        Cadence set to +25d/4w by {email.split("@")[0]} • Today 9:14a
                      </div>
                      <div className="text-red-600 dark:text-red-400 font-light">
                        Error: Drive quota limit • View log
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </div>
            )}

            {/* Transcripts Tab */}
            {activeTab === "transcripts" && (
              <div>
                <UnlinkedTranscripts 
                  email={email} 
                  clientId={client._id} 
                  showEditButton={true}
                />
              </div>
            )}

            {/* Other tabs placeholder */}
            {activeTab !== "overview" && activeTab !== "transcripts" && (
              <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md">
                <CardContent className="py-12 text-center">
                  <p className="text-sm text-foreground/60 font-light">
                    {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} content coming soon...
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-foreground/10 text-center">
          <p className="text-sm text-foreground/60 font-light">
            No scripts yet. Set cadence and click 'Generate Scripts Now'. We'll create the Doc in the client's Drive automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
