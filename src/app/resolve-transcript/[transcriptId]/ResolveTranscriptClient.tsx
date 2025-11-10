"use client";

import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type ResolveTranscriptClientProps = {
  transcriptId: string;
};

export function ResolveTranscriptClient({ transcriptId }: ResolveTranscriptClientProps) {
  const transcript = useQuery(api.fireflies.getTranscriptById, { transcriptId });
  const ownerEmail = transcript?.email;
  const clients = useQuery(
    api.clients.getClientsForLinking,
    ownerEmail ? { ownerEmail } : "skip"
  );

  const recordLinkingAttempt = useMutation(api.fireflies.recordLinkingAttempt);

  const [filter, setFilter] = React.useState("");
  const [linkingClientId, setLinkingClientId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  const handleLink = React.useCallback(
    async (clientId: string, clientName: string) => {
      try {
        setError(null);
        setSuccessMessage(null);
        setLinkingClientId(clientId);
        const timestamp = Date.now();
        await recordLinkingAttempt({
          transcriptId,
          clientId: clientId as any,
          overwriteClient: true,
          linkingStatus: "manually_linked",
          lastLinkAttemptAt: timestamp,
          linkingHistoryEntry: {
            stage: "manual_page",
            status: "success",
            timestamp,
            clientId: clientId as any,
            reason: `Linked to ${clientName} via manual resolution page.`,
          },
        });
        setSuccessMessage(`Linked transcript to ${clientName}.`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        setLinkingClientId(null);
      }
    },
    [recordLinkingAttempt, transcriptId]
  );

  const filteredClients = React.useMemo(() => {
    if (!clients) return [];
    const trimmed = filter.trim().toLowerCase();
    if (!trimmed) return clients;
    return clients.filter((client) => {
      const businessName = client.businessName?.toLowerCase() ?? "";
      const businessEmail = client.businessEmail?.toLowerCase() ?? "";
      const contactName = `${client.contactFirstName ?? ""} ${client.contactLastName ?? ""}`
        .trim()
        .toLowerCase();
      return (
        businessName.includes(trimmed) ||
        businessEmail.includes(trimmed) ||
        (contactName && contactName.includes(trimmed))
      );
    });
  }, [clients, filter]);

  if (transcript === undefined) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-sm text-foreground/70">Loading transcript…</p>
      </div>
    );
  }

  if (!transcript) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Transcript not found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground/70">
              We couldn&apos;t find a transcript with ID <code>{transcriptId}</code>. Please verify
              the link or contact support.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
      <div>
        <Link href="/dashboard" className="text-xs uppercase tracking-wide text-foreground/50 hover:text-foreground/70">
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-3xl font-light tracking-tight text-foreground">Resolve Transcript</h1>
        <p className="text-sm text-foreground/60">
          Transcript ID: <span className="font-mono text-xs text-foreground/70">{transcript.transcriptId}</span>
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
          {successMessage}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Transcript Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground/80">Title</p>
            <p className="text-sm text-foreground/70">{transcript.title}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground/80">Date</p>
            <p className="text-sm text-foreground/70">{new Date(transcript.date).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground/80">Participants</p>
            <p className="text-sm text-foreground/70">
              {Array.isArray(transcript.participants) && transcript.participants.length > 0
                ? transcript.participants.join(", ")
                : "None listed"}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground/80">Current Status</p>
            <p className="text-sm capitalize text-foreground/70">
              {(transcript.linkingStatus ?? "unlinked").replace(/_/g, " ")}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground/80">Transcript Preview</p>
            <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-foreground/10 bg-foreground/5 px-3 py-2 text-sm text-foreground/70">
              {transcript.transcript.slice(0, 400)}
              {transcript.transcript.length > 400 ? "…" : ""}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Linking History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.isArray(transcript.linkingHistory) && transcript.linkingHistory.length > 0 ? (
            <ul className="space-y-2 text-sm text-foreground/70">
              {transcript.linkingHistory
                .slice()
                .reverse()
                .map((entry, idx) => (
                  <li key={idx} className="rounded-md border border-foreground/10 bg-foreground/5 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium capitalize text-foreground/80">
                        {entry.stage.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-foreground/50">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 text-xs uppercase tracking-wide text-foreground/50">
                      Status: {entry.status}
                      {typeof entry.confidence === "number"
                        ? ` • Confidence ${(entry.confidence * 100).toFixed(0)}%`
                        : ""}
                    </p>
                    {entry.reason && <p className="mt-1 text-xs text-foreground/60">{entry.reason}</p>}
                    {entry.clientId && (
                      <p className="mt-1 text-xs text-foreground/60">
                        Linked Client ID: <span className="font-mono">{entry.clientId}</span>
                      </p>
                    )}
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-sm text-foreground/60">No linking attempts recorded yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col space-y-4">
          <CardTitle>Select a Client</CardTitle>
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search by business name, contact, or email"
          />
        </CardHeader>
        <CardContent className="space-y-3">
          {!clients ? (
            <p className="text-sm text-foreground/60">Loading clients…</p>
          ) : filteredClients.length === 0 ? (
            <p className="text-sm text-foreground/60">
              No clients match <span className="font-semibold">"{filter}"</span>. Try a different search term.
            </p>
          ) : (
            <ul className="space-y-3">
              {filteredClients.map((client) => (
                <li
                  key={client._id}
                  className="flex flex-col gap-2 rounded-md border border-foreground/10 bg-foreground/5 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground/80">{client.businessName}</p>
                    <p className="text-xs text-foreground/60">{client.businessEmail ?? "No email on file"}</p>
                    <p className="text-xs text-foreground/60">
                      Contact:{" "}
                      {client.contactFirstName || client.contactLastName
                        ? `${client.contactFirstName ?? ""} ${client.contactLastName ?? ""}`.trim()
                        : "Unknown"}
                    </p>
                    <p className="text-xs text-foreground/60">
                      Status: {client.status ? client.status : "unspecified"}
                    </p>
                  </div>
                  <Button
                    variant="default"
                    disabled={linkingClientId === client._id}
                    onClick={() => handleLink(client._id, client.businessName)}
                  >
                    {linkingClientId === client._id ? "Linking…" : "Link Transcript"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

