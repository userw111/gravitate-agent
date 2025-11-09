"use client";

import * as React from "react";
import ChatClient from "@/components/ChatClient";
import ChatHeader from "@/components/ChatHeader";
import type { ThinkingEffort } from "@/components/ModelSelector";

export default function ChatPageContent() {
  const [selectedModel, setSelectedModel] = React.useState("openai/gpt-5");
  const [thinkingEffort, setThinkingEffort] = React.useState<ThinkingEffort>("high");

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col pt-14">
      <ChatHeader
        model={selectedModel}
        onModelChange={setSelectedModel}
        thinkingEffort={thinkingEffort}
        onThinkingEffortChange={setThinkingEffort}
      />
      <div className="flex-1 min-h-0">
        <ChatClient model={selectedModel} thinkingEffort={thinkingEffort} />
      </div>
    </div>
  );
}

