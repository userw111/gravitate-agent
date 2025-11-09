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

export default function TypeformSettingsCard({ email, appUrl }: { email: string; appUrl: string }) {
  const cfg = useQuery(api.typeform.getConfigForEmail, { email });
  const latestActivity = useQuery(api.typeform.getLatestActivityForEmail, { email });
  const setSecret = useMutation(api.typeform.setSecretForEmail);
  const setAccessToken = useMutation(api.typeform.setAccessTokenForEmail);
  const syncResponses = useAction(api.typeformActions.syncTypeformResponses);
  const fetchForms = useAction(api.typeformActions.fetchTypeformForms);
  const [pending, setPending] = React.useState(false);
  const [tokenPending, setTokenPending] = React.useState(false);
  const [syncPending, setSyncPending] = React.useState(false);
  const [syncResult, setSyncResult] = React.useState<{ synced: number; skipped: number; total: number } | null>(null);
  const [formId, setFormId] = React.useState("");
  const [forms, setForms] = React.useState<Array<{ id: string; title: string }>>([]);
  const [formsLoading, setFormsLoading] = React.useState(false);
  const [formsError, setFormsError] = React.useState<string | null>(null);
  const [lastAccessToken, setLastAccessToken] = React.useState<string | undefined>(undefined);
  const [copied, setCopied] = React.useState<"endpoint" | "secret" | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [showPayload, setShowPayload] = React.useState(false);
  const [accessTokenValue, setAccessTokenValue] = React.useState("");
  const [showUpdateTokenDialog, setShowUpdateTokenDialog] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const endpoint = `${appUrl}/api/typeform/webhook?user=${encodeURIComponent(email)}`;

  // Initialize access token input when config loads
  React.useEffect(() => {
    if (cfg?.accessToken && accessTokenValue === "") {
      // Show masked value if token exists and input is empty
      setAccessTokenValue("••••••••");
    } else if (!cfg?.accessToken && accessTokenValue === "••••••••") {
      // Clear masked value if token was removed
      setAccessTokenValue("");
    }
  }, [cfg?.accessToken]);

  // Fetch forms when access token is available
  React.useEffect(() => {
    if (!cfg?.accessToken) {
      // Clear forms if access token is removed
      setForms([]);
      setFormsError(null);
      setLastAccessToken(undefined);
      return;
    }
    
    // If access token changed, reset forms to trigger a fresh fetch
    if (lastAccessToken !== cfg.accessToken) {
      setForms([]);
      setLastAccessToken(cfg.accessToken);
    }
    
    // Don't re-fetch if already loading or forms already loaded
    if (formsLoading || forms.length > 0) return;
    
    const loadForms = async () => {
      setFormsLoading(true);
      setFormsError(null);
      try {
        const fetchedForms = await fetchForms({ email });
        setForms(fetchedForms);
      } catch (error) {
        console.error("Failed to fetch forms:", error);
        setFormsError(error instanceof Error ? error.message : "Failed to load forms");
      } finally {
        setFormsLoading(false);
      }
    };

    loadForms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.accessToken, email]);

  // Update relative time every second
  React.useEffect(() => {
    if (!latestActivity) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [latestActivity]);

  // Close modal on ESC key
  React.useEffect(() => {
    if (!showPayload) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowPayload(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [showPayload]);

  const generateSecret = React.useCallback(async () => {
    setPending(true);
    try {
      const random = crypto.getRandomValues(new Uint8Array(32));
      const hex = Array.from(random)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      await setSecret({ email, secret: hex });
    } finally {
      setPending(false);
    }
  }, [email, setSecret]);

  const copyEndpoint = React.useCallback(async () => {
    await navigator.clipboard.writeText(endpoint);
    setCopied("endpoint");
    setTimeout(() => setCopied(null), 2000);
  }, [endpoint]);

  const copySecret = React.useCallback(async () => {
    if (!cfg?.secret) return;
    await navigator.clipboard.writeText(cfg.secret);
    setCopied("secret");
    setTimeout(() => setCopied(null), 2000);
  }, [cfg?.secret]);

  const saveAccessToken = React.useCallback(async () => {
    if (!accessTokenValue || accessTokenValue.trim() === "" || accessTokenValue === "••••••••") {
      return;
    }
    const tokenToSave = accessTokenValue.trim();
    setTokenPending(true);
    try {
      await setAccessToken({ email, accessToken: tokenToSave });
      // Mask the token after successfully saving
      setAccessTokenValue("••••••••");
      setShowUpdateTokenDialog(false);
    } catch (error) {
      console.error("Failed to save access token:", error);
    } finally {
      setTokenPending(false);
    }
  }, [email, accessTokenValue, setAccessToken]);

  const handleUpdateTokenConfirm = React.useCallback(() => {
    setShowUpdateTokenDialog(false);
    setAccessTokenValue("");
    // Focus the input after a brief delay to ensure dialog is closed
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('input[type="text"][placeholder*="Typeform personal access token"]');
      input?.focus();
    }, 100);
  }, []);

  const handleSyncResponses = React.useCallback(async () => {
    if (!formId.trim()) {
      alert("Please select a form");
      return;
    }
    setSyncPending(true);
    setSyncResult(null);
    try {
      const result = await syncResponses({
        email,
        formId: formId.trim(),
      });
      setSyncResult(result);
    } catch (error) {
      console.error("Failed to sync responses:", error);
      alert(error instanceof Error ? error.message : "Failed to sync responses");
    } finally {
      setSyncPending(false);
    }
  }, [email, formId, syncResponses]);

  return (
    <div className="rounded-lg border border-foreground/10 p-6 space-y-4">
      <h2 className="text-lg font-light">Typeform Webhook</h2>
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
            className="w-full rounded-md border border-foreground/15 bg-background/50 px-3 py-2 text-sm"
            value={cfg?.secret ?? ""}
            placeholder="No secret set"
            readOnly
          />
          <button
            onClick={generateSecret}
            disabled={pending}
            className="px-3 py-2 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50"
          >
            {cfg?.secret ? "Regenerate" : "Generate"}
          </button>
          <button
            onClick={copySecret}
            disabled={!cfg?.secret}
            className="px-3 py-2 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50 transition-all duration-150 relative overflow-hidden flex items-center justify-center"
          >
            <span className={`inline-block transition-all duration-200 ${copied === "secret" ? "animate-elastic-bounce scale-110" : ""}`}>
              {copied === "secret" ? "Copied!" : "Copy"}
            </span>
          </button>
        </div>
      </div>
      <p className="text-xs text-foreground/60">
        Add the endpoint to your Typeform webhook and paste the secret there as well. We'll use it
        to verify requests later.
      </p>

      <div className="pt-4 border-t border-foreground/10 space-y-2">
        <label className="text-sm text-foreground/70">Personal Access Token</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            className={`w-full rounded-md border border-foreground/15 bg-background/50 px-3 py-2 text-sm font-mono ${
              accessTokenValue === "••••••••" && cfg?.accessToken ? "cursor-pointer" : ""
            }`}
            value={accessTokenValue}
            onChange={(e) => {
              setAccessTokenValue(e.target.value);
            }}
            onFocus={(e) => {
              // Show dialog if token is masked
              if (accessTokenValue === "••••••••" && cfg?.accessToken) {
                e.target.blur();
                setShowUpdateTokenDialog(true);
              }
            }}
            onClick={(e) => {
              // Show dialog if token is masked
              if (accessTokenValue === "••••••••" && cfg?.accessToken) {
                e.preventDefault();
                setShowUpdateTokenDialog(true);
              }
            }}
            readOnly={accessTokenValue === "••••••••" && !!cfg?.accessToken}
            placeholder={cfg?.accessToken ? "Click to update token" : "Enter your Typeform personal access token"}
            disabled={tokenPending}
          />
          <button
            onClick={saveAccessToken}
            disabled={tokenPending || !accessTokenValue || accessTokenValue.trim() === "" || accessTokenValue === "••••••••"}
            className="px-3 py-2 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {tokenPending ? "Saving..." : cfg?.accessToken ? "Update" : "Save"}
          </button>
        </div>
        <p className="text-xs text-foreground/60">
          Required for accessing the Typeform Responses API.{" "}
          <a
            href="https://www.typeform.com/developers/get-started/personal-access-token/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground/80 transition-colors"
          >
            Learn how to generate a token
          </a>
        </p>
      </div>

      <div className="pt-4 border-t border-foreground/10 space-y-2">
        <label className="text-sm text-foreground/70">Sync Responses</label>
        <div className="flex items-center gap-2">
          <select
            className="w-full rounded-md border border-foreground/15 bg-background/50 px-3 py-2 text-sm"
            value={formId}
            onChange={(e) => setFormId(e.target.value)}
            disabled={syncPending || formsLoading || !cfg?.accessToken}
          >
            <option value="">
              {formsLoading ? "Loading forms..." : formsError ? "Error loading forms" : forms.length === 0 ? "No forms available" : "Select a form"}
            </option>
            {forms.map((form) => (
              <option key={form.id} value={form.id}>
                {form.title}
              </option>
            ))}
          </select>
          <button
            onClick={handleSyncResponses}
            disabled={syncPending || !formId.trim() || !cfg?.accessToken || formsLoading}
            className="px-4 py-2 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 font-light"
          >
            {syncPending ? "Syncing..." : "Sync All"}
          </button>
        </div>
        {formsError && (
          <p className="text-xs text-red-500/80">
            {formsError}
          </p>
        )}
        {syncResult && (
          <p className="text-xs text-foreground/60">
            Synced {syncResult.synced} new responses, skipped {syncResult.skipped} duplicates out of {syncResult.total} total.
          </p>
        )}
        <p className="text-xs text-foreground/60">
          Fetches all responses from the selected Typeform form and stores non-duplicates in the database.
        </p>
      </div>

      {latestActivity && (
        <div className="pt-4 border-t border-foreground/10">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full px-4 py-2.5 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5 transition-all duration-150 font-light text-foreground/70 hover:text-foreground"
          >
            Last {latestActivity.type === "webhook" ? "payload received" : "response synced"} {formatRelativeTime(latestActivity.timestamp)}
            <span style={{ display: "none" }}>{tick}</span>
          </button>
        </div>
      )}

      {latestActivity && expanded && (
        <div className="mt-3 pt-3 animate-fade-in-simple">
          <div className="space-y-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="text-foreground/50 font-light">{latestActivity.type === "webhook" ? "Received" : "Synced"}</span>
              <span className="text-foreground">
                {new Date(latestActivity.timestamp).toLocaleString()}
              </span>
            </div>
            {latestActivity.type === "webhook" && latestActivity.eventType && (
              <div className="flex items-center gap-3">
                <span className="text-foreground/50 font-light">Event</span>
                <span className="text-foreground">{latestActivity.eventType}</span>
              </div>
            )}
            {latestActivity.formId && (
              <div className="flex items-center gap-3">
                <span className="text-foreground/50 font-light">Form ID</span>
                <span className="text-foreground font-mono text-[11px]">{latestActivity.formId}</span>
              </div>
            )}
            {latestActivity.type === "synced" && latestActivity.responseId && (
              <div className="flex items-center gap-3">
                <span className="text-foreground/50 font-light">Response ID</span>
                <span className="text-foreground font-mono text-[11px]">{latestActivity.responseId}</span>
              </div>
            )}
            <button
              onClick={() => setShowPayload(true)}
              className="mt-4 w-full px-3 py-2 text-xs rounded-md border border-foreground/15 hover:bg-foreground/5 transition-all duration-150 font-light text-foreground/60 hover:text-foreground"
            >
              View payload
            </button>
          </div>
        </div>
      )}

      {showPayload && latestActivity && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 animate-fade-in-simple"
            onClick={() => setShowPayload(false)}
          />
          {/* Modal */}
          <div className="fixed inset-4 sm:inset-8 md:inset-12 lg:inset-16 xl:inset-24 z-50 flex items-center justify-center animate-fade-in-simple">
            <div
              className="w-full h-full max-w-4xl max-h-[90vh] rounded-lg border border-foreground/10 bg-background shadow-lg flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-foreground/10">
                <h3 className="text-sm font-light text-foreground">Payload</h3>
                <button
                  onClick={() => setShowPayload(false)}
                  className="text-foreground/50 hover:text-foreground transition-colors text-sm font-light"
                >
                  Close
                </button>
              </div>
              {/* Scrollable content */}
              <div className="flex-1 overflow-auto p-4">
                <pre className="text-[10px] font-mono leading-relaxed text-foreground whitespace-pre-wrap wrap-break-word">
                  {JSON.stringify(latestActivity.payload, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </>
      )}

      <Dialog open={showUpdateTokenDialog} onOpenChange={setShowUpdateTokenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Access Token</DialogTitle>
            <DialogDescription>
              Do you want to update your Typeform personal access token? You'll need to enter the new token.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setShowUpdateTokenDialog(false)}
              className="px-3 py-2 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5 transition-all duration-150 font-light"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdateTokenConfirm}
              className="px-3 py-2 text-sm rounded-md border border-foreground/15 bg-foreground text-background hover:bg-foreground/90 transition-all duration-150 font-light"
            >
              Update Token
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


