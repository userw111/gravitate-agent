"use client";

import * as React from "react";
import { ModelSelector } from "@/components/ModelSelector";
import { ThinkingEffortSelector } from "@/components/ThinkingEffortSelector";
import type { ThinkingEffort } from "@/components/ModelSelector";

export default function ChatHeader({
  model,
  onModelChange,
  thinkingEffort,
  onThinkingEffortChange,
}: {
  model?: string;
  onModelChange?: (model: string) => void;
  thinkingEffort?: ThinkingEffort;
  onThinkingEffortChange?: (effort: ThinkingEffort) => void;
}) {
  const [selectedModel, setSelectedModel] = React.useState(model || "openai/gpt-5");

  React.useEffect(() => {
    if (model && model !== selectedModel) {
      setSelectedModel(model);
    }
  }, [model, selectedModel]);

  function handleChange(newModel: string) {
    setSelectedModel(newModel);
    onModelChange?.(newModel);
  }

  return (
    <div className="flex items-center gap-4 border-b border-foreground/10 px-4 py-2">
      <ModelSelector value={selectedModel} onValueChange={handleChange} />
      {thinkingEffort && onThinkingEffortChange && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground/60 whitespace-nowrap">Thinking Effort:</span>
          <ThinkingEffortSelector
            value={thinkingEffort}
            onValueChange={onThinkingEffortChange}
          />
        </div>
      )}
    </div>
  );
}

