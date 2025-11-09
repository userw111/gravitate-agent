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

export default function FirefliesSettingsCard({ email, appUrl }: { email: string; appUrl: string }) {
  const cfg = useQuery(api.fireflies.getConfigForEmail, { email });
  const transcripts = useQuery(api.fireflies.getAllTranscriptsForEmail, { email });
  const latestWebhook = useQuery(api.fireflies.getLatestWebhookForEmail, { email });
  const setApiKey = useMutation(api.fireflies.setApiKeyForEmail);
  const setWebhookSecret = useMutation(api.fireflies.setWebhookSecretForEmail);
  const syncTranscripts = useAction(api.firefliesActions.syncFirefliesTranscripts);
  
  const [pending, setPending] = React.useState(false);
  const [secretPending, setSecretPending] = React.useState(false);
  const [testWebhookPending, setTestWebhookPending] = React.useState(false);
  const [syncPending, setSyncPending] = React.useState(false);
  const [syncResult, setSyncResult] = React.useState<{ synced: number; skipped: number; total: number } | null>(null);
  const [apiKeyValue, setApiKeyValue] = React.useState("");
  const [webhookSecretValue, setWebhookSecretValue] = React.useState("");
  const [showUpdateKeyDialog, setShowUpdateKeyDialog] = React.useState(false);
  const [showUpdateSecretDialog, setShowUpdateSecretDialog] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [showPayload, setShowPayload] = React.useState(false);
  const [copied, setCopied] = React.useState<"endpoint" | "secret" | null>(null);
  const [tick, setTick] = React.useState(0);
  
  const endpoint = `${appUrl}/api/fireflies/webhook?user=${encodeURIComponent(email)}`;

  // Initialize API key input when config loads
  React.useEffect(() => {
    if (cfg?.apiKey && apiKeyValue === "") {
      setApiKeyValue("••••••••");
    } else if (!cfg?.apiKey && apiKeyValue === "••••••••") {
      setApiKeyValue("");
    }
  }, [cfg?.apiKey]);

  // Initialize webhook secret input when config loads
  React.useEffect(() => {
    if (cfg?.webhookSecret && webhookSecretValue === "") {
      setWebhookSecretValue("••••••••");
    } else if (!cfg?.webhookSecret && webhookSecretValue === "••••••••") {
      setWebhookSecretValue("");
    }
  }, [cfg?.webhookSecret]);

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

  // Update tick for relative time display
  React.useEffect(() => {
    if (!latestWebhook) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [latestWebhook]);

  // Close modal on ESC key
  React.useEffect(() => {
    if (!showPayload) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowPayload(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [showPayload]);

  const saveWebhookSecret = React.useCallback(async () => {
    if (!webhookSecretValue || webhookSecretValue.trim() === "" || webhookSecretValue === "••••••••") {
      return;
    }
    const secretToSave = webhookSecretValue.trim();
    setSecretPending(true);
    try {
      await setWebhookSecret({ email, webhookSecret: secretToSave });
      setWebhookSecretValue("••••••••");
      setShowUpdateSecretDialog(false);
    } catch (error) {
      console.error("Failed to save webhook secret:", error);
      alert(error instanceof Error ? error.message : "Failed to save webhook secret");
    } finally {
      setSecretPending(false);
    }
  }, [email, webhookSecretValue, setWebhookSecret]);

  const handleUpdateSecretConfirm = React.useCallback(async () => {
    if (!webhookSecretValue || webhookSecretValue.trim() === "" || webhookSecretValue === "••••••••") {
      setShowUpdateSecretDialog(false);
      return;
    }
    await saveWebhookSecret();
  }, [webhookSecretValue, saveWebhookSecret]);

  const copyEndpoint = React.useCallback(async () => {
    await navigator.clipboard.writeText(endpoint);
    setCopied("endpoint");
    setTimeout(() => setCopied(null), 2000);
  }, [endpoint]);

  const copySecret = React.useCallback(async () => {
    if (!cfg?.webhookSecret) return;
    await navigator.clipboard.writeText(cfg.webhookSecret);
    setCopied("secret");
    setTimeout(() => setCopied(null), 2000);
  }, [cfg?.webhookSecret]);

  const sendTestWebhook = React.useCallback(async () => {
    if (!cfg?.webhookSecret) {
      alert("Please paste your webhook secret from Fireflies AI first");
      return;
    }
    
    setTestWebhookPending(true);
    try {
      // Create a test webhook payload similar to what Fireflies would send
      const testPayload = {
        eventType: "transcription.completed",
        meetingId: "test-meeting-" + Date.now(),
        transcriptId: "test-transcript-" + Date.now(),
        title: "Test Meeting",
        date: new Date().toISOString(),
        status: "completed",
      };

      // Compute signature
      const hmac = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(cfg.webhookSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signature = await crypto.subtle.sign("HMAC", hmac, new TextEncoder().encode(JSON.stringify(testPayload)));
      const signatureHex = Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Send test webhook
      // Fireflies uses x-hub-signature header with sha256= prefix
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature": `sha256=${signatureHex}`,
        },
        body: JSON.stringify(testPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Test webhook failed: ${response.status} ${errorText}`);
      }

      alert("Test webhook sent successfully! Check the webhook activity below.");
    } catch (error) {
      console.error("Failed to send test webhook:", error);
      alert(error instanceof Error ? error.message : "Failed to send test webhook");
    } finally {
      setTestWebhookPending(false);
    }
  }, [email, cfg?.webhookSecret, endpoint]);

  function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) {
      return `${diffSeconds} second${diffSeconds !== 1 ? "s" : ""} ago`;
    }
    if (diffMinutes < 60) {
      const remainingSeconds = diffSeconds % 60;
      return `${diffMinutes}:${remainingSeconds.toString().padStart(2, "0")} ago`;
    }
    if (diffHours < 24) {
      const remainingMinutes = diffMinutes % 60;
      return `${diffHours}:${remainingMinutes.toString().padStart(2, "0")} ago`;
    }
    if (diffDays < 7) {
      return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
    }
    return new Date(timestamp).toLocaleDateString();
  }

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

        <div className="pt-4 border-t border-foreground/10 space-y-4">
          <h3 className="text-sm font-medium">Webhook Configuration</h3>
          <div className="space-y-2">
            <label className="text-sm text-foreground/70">Webhook Endpoint</label>
            <div className="flex items-center gap-2">
              <input
                className="w-full rounded-md border border-foreground/15 bg-background/50 px-3 py-2 text-sm"
                value={endpoint}
                readOnly
              />
              <button
                onClick={copyEndpoint}
                className="px-3 py-2 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5 transition-all duration-150 relative overflow-hidden flex items-center justify-center"
              >
                <span className={`inline-block transition-all duration-200 ${copied === "endpoint" ? "animate-elastic-bounce scale-110" : ""}`}>
                  {copied === "endpoint" ? "Copied!" : "Copy"}
                </span>
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-foreground/70">Webhook Secret</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                className={`w-full rounded-md border border-foreground/15 bg-background/50 px-3 py-2 text-sm font-mono ${
                  webhookSecretValue === "••••••••" && cfg?.webhookSecret ? "cursor-pointer" : ""
                }`}
                value={webhookSecretValue}
                onChange={(e) => {
                  setWebhookSecretValue(e.target.value);
                }}
                onFocus={(e) => {
                  if (webhookSecretValue === "••••••••" && cfg?.webhookSecret) {
                    e.target.blur();
                    setShowUpdateSecretDialog(true);
                  }
                }}
                onClick={(e) => {
                  if (webhookSecretValue === "••••••••" && cfg?.webhookSecret) {
                    e.preventDefault();
                    setShowUpdateSecretDialog(true);
                  }
                }}
                placeholder="Paste webhook secret from Fireflies AI"
              />
              <button
                onClick={saveWebhookSecret}
                disabled={secretPending || !webhookSecretValue || webhookSecretValue === "••••••••" || webhookSecretValue.trim() === ""}
                className="px-4 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
              >
                {secretPending ? "Saving..." : cfg?.webhookSecret ? "Update" : "Save"}
              </button>
              <button
                onClick={copySecret}
                disabled={!cfg?.webhookSecret}
                className="px-3 py-2 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50 transition-all duration-150 relative overflow-hidden flex items-center justify-center"
              >
                <span className={`inline-block transition-all duration-200 ${copied === "secret" ? "animate-elastic-bounce scale-110" : ""}`}>
                  {copied === "secret" ? "Copied!" : "Copy"}
                </span>
              </button>
            </div>
          </div>
          <p className="text-xs text-foreground/60">
            Add this endpoint to your Fireflies AI webhook settings and paste the webhook secret that Fireflies provides. The secret will be used to verify incoming webhooks.
          </p>
          {cfg?.webhookSecret && (
            <div className="space-y-2">
              <button
                onClick={sendTestWebhook}
                disabled={testWebhookPending}
                className="px-4 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 disabled:opacity-50 transition-all duration-150"
              >
                {testWebhookPending ? "Testing..." : "Test Webhook Endpoint"}
              </button>
              <p className="text-xs text-foreground/50">
                Simulates a webhook from Fireflies to verify your endpoint is working. Real webhooks will be sent automatically by Fireflies when meetings complete.
              </p>
            </div>
          )}
          {latestWebhook && (
            <div className="p-3 rounded-md bg-foreground/5 border border-foreground/10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground/70">
                    Last webhook received {latestWebhook.receivedAt ? formatRelativeTime(latestWebhook.receivedAt) : "recently"}
                  </p>
                  {latestWebhook.eventType && (
                    <p className="text-xs text-foreground/60 mt-1">Event: {latestWebhook.eventType}</p>
                  )}
                </div>
                <button
                  onClick={() => setShowPayload(true)}
                  className="text-xs text-foreground/60 hover:text-foreground transition-colors"
                >
                  View Payload
                </button>
              </div>
              <span style={{ display: "none" }}>{tick}</span>
            </div>
          )}
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
                            <h4 className="text-sm font-medium truncate">
                              {transcript.title}
                            </h4>
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

      {/* Update Webhook Secret Dialog */}
      <Dialog open={showUpdateSecretDialog} onOpenChange={setShowUpdateSecretDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Webhook Secret</DialogTitle>
            <DialogDescription>
              Enter the webhook secret provided by Fireflies AI. The current secret will be replaced.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm text-foreground/70">Webhook Secret</label>
            <input
              type="text"
              className="w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm font-mono"
              value={webhookSecretValue}
              onChange={(e) => setWebhookSecretValue(e.target.value)}
              placeholder="Paste webhook secret from Fireflies AI"
              autoFocus
            />
          </div>
          <DialogFooter>
            <button
              onClick={() => setShowUpdateSecretDialog(false)}
              className="px-4 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 transition-all duration-150"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdateSecretConfirm}
              className="px-4 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 transition-all duration-150"
            >
              Update
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Webhook Payload Dialog */}
      <Dialog open={showPayload} onOpenChange={setShowPayload}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Webhook Payload</DialogTitle>
            <DialogDescription>
              Latest webhook payload received from Fireflies AI
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {latestWebhook && (
              <pre className="p-4 rounded-md bg-background/50 border border-foreground/10 text-xs overflow-x-auto">
                {JSON.stringify(latestWebhook.payload, null, 2)}
              </pre>
            )}
          </div>
          <DialogFooter>
            <button
              onClick={() => setShowPayload(false)}
              className="px-4 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 transition-all duration-150"
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

