"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Brain } from "lucide-react";
import type { ThinkingEffort } from "./ModelSelector";

const THINKING_EFFORT_KEY = "chat-thinking-effort";

const EFFORT_OPTIONS: { value: ThinkingEffort; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export function ThinkingEffortSelector({
  value,
  onValueChange,
}: {
  value: ThinkingEffort;
  onValueChange: (value: ThinkingEffort) => void;
}) {
  const [selectedEffort, setSelectedEffort] = React.useState<ThinkingEffort>(value);

  React.useEffect(() => {
    // Load saved preference
    const saved = localStorage.getItem(THINKING_EFFORT_KEY);
    if (saved && ["low", "medium", "high"].includes(saved)) {
      setSelectedEffort(saved as ThinkingEffort);
      onValueChange(saved as ThinkingEffort);
    } else {
      setSelectedEffort(value);
    }
  }, [value, onValueChange]);

  function handleChange(newValue: ThinkingEffort) {
    setSelectedEffort(newValue);
    localStorage.setItem(THINKING_EFFORT_KEY, newValue);
    onValueChange(newValue);
  }

  return (
    <Select value={selectedEffort} onValueChange={handleChange}>
      <SelectTrigger className="h-9 w-auto gap-2 border-foreground/10 bg-background/50 hover:bg-background/80 text-sm font-medium px-3 transition-all hover:border-foreground/20">
        <div className="flex items-center gap-2">
          <Brain className="h-3.5 w-3.5 text-foreground/60 shrink-0" />
          <span className="font-medium whitespace-nowrap capitalize">{selectedEffort}</span>
        </div>
      </SelectTrigger>
      <SelectContent className="w-[180px]">
        {EFFORT_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value} className="py-2 cursor-pointer">
            <span className="text-sm capitalize">{option.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

