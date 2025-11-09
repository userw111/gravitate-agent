"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, Zap } from "lucide-react";

export type ModelOption = {
  value: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
};

const POPULAR_MODELS: ModelOption[] = [
  {
    value: "openai/gpt-5",
    label: "GPT-5",
    description: "Intelligence",
    icon: <Sparkles className="h-3.5 w-3.5" />,
    badge: "Thinking",
  },
  {
    value: "openai/gpt-oss-120b",
    label: "GPT-OSS-120B",
    description: "Speed",
    icon: <Zap className="h-3.5 w-3.5" />,
    badge: "Thinking",
  },
];

const STORAGE_KEY = "chat-model-selection";
const THINKING_EFFORT_KEY = "chat-thinking-effort";

export type ThinkingEffort = "low" | "medium" | "high";

export function ModelSelector({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const [selectedModel, setSelectedModel] = React.useState(value);

  React.useEffect(() => {
    // Load saved preference
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && POPULAR_MODELS.some((m) => m.value === saved)) {
      setSelectedModel(saved);
      onValueChange(saved);
    } else {
      // Default to first model if no saved preference
      const defaultModel = POPULAR_MODELS[0]?.value;
      if (defaultModel && value === defaultModel) {
        setSelectedModel(defaultModel);
        onValueChange(defaultModel);
      }
    }
  }, [onValueChange, value]);

  function handleChange(newValue: string) {
    setSelectedModel(newValue);
    localStorage.setItem(STORAGE_KEY, newValue);
    onValueChange(newValue);
  }

  const selectedModelData = POPULAR_MODELS.find((m) => m.value === selectedModel);

  return (
    <Select value={selectedModel} onValueChange={handleChange}>
      <SelectTrigger className="h-9 w-auto gap-2 border-foreground/10 bg-background/50 hover:bg-background/80 text-sm font-medium px-3 transition-all hover:border-foreground/20">
        {selectedModelData ? (
          <div className="flex items-center gap-2">
            <span className="text-foreground/60 shrink-0">{selectedModelData.icon}</span>
            <div className="flex items-center gap-2">
              <span className="font-medium whitespace-nowrap">{selectedModelData.label}</span>
              {selectedModelData.badge && (
                <span className="text-xs px-1.5 py-0.5 rounded-md bg-foreground/10 text-foreground/70 font-normal shrink-0">
                  {selectedModelData.badge}
                </span>
              )}
            </div>
          </div>
        ) : (
          <SelectValue placeholder="Select model" />
        )}
      </SelectTrigger>
      <SelectContent className="w-[260px]">
        {POPULAR_MODELS.map((model) => (
          <SelectItem key={model.value} value={model.value} className="py-3 cursor-pointer">
            <div className="flex items-start gap-3 w-full">
              <div className="mt-0.5 text-foreground/60 shrink-0">{model.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-sm">{model.label}</span>
                  {model.badge && (
                    <span className="text-xs px-1.5 py-0.5 rounded-md bg-foreground/10 text-foreground/70 font-normal">
                      {model.badge}
                    </span>
                  )}
                </div>
                <span className="text-xs text-foreground/50">{model.description}</span>
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

