"use client";

import * as React from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

export default function FirefliesSettingsCard({ email }: { email: string }) {
  const cfg = useQuery(api.fireflies.getConfigForEmail, { email });
  const transcripts = useQuery(api.fireflies.getAllTranscriptsForEmail, { email });
  const setApiKey = useMutation(api.fireflies.setApiKeyForEmail);
  const syncTranscripts = useAction(api.firefliesActions.syncFirefliesTranscripts);
  
  const [pending, setPending] = React.useState(false);
  const [syncPending, setSyncPending] = React.useState(false);
  const [syncResult, setSyncResult] = React.useState<{ synced: number; skipped: number; total: number } | null>(null);
  const [apiKeyValue, setApiKeyValue] = React.useState("");
  const [showUpdateKeyDialog, setShowUpdateKeyDialog] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);

  // Initialize API key input when config loads
  React.useEffect(() => {
    if (cfg?.apiKey && apiKeyValue === "") {
      setApiKeyValue("••••••••");
    } else if (!cfg?.apiKey && apiKeyValue === "••••••••") {
      setApiKeyValue("");
    }
  }, [cfg?.apiKey]);

  const saveApiKey = React.useCallback(async () => {
    if (!apiKeyValue || apiKeyValue.trim() === "" || apiKeyValue === "••••••••") {
      return;
    }
    const keyToSave = apiKeyValue.trim();
    setPending(true);
    try {
      await setApiKey({ email, apiKey: keyToSave });
      setApiKeyValue("••••••••");
      setShowUpdateKeyDialog(false);
    } catch (error) {
      console.error("Failed to save API key:", error);
      alert(error instanceof Error ? error.message : "Failed to save API key");
    } finally {
      setPending(false);
    }
  }, [email, apiKeyValue, setApiKey]);

  const handleUpdateKeyConfirm = React.useCallback(() => {
    setApiKeyValue("");
    setShowUpdateKeyDialog(false);
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('input[type="text"][placeholder*="Fireflies AI API key"]');
      input?.focus();
    }, 100);
  }, []);

  const handleSyncTranscripts = React.useCallback(async () => {
    setSyncPending(true);
    setSyncResult(null);
    try {
      const result = await syncTranscripts({ email });
      setSyncResult(result);
    } catch (error) {
      console.error("Failed to sync transcripts:", error);
      alert(error instanceof Error ? error.message : "Failed to sync transcripts");
    } finally {
      setSyncPending(false);
    }
  }, [email, syncTranscripts]);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <>
      <div className="rounded-lg border border-foreground/10 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-light">Fireflies AI Integration</h2>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-foreground/60 hover:text-foreground transition-colors"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-foreground/70">API Key</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              className={`w-full rounded-md border border-foreground/15 bg-background/50 px-3 py-2 text-sm font-mono ${
                apiKeyValue === "••••••••" && cfg?.apiKey ? "cursor-pointer" : ""
              }`}
              value={apiKeyValue}
              onChange={(e) => {
                setApiKeyValue(e.target.value);
              }}
              onFocus={(e) => {
                if (apiKeyValue === "••••••••" && cfg?.apiKey) {
                  e.target.blur();
                  setShowUpdateKeyDialog(true);
                }
              }}
              onClick={(e) => {
                if (apiKeyValue === "••••••••" && cfg?.apiKey) {
                  e.preventDefault();
                  setShowUpdateKeyDialog(true);
                }
              }}
              placeholder="Enter your Fireflies AI API key"
            />
            <button
              onClick={saveApiKey}
              disabled={pending || !apiKeyValue || apiKeyValue === "••••••••" || apiKeyValue.trim() === ""}
              className="px-4 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
            >
              {pending ? "Saving..." : cfg?.apiKey ? "Update" : "Save"}
            </button>
          </div>
          <p className="text-xs text-foreground/60">
            Get your API key from{" "}
            <a
              href="https://app.fireflies.ai/integrations/custom"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Fireflies AI Developer Settings
            </a>
          </p>
        </div>

        {cfg?.apiKey && (
          <div className="pt-4 border-t border-foreground/10 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium mb-1">Sync Transcripts</h3>
                <p className="text-xs text-foreground/60">
                  Fetch and store call transcripts from Fireflies AI
                </p>
              </div>
              <button
                onClick={handleSyncTranscripts}
                disabled={syncPending}
                className="px-4 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 disabled:opacity-50 transition-all duration-150"
              >
                {syncPending ? "Syncing..." : "Sync Transcripts"}
              </button>
            </div>

            {syncResult && (
              <div className="p-3 rounded-md bg-foreground/5 border border-foreground/10">
                <p className="text-sm text-foreground/70">
                  Synced {syncResult.synced} transcript{syncResult.synced !== 1 ? "s" : ""}
                  {syncResult.skipped > 0 && `, skipped ${syncResult.skipped}`}
                  {syncResult.total > 0 && ` (${syncResult.total} total)`}
                </p>
              </div>
            )}

            {transcripts && transcripts.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">
                  Stored Transcripts ({transcripts.length})
                </h3>
                {expanded && (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {transcripts.map((transcript) => (
                      <div
                        key={transcript._id}
                        className="p-3 rounded-md border border-foreground/10 bg-background/50 hover:bg-background/80 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium truncate">{transcript.title}</h4>
                            <p className="text-xs text-foreground/60 mt-1">
                              {formatDate(transcript.date)}
                              {transcript.duration && ` • ${Math.round(transcript.duration / 60)} min`}
                            </p>
                            {transcript.participants && transcript.participants.length > 0 && (
                              <p className="text-xs text-foreground/50 mt-1">
                                Participants: {transcript.participants.join(", ")}
                              </p>
                            )}
                            {transcript.transcript && (
                              <p className="text-xs text-foreground/60 mt-2 line-clamp-2">
                                {transcript.transcript.substring(0, 200)}
                                {transcript.transcript.length > 200 ? "..." : ""}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Update API Key Dialog */}
      <Dialog open={showUpdateKeyDialog} onOpenChange={setShowUpdateKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update API Key</DialogTitle>
            <DialogDescription>
              Enter your new Fireflies AI API key. The current key will be replaced.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm text-foreground/70">API Key</label>
            <input
              type="text"
              className="w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm font-mono"
              value={apiKeyValue}
              onChange={(e) => setApiKeyValue(e.target.value)}
              placeholder="Enter your Fireflies AI API key"
              autoFocus
            />
          </div>
          <DialogFooter>
            <button
              onClick={() => setShowUpdateKeyDialog(false)}
              className="px-4 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 transition-all duration-150"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdateKeyConfirm}
              className="px-4 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 transition-all duration-150"
            >
              Update
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

