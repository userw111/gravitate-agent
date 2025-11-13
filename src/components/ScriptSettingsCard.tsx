"use client";

import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ModelSelector } from "./ModelSelector";
import { ThinkingEffortSelector } from "./ThinkingEffortSelector";
import type { ThinkingEffort } from "./ModelSelector";
import { CheckCircle2, XCircle, Loader2, AlertCircle } from "lucide-react";

type LogEntry = {
  type: "info" | "success" | "error" | "warning";
  message: string;
  timestamp: number;
};

export default function ScriptSettingsCard({ email }: { email: string }) {
  const settings = useQuery(api.scriptSettings.getSettingsForEmail, { email });
  const updateSettings = useMutation(api.scriptSettings.updateSettings);
  const [selectedModel, setSelectedModel] = React.useState("openai/gpt-5");
  const [thinkingEffort, setThinkingEffort] = React.useState<ThinkingEffort>("medium");
  const [autoGenerateOnSync, setAutoGenerateOnSync] = React.useState<boolean>(false);
  const [publicAppUrl, setPublicAppUrl] = React.useState<string>("");
  // Cron job template is now fixed: 25 days, then 30 days later, then monthly
  const [isSaving, setIsSaving] = React.useState(false);
  const [isTesting, setIsTesting] = React.useState(false);
  const [testLogs, setTestLogs] = React.useState<LogEntry[]>([]);
  const [testResult, setTestResult] = React.useState<{ clientId?: string; scriptId?: string; error?: string } | null>(null);

  // Initialize from settings when they load
  React.useEffect(() => {
    if (settings) {
      if (settings.defaultModel) {
        setSelectedModel(settings.defaultModel);
      }
      if (settings.defaultThinkingEffort) {
        setThinkingEffort(settings.defaultThinkingEffort);
      }
      if (typeof settings.autoGenerateOnSync === "boolean") {
        setAutoGenerateOnSync(settings.autoGenerateOnSync);
      }
      if (typeof settings.publicAppUrl === "string") {
        setPublicAppUrl(settings.publicAppUrl);
      }
      // Cron job template is deprecated - schedule is now fixed
    }
  }, [settings]);

  const handleSave = React.useCallback(async () => {
    setIsSaving(true);
    try {
      // Validate URL if provided
      const trimmedUrl = publicAppUrl?.trim();
      if (trimmedUrl && trimmedUrl.length > 0) {
        try {
          new URL(trimmedUrl); // Validate URL format
        } catch (urlError) {
          alert(`Invalid URL format: ${trimmedUrl}. Please enter a valid URL (e.g., https://example.com)`);
          setIsSaving(false);
          return;
        }
      }
      
      await updateSettings({
        email,
        defaultModel: selectedModel,
        defaultThinkingEffort: thinkingEffort,
        autoGenerateOnSync,
        publicAppUrl: trimmedUrl || undefined,
        // cronJobTemplate is deprecated - schedule is fixed
      });
      
      // Show success feedback
      alert("Settings saved successfully!");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Failed to save script settings:", error);
      alert(`Failed to save settings: ${errorMessage}`);
    } finally {
      setIsSaving(false);
    }
  }, [email, selectedModel, thinkingEffort, autoGenerateOnSync, publicAppUrl, updateSettings]);

  const handleTestFlow = React.useCallback(async () => {
    setIsTesting(true);
    setTestLogs([]);
    setTestResult(null);

    try {
      const response = await fetch("/api/scripts/test-flow", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Test failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response stream available");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "done") {
                setTestResult({ clientId: parsed.clientId, scriptId: parsed.scriptId });
                setIsTesting(false);
              } else if (parsed.type === "error") {
                setTestResult({ error: parsed.error });
                setIsTesting(false);
              } else {
                setTestLogs((prev) => [...prev, parsed]);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setTestLogs((prev) => [
        ...prev,
        { type: "error", message: `❌ Test failed: ${errorMessage}`, timestamp: Date.now() },
      ]);
      setTestResult({ error: errorMessage });
      setIsTesting(false);
    }
  }, []);

  const clearTestResults = React.useCallback(() => {
    setTestLogs([]);
    setTestResult(null);
  }, []);

  return (
    <div className="rounded-lg border border-foreground/10 p-6 space-y-4">
      <h2 className="text-lg font-light">Script Generation Settings</h2>
      <p className="text-sm text-foreground/60">
        Configure default settings for automatically generated scripts from Typeform responses.
      </p>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm text-foreground/70">Auto-generate scripts on Typeform sync</label>
          <select
            className="w-full px-3 py-2 rounded-md border border-foreground/15 bg-background text-sm"
            value={autoGenerateOnSync ? "enabled" : "disabled"}
            onChange={(e) => setAutoGenerateOnSync(e.target.value === "enabled")}
          >
            <option value="disabled">Disabled</option>
            <option value="enabled">Enabled</option>
          </select>
          <p className="text-xs text-foreground/60">
            Choose whether new Typeform responses should automatically create a client (if needed) and generate a script.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-foreground/70">Public App URL</label>
          <input
            type="url"
            placeholder="https://cancellation-sizes-conversion-plant.trycloudflare.com"
            className="w-full px-3 py-2 rounded-md border border-foreground/15 bg-background text-xs font-mono"
            value={publicAppUrl}
            onChange={(e) => setPublicAppUrl(e.target.value)}
          />
          <p className="text-xs text-foreground/60">
            Used by background jobs to call your Next.js APIs. Must be reachable from the internet (e.g., Cloudflared tunnel). Example: https://cancellation-sizes-conversion-plant.trycloudflare.com
          </p>
          {publicAppUrl && (
            <p className="text-xs text-green-600 dark:text-green-400">
              Current value: {publicAppUrl}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <label className="text-sm text-foreground/70">Default Model</label>
          <ModelSelector value={selectedModel} onValueChange={setSelectedModel} />
          <p className="text-xs text-foreground/60">
            The AI model used for generating scripts. Default: openai/gpt-5
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-foreground/70">Default Thinking Effort</label>
          <ThinkingEffortSelector value={thinkingEffort} onValueChange={setThinkingEffort} />
          <p className="text-xs text-foreground/60">
            The reasoning effort level for models that support it. Higher effort may improve quality but increase cost and latency.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-foreground/70">Cron Job Schedule</label>
          <div className="rounded-md border border-foreground/10 bg-background/50 p-3">
            <p className="text-xs text-foreground/70 font-medium mb-2">Fixed Schedule Pattern:</p>
            <ul className="text-xs text-foreground/60 space-y-1 list-disc list-inside">
              <li>Immediate script generation (when client is created)</li>
              <li>25 days later - first cron job</li>
              <li>30 days after that (55 days total) - second cron job</li>
              <li>Then monthly on whatever day the 30-day mark falls on</li>
            </ul>
            <p className="text-xs text-foreground/50 mt-2">
              Example: If client created Jan 1 → Script Jan 1, then Jan 26 (25d), then Feb 25 (30d later), then every 25th monthly.
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 text-sm rounded-md border border-foreground/15 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 font-light"
        >
          {isSaving ? "Saving..." : "Save Settings"}
        </button>
      </div>

      <div className="pt-6 border-t border-foreground/10 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-foreground/70 mb-2">Test Flow</h3>
          <p className="text-xs text-foreground/60 mb-4">
            Test the complete flow: Create a test Typeform response → Create client → Generate script
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleTestFlow}
            disabled={isTesting}
            className="px-4 py-2 text-sm rounded-md border border-blue-500 bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 font-light flex items-center gap-2"
          >
            {isTesting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Testing...
              </>
            ) : (
              "Run Test Flow"
            )}
          </button>
          {(testLogs.length > 0 || testResult) && (
            <button
              onClick={clearTestResults}
              className="px-4 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 transition-all duration-150 font-light"
            >
              Clear
            </button>
          )}
        </div>

        {testLogs.length > 0 && (
          <div className="rounded-md border border-foreground/10 bg-background/50 p-4 max-h-96 overflow-y-auto space-y-1">
            <div className="text-xs font-medium text-foreground/70 mb-2">Test Logs:</div>
            {testLogs.map((log, index) => {
              const Icon =
                log.type === "success" ? CheckCircle2 :
                log.type === "error" ? XCircle :
                log.type === "warning" ? AlertCircle :
                null;
              
              const colorClass =
                log.type === "success" ? "text-green-600 dark:text-green-400" :
                log.type === "error" ? "text-red-600 dark:text-red-400" :
                log.type === "warning" ? "text-yellow-600 dark:text-yellow-400" :
                "text-foreground/70";

              return (
                <div key={index} className={`text-xs font-mono ${colorClass} flex items-start gap-2`}>
                  {Icon && <Icon className="h-3 w-3 mt-0.5 shrink-0" />}
                  <span className="flex-1">{log.message}</span>
                </div>
              );
            })}
          </div>
        )}

        {testResult && (
          <div className={`rounded-md border p-4 ${
            testResult.error
              ? "border-red-500/50 bg-red-500/10"
              : "border-green-500/50 bg-green-500/10"
          }`}>
            {testResult.error ? (
              <div className="flex items-start gap-2">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">
                    Test Failed
                  </div>
                  <div className="text-xs text-red-600/80 dark:text-red-400/80 font-mono">
                    {testResult.error}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-green-600 dark:text-green-400 mb-2">
                    Test Completed Successfully!
                  </div>
                  <div className="text-xs text-foreground/70 space-y-1">
                    {testResult.clientId && (
                      <div className="font-mono">Client ID: {testResult.clientId}</div>
                    )}
                    {testResult.scriptId && (
                      <div className="font-mono">Script ID: {testResult.scriptId}</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

