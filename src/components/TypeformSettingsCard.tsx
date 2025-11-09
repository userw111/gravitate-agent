"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function TypeformSettingsCard({ email, appUrl }: { email: string; appUrl: string }) {
  const cfg = useQuery(api.typeform.getConfigForEmail, { email });
  const setSecret = useMutation(api.typeform.setSecretForEmail);
  const [pending, setPending] = React.useState(false);
  const [copied, setCopied] = React.useState<"endpoint" | "secret" | null>(null);
  const endpoint = `${appUrl}/api/typeform/webhook?user=${encodeURIComponent(email)}`;

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
        Add the endpoint to your Typeform webhook and paste the secret there as well. We’ll use it
        to verify requests later.
      </p>
    </div>
  );
}


