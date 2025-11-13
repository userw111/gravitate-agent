"use client";

import * as React from "react";

type StatusResponse = {
  clients: { total: number; withScripts: number; withoutScripts: number };
  typeformResponses: { total: number; withScripts: number; withoutScripts: number };
  latestScripts: Array<{ id: string; title: string; createdAt: number; clientName?: string }>;
  note?: string;
  error?: string;
  runs?: Array<{
    _id: string;
    ownerEmail: string;
    responseId?: string;
    clientId?: string;
    status: "queued" | "started" | "generating" | "storing" | "completed" | "failed";
    error?: string;
    steps?: Array<{ name: string; status: "pending" | "running" | "success" | "error"; timestamp: number; detail?: string }>;
    createdAt: number;
    updatedAt: number;
  }>;
};

export default function ScriptGenerationStatusCard() {
  const [data, setData] = React.useState<StatusResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/status/script-generation", { cache: "no-store" });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Failed to load status");
      }
      const json = (await res.json()) as StatusResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    const i = setInterval(load, 15000);
    return () => clearInterval(i);
  }, [load]);

  return (
    <div className="rounded-lg border border-foreground/10 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-light">Script Generation Status</h2>
        <button
          onClick={load}
          className="text-sm text-foreground/60 hover:text-foreground transition-colors"
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-500">Error: {error}</div>
      )}

      {!error && data && (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-md border border-foreground/10 p-3">
              <div className="text-xs text-foreground/60">Clients</div>
              <div className="text-sm">Total: {data.clients.total}</div>
              <div className="text-sm text-foreground/70">With scripts: {data.clients.withScripts}</div>
              <div className="text-sm text-foreground/70">Without scripts: {data.clients.withoutScripts}</div>
            </div>
            <div className="rounded-md border border-foreground/10 p-3">
              <div className="text-xs text-foreground/60">Typeform Responses</div>
              <div className="text-sm">Total: {data.typeformResponses.total}</div>
              <div className="text-sm text-foreground/70">With scripts: {data.typeformResponses.withScripts}</div>
              <div className="text-sm text-foreground/70">Without scripts: {data.typeformResponses.withoutScripts}</div>
            </div>
            <div className="rounded-md border border-foreground/10 p-3">
              <div className="text-xs text-foreground/60">Latest</div>
              <div className="text-sm">
                {data.latestScripts.length > 0 ? (
                  <span>{new Date(data.latestScripts[0].createdAt).toLocaleString()}</span>
                ) : (
                  <span>—</span>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Recent Scripts</div>
            <div className="rounded-md border border-foreground/10">
              <div className="divide-y divide-foreground/10">
                {data.latestScripts.length === 0 && (
                  <div className="px-3 py-2 text-sm text-foreground/60">No scripts found.</div>
                )}
                {data.latestScripts.map((s) => (
                  <div key={s.id} className="px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{s.title}</div>
                      <div className="text-xs text-foreground/60">
                        {new Date(s.createdAt).toLocaleString()}
                      </div>
                    </div>
                    {s.clientName && (
                      <div className="text-xs text-foreground/60">Client: {s.clientName}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Generation Runs</div>
            <div className="rounded-md border border-foreground/10">
              <div className="divide-y divide-foreground/10">
                {!data.runs || data.runs.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-foreground/60">No runs tracked yet.</div>
                ) : (
                  data.runs.map((r) => (
                    <div key={r._id} className="px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">
                          {r.responseId ? `Response ${r.responseId}` : "Manual"} • {r.status}
                        </div>
                        <div className="text-xs text-foreground/60">{new Date(r.updatedAt).toLocaleString()}</div>
                      </div>
                      {r.error && <div className="text-xs text-red-500 mt-1">Error: {r.error}</div>}
                      {r.steps && r.steps.length > 0 && (
                        <div className="mt-2 grid gap-1">
                          {r.steps.map((st, idx) => (
                            <div key={idx} className="flex items-center justify-between">
                              <div className="text-xs text-foreground/70">
                                {st.name} • {st.status}
                                {st.detail ? ` — ${st.detail}` : ""}
                              </div>
                              <div className="text-[10px] text-foreground/50">{new Date(st.timestamp).toLocaleTimeString()}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {data.note && (
            <div className="text-xs text-foreground/60">{data.note}</div>
          )}
        </>
      )}
    </div>
  );
}


