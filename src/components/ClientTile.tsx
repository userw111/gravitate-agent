"use client";

import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "./ui/card";
import type { ClientInfo } from "@/lib/typeform";

type ClientTileProps = {
  client: ClientInfo;
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getNextScriptDate(submittedAt: string | null): string {
  if (!submittedAt) return "N/A";
  // Calculate next script date (e.g., 7 days after submission)
  const date = new Date(submittedAt);
  date.setDate(date.getDate() + 7);
  return formatDate(date.toISOString());
}

export default function ClientTile({ client }: ClientTileProps) {
  const displayName = client.businessName || 
    (client.firstName && client.lastName ? `${client.firstName} ${client.lastName}` : 
    client.firstName || "Unknown Client");
  
  const fullName = client.firstName && client.lastName 
    ? `${client.firstName} ${client.lastName}` 
    : client.firstName || null;

  // Status is always "Unknown" for now (can be enhanced later)
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const status: "Active" | "Unknown" = ("Unknown" as "Active" | "Unknown");

  return (
    <Card className="transition-all duration-200 hover:border-blue-500/30 hover:shadow-lg hover:-translate-y-0.5 bg-linear-to-br from-background to-background/95">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="truncate font-medium">{displayName}</CardTitle>
            {fullName && displayName !== fullName && (
              <p className="text-xs text-foreground/50 font-light mt-1 truncate">
                {fullName}
              </p>
            )}
            {client.email && (
              <p className="text-xs text-foreground/50 font-light mt-1 truncate">
                {client.email}
              </p>
            )}
          </div>
        </div>
        
        {/* Status Tag */}
        <div className="mt-3">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              status === "Active"
                ? "bg-green-500 text-white"
                : "bg-foreground/10 text-foreground/70"
            }`}
          >
            {status}
          </span>
        </div>

        {/* Dates */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-foreground/70">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-foreground/50"
            >
              <path
                d="M12 2h-1V1h-1v1H6V1H5v1H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 12H4V7h8v7z"
                fill="currentColor"
              />
            </svg>
            <span className="font-light">Next script: {getNextScriptDate(client.submittedAt)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-foreground/70">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-foreground/50"
            >
              <path
                d="M14 2h-1V1h-1v1H4V1H3v1H2c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 12H2V6h12v8z"
                fill="currentColor"
              />
            </svg>
            <span className="font-light">Last call: {formatDate(client.submittedAt)}</span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {client.email && (
          <div className="space-y-1">
            <p className="text-xs text-foreground/50 font-light">Email</p>
            <a
              href={`mailto:${client.email}`}
              className="text-sm text-foreground/80 hover:text-foreground transition-colors break-all"
            >
              {client.email}
            </a>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-0">
        <button className="w-full px-4 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 transition-all duration-150 font-light">
          View Details
        </button>
      </CardFooter>
    </Card>
  );
}

