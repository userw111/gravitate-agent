"use client";

import * as React from "react";
import { OpenRouterBalance } from "./OpenRouterBalance";

export default function OpenRouterSettingsCard() {
  return (
    <div className="rounded-lg border border-foreground/10 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-light">OpenRouter</h2>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-foreground/70">Account Balance</label>
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground/60">
            Current balance used for AI chat requests
          </span>
          <OpenRouterBalance />
        </div>
      </div>

      <div className="pt-2">
        <a
          className="text-sm text-blue-500 hover:underline"
          href="https://openrouter.ai"
          target="_blank"
          rel="noopener noreferrer"
        >
          Manage your OpenRouter account →
        </a>
      </div>
    </div>
  );
}


