"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { extractClientInfo } from "@/lib/typeform";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import * as React from "react";

type UpcomingScriptsProps = {
  email: string;
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getDaysUntil(dateString: string | null): number | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function getNextScriptDate(submittedAt: string | null): string | null {
  if (!submittedAt) return null;
  const date = new Date(submittedAt);
  date.setDate(date.getDate() + 7);
  return date.toISOString();
}

export default function UpcomingScripts({ email }: UpcomingScriptsProps) {
  const responses = useQuery(api.typeform.getAllResponsesForEmail, { email });

  if (responses === undefined) {
    return (
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-foreground">Upcoming Scripts</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground/60 font-light">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  // Extract client info and calculate upcoming scripts
  const upcomingScripts = responses
    .map((response) => {
      const clientInfo = extractClientInfo(response.payload as Parameters<typeof extractClientInfo>[0]);
      const nextScriptDate = getNextScriptDate(clientInfo.submittedAt);
      const daysUntil = nextScriptDate ? getDaysUntil(nextScriptDate) : null;
      
      return {
        clientInfo,
        nextScriptDate,
        daysUntil,
        responseId: response._id,
      };
    })
    .filter((script) => {
      // Only show scripts in the next 30 days
      if (!script.nextScriptDate || !script.daysUntil) return false;
      return script.daysUntil >= 0 && script.daysUntil <= 30;
    })
    .sort((a, b) => {
      // Sort by days until (soonest first)
      if (!a.daysUntil || !b.daysUntil) return 0;
      return a.daysUntil - b.daysUntil;
    })
    .slice(0, 10); // Limit to 10 upcoming scripts

  if (upcomingScripts.length === 0) {
    return (
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-foreground">Upcoming Scripts</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground/60 font-light">No upcoming scripts scheduled.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-fit bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-lg">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl font-bold text-foreground">Upcoming Scripts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {upcomingScripts.map((script, index) => {
          const displayName = script.clientInfo.businessName || 
            (script.clientInfo.firstName && script.clientInfo.lastName 
              ? `${script.clientInfo.firstName} ${script.clientInfo.lastName}` 
              : script.clientInfo.firstName || "Unknown Client");
          
          const scriptNumber = index + 1;
          
          return (
            <div
              key={script.responseId}
              className="group p-4 rounded-lg border border-foreground/10 bg-background/50 hover:bg-background/80 hover:border-blue-500/30 hover:shadow-md transition-all duration-200 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-foreground text-sm truncate">
                      {displayName}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-foreground/10 text-foreground/70 text-xs font-medium whitespace-nowrap">
                      Script #{scriptNumber}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-foreground/60">
                    <div className="flex items-center gap-1.5">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="text-foreground/40"
                      >
                        <path
                          d="M11 2H3C2.44772 2 2 2.44772 2 3V11C2 11.5523 2.44772 12 3 12H11C11.5523 12 12 11.5523 12 11V3C12 2.44772 11.5523 2 11 2Z"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M9 1V3M5 1V3M2 5H12"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span className="font-light">
                        {script.nextScriptDate ? formatDate(script.nextScriptDate) : "N/A"}
                      </span>
                    </div>
                    {script.daysUntil !== null && (
                      <div className="flex items-center gap-1.5">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          className="text-foreground/40"
                        >
                          <circle
                            cx="7"
                            cy="7"
                            r="6"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M7 3V7L9.5 9.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span className={`font-medium ${
                          script.daysUntil <= 3 ? "text-red-600" : 
                          script.daysUntil <= 7 ? "text-orange-600" : 
                          "text-foreground/60"
                        }`}>
                          {script.daysUntil}d
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

