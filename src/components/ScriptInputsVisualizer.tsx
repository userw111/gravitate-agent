"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

type ScriptInputsVisualizerProps = {
  ownerEmail: string;
  client: Doc<"clients">;
};

export function ScriptInputsVisualizer({
  ownerEmail,
  client,
}: ScriptInputsVisualizerProps) {
  const scriptSettings = useQuery(api.scriptSettings.getSettingsForEmail, {
    email: ownerEmail,
  });

  const systemPrompt = useQuery(api.systemPrompts.getSystemPrompt, {
    email: ownerEmail,
  });

  const typeformResponse = useQuery(
    api.typeform.getResponseByResponseId,
    client.onboardingResponseId
      ? { responseId: client.onboardingResponseId }
      : "skip",
  );

  const transcripts = useQuery(api.fireflies.getTranscriptsForClient, {
    clientId: client._id as Id<"clients">,
  });

  const openrouterConfig = useQuery(api.openrouter.getConfigForEmail, {
    email: ownerEmail,
  });

  const hasTypeform = Boolean(typeformResponse);
  const hasTranscripts = Boolean(transcripts && transcripts.length > 0);
  const hasOpenRouterKey = Boolean(openrouterConfig?.apiKey);
  const hasSystemPrompt = Boolean(systemPrompt);

  return (
    <div className="space-y-6">
      <p className="text-sm text-foreground/70">
        This diagram shows the system that generates scripts for this client,
        and which pieces of data are currently connected.
      </p>

      {/* High-level flow */}
      <div className="space-y-4">
        <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex-1 rounded-lg border border-foreground/10 bg-background/70 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/60">
              1. Onboarding Form (Typeform)
            </p>
            <p className="mt-1 text-xs text-foreground/80">
              Answers captured from your onboarding Typeform, stored in
              Convex&apos;s <code>typeform_responses</code> table.
            </p>
            <p className="mt-2 text-xs">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${
                  hasTypeform
                    ? "bg-green-500/10 text-green-600"
                    : "bg-foreground/10 text-foreground/60"
                }`}
              >
                {hasTypeform
                  ? "Linked Typeform response found"
                  : "No onboarding response linked"}
              </span>
            </p>
          </div>
          <div className="hidden text-center text-xs text-foreground/60 md:block">
            ⇣
          </div>
          <div className="flex-1 rounded-lg border border-foreground/10 bg-background/70 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/60">
              2. Client Record (Convex)
            </p>
            <p className="mt-1 text-xs text-foreground/80">
              Normalized client row in the <code>clients</code> table. This is
              what powers your dashboard and scheduling.
            </p>
            <ul className="mt-2 space-y-1 text-xs text-foreground/80">
              <li>
                <span className="text-foreground/60">Business:</span>{" "}
                {client.businessName || "Unknown"}
              </li>
              <li>
                <span className="text-foreground/60">Emails:</span>{" "}
                {client.businessEmail ||
                (client.businessEmails && client.businessEmails.length > 0)
                  ? [client.businessEmail, ...(client.businessEmails || [])]
                      .filter(Boolean)
                      .join(", ")
                  : "Not set"}
              </li>
              <li>
                <span className="text-foreground/60">Target revenue:</span>{" "}
                {client.targetRevenue
                  ? `$${client.targetRevenue.toLocaleString()}`
                  : "Not set"}
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex-1 rounded-lg border border-foreground/10 bg-background/70 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/60">
              3. Call Transcripts (Fireflies)
            </p>
            <p className="mt-1 text-xs text-foreground/80">
              Meeting transcripts and AI notes linked to this client in
              <code> fireflies_transcripts</code>.
            </p>
            <p className="mt-2 text-xs">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${
                  hasTranscripts
                    ? "bg-green-500/10 text-green-600"
                    : "bg-foreground/10 text-foreground/60"
                }`}
              >
                {hasTranscripts
                  ? `${transcripts!.length} transcript(s) linked`
                  : "No transcripts linked"}
              </span>
            </p>
          </div>
          <div className="hidden text-center text-xs text-foreground/60 md:block">
            ⇣
          </div>
          <div className="flex-1 rounded-lg border border-foreground/10 bg-background/70 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/60">
              4. Script Settings &amp; System Prompt
            </p>
            <p className="mt-1 text-xs text-foreground/80">
              Per-user script generation settings from{" "}
              <code>script_settings</code> plus the system prompt from{" "}
              <code>system_prompts</code>.
            </p>
            <ul className="mt-2 space-y-1 text-xs text-foreground/80">
              <li>
                <span className="text-foreground/60">Model:</span>{" "}
                {scriptSettings?.defaultModel ?? "openai/gpt-5"}
              </li>
              <li>
                <span className="text-foreground/60">Thinking effort:</span>{" "}
                {scriptSettings?.defaultThinkingEffort ?? "high"}
              </li>
              <li>
                <span className="text-foreground/60">Auto-generate on sync:</span>{" "}
                {scriptSettings?.autoGenerateOnSync === false
                  ? "Disabled"
                  : "Enabled"}
              </li>
              <li>
                <span className="text-foreground/60">System prompt:</span>{" "}
                {hasSystemPrompt ? "Custom or default prompt loaded" : "Missing"}
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex-1 rounded-lg border border-foreground/10 bg-background/70 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/60">
              5. LLM Provider (OpenRouter)
            </p>
            <p className="mt-1 text-xs text-foreground/80">
              API key stored in Convex in <code>openrouter_configs</code>, used
              by Next.js API routes to call the model.
            </p>
            <p className="mt-2 text-xs">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${
                  hasOpenRouterKey
                    ? "bg-green-500/10 text-green-600"
                    : "bg-foreground/10 text-foreground/60"
                }`}
              >
                {hasOpenRouterKey
                  ? "Convex OpenRouter key configured"
                  : "No Convex OpenRouter key (may fall back to env var)"}
              </span>
            </p>
          </div>
          <div className="hidden text-center text-xs text-foreground/60 md:block">
            ⇣
          </div>
          <div className="flex-1 rounded-lg border border-foreground/10 bg-background/70 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/60">
              6. Script Generation (Next.js APIs)
            </p>
            <p className="mt-1 text-xs text-foreground/80">
              Next.js routes like{" "}
              <code>/api/scripts/generate-from-response</code> and{" "}
              <code>/api/scripts/generate-from-client</code> combine all of the
              above to generate new scripts into the <code>scripts</code> table.
            </p>
            <p className="mt-2 text-xs text-foreground/60">
              This tab is a visualization only; use the{" "}
              <span className="font-medium">Scripts</span> tab to view and edit
              individual outputs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

