"use client";

import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type UnlinkedTranscriptsProps = {
  email: string;
};

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function UnlinkedTranscripts({ email }: UnlinkedTranscriptsProps) {
  const unlinkedTranscripts = useQuery(api.fireflies.getUnlinkedTranscriptsForEmail, { email });
  const clients = useQuery(api.clients.getAllClientsForOwner, { ownerEmail: email });
  const linkTranscript = useMutation(api.clients.linkTranscriptToClient);

  const [linking, setLinking] = React.useState<string | null>(null);

  if (unlinkedTranscripts === undefined || clients === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Unlinked Transcripts</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground/60 font-light">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (unlinkedTranscripts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Unlinked Transcripts</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground/60 font-light">
            All transcripts are linked to clients.
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleLink = async (transcriptId: string, clientId: string) => {
    setLinking(transcriptId);
    try {
      await linkTranscript({
        transcriptId,
        clientId: clientId as any,
      });
    } catch (error) {
      console.error("Failed to link transcript:", error);
      alert(error instanceof Error ? error.message : "Failed to link transcript");
    } finally {
      setLinking(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Unlinked Transcripts ({unlinkedTranscripts.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {unlinkedTranscripts.map((transcript) => {
            // Extract client emails from participants (exclude owner email)
            const clientEmails = transcript.participants?.filter(
              (p) => p.toLowerCase().trim() !== email.toLowerCase().trim()
            ) || [];

            return (
              <div
                key={transcript._id}
                className="p-4 rounded-md border border-foreground/10 bg-background/50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium truncate">{transcript.title}</h4>
                    <p className="text-xs text-foreground/60 mt-1">
                      {formatDate(transcript.date)}
                      {transcript.duration && ` • ${Math.round(transcript.duration / 60)} min`}
                    </p>
                    {clientEmails.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-foreground/50 mb-1">Participants:</p>
                        <div className="flex flex-wrap gap-1">
                          {clientEmails.map((email, idx) => (
                            <span
                              key={idx}
                              className="text-xs px-2 py-0.5 rounded bg-foreground/5 text-foreground/70"
                            >
                              {email}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {transcript.transcript && (
                      <p className="text-xs text-foreground/60 mt-2 line-clamp-2">
                        {transcript.transcript.substring(0, 150)}
                        {transcript.transcript.length > 150 ? "..." : ""}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0">
                    {clients.length > 0 ? (
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleLink(transcript.transcriptId, e.target.value);
                          }
                        }}
                        disabled={linking === transcript.transcriptId}
                        className="text-xs px-3 py-1.5 rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
                        defaultValue=""
                      >
                        <option value="">Link to client...</option>
                        {clients.map((client) => (
                          <option key={client._id} value={client._id}>
                            {client.businessName} ({client.businessEmail})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs text-foreground/50 italic">
                        No clients available
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

