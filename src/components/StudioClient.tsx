"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { ModelSelector, type ThinkingEffort } from "./ModelSelector";
import { ThinkingEffortSelector } from "./ThinkingEffortSelector";
import { OpenRouterBalance } from "./OpenRouterBalance";
import * as React from "react";

type StudioClientProps = {
  email: string;
};

export default function StudioClient({ email }: StudioClientProps) {
  const [systemPrompt, setSystemPrompt] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [isTesting, setIsTesting] = React.useState(false);
  const [selectedClientId, setSelectedClientId] = React.useState<string>("");
  const [selectedModel, setSelectedModel] = React.useState("openai/gpt-5");
  const [thinkingEffort, setThinkingEffort] = React.useState<ThinkingEffort>("medium");
  const [streamedContent, setStreamedContent] = React.useState("");
  const [streamedReasoning, setStreamedReasoning] = React.useState("");
  const abortControllerRef = React.useRef<AbortController | null>(null);

  const storedPrompt = useQuery(api.systemPrompts.getSystemPromptForEditing, { email });
  const updatePrompt = useMutation(api.systemPrompts.updateSystemPrompt);
  const clients = useQuery(api.clients.getAllClientsForOwner, { ownerEmail: email });
  
  // Get selected client
  const selectedClient = React.useMemo(() => {
    if (!selectedClientId || !clients) return null;
    return clients.find((c) => c._id === selectedClientId);
  }, [selectedClientId, clients]);

  // Get onboarding response for selected client
  const onboardingResponse = useQuery(
    api.typeform.getResponseByResponseId,
    selectedClient?.onboardingResponseId
      ? { responseId: selectedClient.onboardingResponseId }
      : "skip"
  );

  // Load prompt when it's available
  React.useEffect(() => {
    if (storedPrompt && !systemPrompt) {
      setSystemPrompt(storedPrompt);
    }
  }, [storedPrompt, systemPrompt]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updatePrompt({
        email,
        prompt: systemPrompt,
      });
    } catch (error) {
      console.error("Failed to save system prompt:", error);
      alert("Failed to save system prompt. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsTesting(false);
  };

  const handleTest = async () => {
    if (!selectedClient || !onboardingResponse) {
      alert("Please select a client with onboarding data");
      return;
    }

    setIsTesting(true);
    setStreamedContent("");
    setStreamedReasoning("");

    // Create abort controller for cancellation
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch("/api/scripts/test-generation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemPrompt,
          model: selectedModel,
          thinkingEffort,
          businessName: selectedClient.businessName || "Unknown",
          contactFirstName: selectedClient.contactFirstName || "",
          contactLastName: selectedClient.contactLastName || "",
          businessEmail: selectedClient.businessEmail || "",
          targetRevenue: selectedClient.targetRevenue || null,
          servicesOffered: selectedClient.servicesOffered || undefined,
          qaPairs: onboardingResponse.qaPairs || [],
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Check if aborted
          if (abortController.signal.aborted) {
            reader.cancel();
            break;
          }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const dataStr = line.slice(6);
          if (dataStr === "[DONE]") continue;

          try {
            const data = JSON.parse(dataStr);

            if (data.type === "content") {
              setStreamedContent((prev) => prev + (data.content || ""));
            } else if (data.type === "reasoning") {
              setStreamedReasoning((prev) => prev + (data.content || ""));
            } else if (data.type === "done") {
              setIsTesting(false);
              abortControllerRef.current = null;
              return;
            }
          } catch (e) {
            console.error("Failed to parse SSE data:", e);
          }
        }
      }
      } catch (readError) {
        if (abortController.signal.aborted) {
          // User cancelled, don't show error
          return;
        }
        throw readError;
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // User cancelled, just reset state
        setIsTesting(false);
        abortControllerRef.current = null;
        return;
      }
      console.error("Test generation failed:", error);
      alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (!abortController.signal.aborted) {
        setIsTesting(false);
        abortControllerRef.current = null;
      }
    }
  };

  if (storedPrompt === undefined) {
    return (
      <div className="min-h-screen px-4 py-12 bg-background">
        <div className="mx-auto max-w-7xl">
          <div className="text-center py-12">
            <p className="text-sm text-foreground/60 font-light">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-12 bg-background">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h1 className="text-4xl font-light tracking-tight text-foreground mb-3">
                Script Studio
              </h1>
              <p className="text-base text-foreground/60 font-light">
                Edit your global system prompt and test script generation with sample data
              </p>
            </div>
            <OpenRouterBalance />
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* System Prompt Editor */}
            <div className="space-y-4">
            <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md">
              <CardHeader>
                <CardTitle className="text-lg font-medium">System Prompt</CardTitle>
                <p className="text-sm text-foreground/60 font-light">
                  This prompt is used for all script generations. Edit it to customize how scripts are created.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="system-prompt">Prompt</Label>
                  <Textarea
                    id="system-prompt"
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    className="min-h-[300px] font-mono text-sm"
                    placeholder="Enter your system prompt here..."
                  />
                </div>
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full"
                >
                  {isSaving ? "Saving..." : "Save System Prompt"}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Test Studio */}
          <div className="space-y-4">
            <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md">
              <CardHeader>
                <CardTitle className="text-lg font-medium">Test Studio</CardTitle>
                <p className="text-sm text-foreground/60 font-light">
                  Select a client to test script generation with their real data
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="client-select">Select Client</Label>
                      <Select
                        value={selectedClientId}
                        onValueChange={setSelectedClientId}
                      >
                        <SelectTrigger id="client-select">
                          <SelectValue placeholder="Choose a client..." />
                        </SelectTrigger>
                        <SelectContent>
                          {clients && clients.length > 0 ? (
                            clients.map((client) => (
                              <SelectItem key={client._id} value={client._id}>
                                {client.businessName || "Unknown Business"}
                                {client.onboardingResponseId ? "" : " (no onboarding data)"}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="none" disabled>
                              No clients available
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 space-y-2">
                      <Label>Model</Label>
                      <ModelSelector value={selectedModel} onValueChange={setSelectedModel} />
                    </div>
                    <div className="flex-1 space-y-2">
                      <Label>Thinking Effort</Label>
                      <ThinkingEffortSelector value={thinkingEffort} onValueChange={setThinkingEffort} />
                    </div>
                  </div>

                  {selectedClient && (
                    <div className="p-4 border rounded-md bg-muted/30 space-y-2">
                      <div className="text-sm font-medium">
                        {selectedClient.businessName}
                      </div>
                      {selectedClient.contactFirstName || selectedClient.contactLastName ? (
                        <div className="text-xs text-foreground/60">
                          Contact: {[selectedClient.contactFirstName, selectedClient.contactLastName]
                            .filter(Boolean)
                            .join(" ")}
                        </div>
                      ) : null}
                      {selectedClient.businessEmail && (
                        <div className="text-xs text-foreground/60">
                          Email: {selectedClient.businessEmail}
                        </div>
                      )}
                      {selectedClient.targetRevenue && (
                        <div className="text-xs text-foreground/60">
                          Target Revenue: ${selectedClient.targetRevenue.toLocaleString()}
                        </div>
                      )}
                      {onboardingResponse?.qaPairs && (
                        <div className="text-xs text-foreground/60 mt-2">
                          {onboardingResponse.qaPairs.length} Q&A pairs available
                        </div>
                      )}
                      {!onboardingResponse && selectedClient.onboardingResponseId && (
                        <div className="text-xs text-foreground/50">
                          Loading onboarding data...
                        </div>
                      )}
                      {!selectedClient.onboardingResponseId && (
                        <div className="text-xs text-foreground/50">
                          This client has no onboarding data
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={handleTest}
                      disabled={
                        isTesting ||
                        !systemPrompt.trim() ||
                        !selectedClient ||
                        !onboardingResponse
                      }
                      className="flex-1"
                    >
                      {isTesting ? "Generating..." : "Test Generation"}
                    </Button>
                    {isTesting && (
                      <Button
                        onClick={handleCancel}
                        variant="outline"
                        className="shrink-0"
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

          {/* Streaming Response Display */}
          {(streamedContent || streamedReasoning || isTesting) && (
            <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md">
              <CardHeader>
                <CardTitle className="text-lg font-medium">Generated Script</CardTitle>
                <p className="text-sm text-foreground/60 font-light">
                  {isTesting ? "Streaming response..." : "Generation complete"}
                </p>
              </CardHeader>
              <CardContent>
                {streamedReasoning && (
                  <div className="mb-4 p-4 bg-muted/30 rounded-md border border-foreground/10">
                    <div className="text-xs font-medium text-foreground/70 mb-2">Reasoning:</div>
                    <div className="text-sm text-foreground/80 whitespace-pre-wrap font-mono">
                      {streamedReasoning}
                    </div>
                  </div>
                )}
                <div className="max-h-[600px] overflow-auto p-4 bg-muted/30 rounded-md border border-foreground/10">
                  {streamedContent ? (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: streamedContent }}
                    />
                  ) : isTesting ? (
                    <div className="text-sm text-foreground/60 font-light">
                      Waiting for response...
                    </div>
                  ) : null}
                </div>
                {streamedContent && (
                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(streamedContent);
                      }}
                    >
                      Copy HTML
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setStreamedContent("");
                        setStreamedReasoning("");
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

