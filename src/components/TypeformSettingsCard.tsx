"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

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
  const latestWebhook = useQuery(api.typeform.getLatestWebhookForEmail, { email });
  const setSecret = useMutation(api.typeform.setSecretForEmail);
  const [pending, setPending] = React.useState(false);
  const [copied, setCopied] = React.useState<"endpoint" | "secret" | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [showPayload, setShowPayload] = React.useState(false);
  const [, setTick] = React.useState(0);
  const endpoint = `${appUrl}/api/typeform/webhook?user=${encodeURIComponent(email)}`;

  // Update relative time every second
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
        <label className="text-sm text-foreground/70">Webhook Secret (stored in plain text)</label>
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

      {latestWebhook && (
        <div className="pt-4 border-t border-foreground/10">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full px-4 py-2.5 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5 transition-all duration-150 font-light text-foreground/70 hover:text-foreground"
          >
            Last payload received {formatRelativeTime(latestWebhook.receivedAt)}
          </button>
        </div>
      )}

      {latestWebhook && expanded && (
        <div className="mt-3 pt-3 animate-fade-in-simple">
          <div className="space-y-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="text-foreground/50 font-light">Received</span>
              <span className="text-foreground">
                {new Date(latestWebhook.receivedAt).toLocaleString()}
              </span>
            </div>
            {latestWebhook.eventType && (
              <div className="flex items-center gap-3">
                <span className="text-foreground/50 font-light">Event</span>
                <span className="text-foreground">{latestWebhook.eventType}</span>
              </div>
            )}
            {latestWebhook.formId && (
              <div className="flex items-center gap-3">
                <span className="text-foreground/50 font-light">Form ID</span>
                <span className="text-foreground font-mono text-[11px]">{latestWebhook.formId}</span>
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

      {showPayload && latestWebhook && (
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
                <pre className="text-[10px] font-mono leading-relaxed text-foreground whitespace-pre-wrap break-words">
                  {JSON.stringify(latestWebhook.payload, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


