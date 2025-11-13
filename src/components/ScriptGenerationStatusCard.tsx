"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";

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

const RECENT_RUNS_LIMIT = 5;

export default function ScriptGenerationStatusCard() {
  const [data, setData] = React.useState<StatusResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

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

  // Filter runs based on search query
  const filteredRuns = React.useMemo(() => {
    if (!data?.runs) return [];
    if (!searchQuery.trim()) return data.runs;
    
    const query = searchQuery.toLowerCase();
    return data.runs.filter((r) => {
      const statusMatch = r.status.toLowerCase().includes(query);
      const responseIdMatch = r.responseId?.toLowerCase().includes(query);
      const errorMatch = r.error?.toLowerCase().includes(query);
      const stepMatch = r.steps?.some((s) => 
        s.name.toLowerCase().includes(query) || 
        s.status.toLowerCase().includes(query) ||
        s.detail?.toLowerCase().includes(query)
      );
      return statusMatch || responseIdMatch || errorMatch || stepMatch;
    });
  }, [data?.runs, searchQuery]);

  const recentRuns = data?.runs?.slice(0, RECENT_RUNS_LIMIT) || [];
  const hasMoreRuns = (data?.runs?.length || 0) > RECENT_RUNS_LIMIT;

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (open) {
      // Reset search when opening dialog
      setSearchQuery("");
    }
  };

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
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Generation Runs</div>
              {hasMoreRuns && (
                <button
                  onClick={() => setDialogOpen(true)}
                  className="text-xs text-foreground/60 hover:text-foreground transition-colors"
                >
                  View All ({data.runs?.length || 0})
                </button>
              )}
            </div>
            <div className="rounded-md border border-foreground/10">
              <div className="divide-y divide-foreground/10">
                {!data.runs || data.runs.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-foreground/60">No runs tracked yet.</div>
                ) : (
                  recentRuns.map((r) => (
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

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>All Generation Runs</DialogTitle>
            <DialogDescription>
              View and search through all script generation runs
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <Input
              placeholder="Search by status, response ID, error message, or step name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
            
            <div className="rounded-md border border-foreground/10 max-h-[60vh] overflow-y-auto">
              <div className="divide-y divide-foreground/10">
                {filteredRuns.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-foreground/60">
                    {searchQuery ? "No runs match your search." : "No runs tracked yet."}
                  </div>
                ) : (
                  filteredRuns.map((r) => (
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
            
            {searchQuery && (
              <div className="text-xs text-foreground/60">
                Showing {filteredRuns.length} of {data?.runs?.length || 0} runs
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


