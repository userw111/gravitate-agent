"use client";

import * as React from "react";
import { Wallet } from "lucide-react";

export function OpenRouterBalance() {
  const [balance, setBalance] = React.useState<number | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function fetchBalance() {
      try {
        setIsLoading(true);
        setError(null);
        const res = await fetch("/api/balance");
        console.log("[Balance Component] Response status:", res.status, res.ok);
        if (!res.ok) {
          const errorText = await res.text();
          console.error("[Balance Component] Error response:", errorText);
          throw new Error("Failed to fetch balance");
        }
        const data = (await res.json()) as { balance?: number };
        console.log("[Balance Component] Received data:", data);
        const balanceValue = typeof data.balance === "number" ? data.balance : null;
        console.log("[Balance Component] Setting balance:", balanceValue);
        setBalance(balanceValue);
      } catch (err) {
        setError("Error");
        console.error("Failed to fetch balance:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchBalance();
    
    // Refresh balance every 30 seconds
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-foreground/5 text-sm text-foreground/60">
        <Wallet className="h-4 w-4" />
        <span>...</span>
      </div>
    );
  }

  if (error || balance === null) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-foreground/5 text-sm text-foreground/60">
        <Wallet className="h-4 w-4" />
        <span>{error || "N/A"}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-foreground/5 text-sm text-foreground/80">
      <Wallet className="h-4 w-4 text-foreground/60" />
      <span className="font-medium">${balance.toFixed(2)}</span>
    </div>
  );
}

