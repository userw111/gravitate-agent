"use client";

import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { OpenRouterBalance } from "./OpenRouterBalance";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export default function OpenRouterSettingsCard({ email }: { email: string }) {
  const config = useQuery(api.openrouter.getConfigForEmail, { email });
  const setApiKey = useMutation(api.openrouter.setApiKeyForEmail);
  const [apiKeyValue, setApiKeyValue] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = React.useState(false);

  React.useEffect(() => {
    if (config?.apiKey) {
      setApiKeyValue(config.apiKey);
    }
  }, [config]);

  const handleSave = async () => {
    if (!apiKeyValue.trim()) {
      alert("Please enter an API key");
      return;
    }
    setIsSaving(true);
    try {
      await setApiKey({ email, apiKey: apiKeyValue.trim() });
      setShowUpdateDialog(false);
    } catch (error) {
      console.error("Failed to save API key:", error);
      alert("Failed to save API key");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-foreground/10 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-light">OpenRouter</h2>
      </div>

      <div className="space-y-2">
        <Label className="text-sm text-foreground/70">API Key</Label>
        {config?.apiKey ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                type="password"
                value="••••••••••••••••"
                disabled
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={() => setShowUpdateDialog(true)}
                className="cursor-pointer"
              >
                Update
              </Button>
            </div>
            {showUpdateDialog && (
              <div className="space-y-2 p-3 border border-foreground/10 rounded-md bg-background/50">
                <Input
                  type="text"
                  placeholder="Enter your OpenRouter API key"
                  value={apiKeyValue}
                  onChange={(e) => setApiKeyValue(e.target.value)}
                  className="w-full"
                />
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    onClick={handleSave}
                    disabled={isSaving}
                    size="sm"
                    className="cursor-pointer"
                  >
                    {isSaving ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowUpdateDialog(false);
                      setApiKeyValue(config.apiKey || "");
                    }}
                    size="sm"
                    className="cursor-pointer"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              type="text"
              placeholder="Enter your OpenRouter API key"
              value={apiKeyValue}
              onChange={(e) => setApiKeyValue(e.target.value)}
              className="w-full"
            />
            <Button
              variant="default"
              onClick={handleSave}
              disabled={isSaving || !apiKeyValue.trim()}
              className="cursor-pointer"
            >
              {isSaving ? "Saving..." : "Save API Key"}
            </Button>
            <p className="text-xs text-foreground/60">
              Get your API key from{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                openrouter.ai/keys
              </a>
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-sm text-foreground/70">Account Balance</Label>
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


