"use client";

import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "./ui/card";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type ClientTileProps = {
  client: {
    _id: Id<"clients">;
    businessName: string;
    businessEmail: string;
    contactFirstName?: string;
    contactLastName?: string;
    status?: "active" | "paused" | "inactive";
    onboardingResponseId?: string;
    createdAt: number;
  };
};

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getNextScriptDate(createdAt: number): string {
  // Calculate next script date (e.g., 7 days after creation)
  const date = new Date(createdAt);
  date.setDate(date.getDate() + 7);
  return formatDate(date.getTime());
}

export default function ClientTile({ client }: ClientTileProps) {
  const router = useRouter();
  
  // TODO: Add query to get transcripts by clientId
  // For now, we'll use createdAt as last call date
  const lastCallDate = client.createdAt;
  
  const displayName = client.businessName || 
    (client.contactFirstName && client.contactLastName ? `${client.contactFirstName} ${client.contactLastName}` : 
    client.contactFirstName || "Unknown Client");
  
  const fullName = client.contactFirstName && client.contactLastName 
    ? `${client.contactFirstName} ${client.contactLastName}` 
    : client.contactFirstName || null;

  const status = client.status || "inactive";

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
            {client.businessEmail && (
              <p className="text-xs text-foreground/50 font-light mt-1 truncate">
                {client.businessEmail}
              </p>
            )}
          </div>
        </div>
        
        {/* Status Tag */}
        <div className="mt-3">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              status === "active"
                ? "bg-green-500 text-white"
                : status === "paused"
                ? "bg-yellow-500 text-white"
                : "bg-foreground/10 text-foreground/70"
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
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
            <span className="font-light">Next script: {getNextScriptDate(client.createdAt)}</span>
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
            <span className="font-light">Last call: {formatDate(lastCallDate)}</span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {client.businessEmail && (
          <div className="space-y-1">
            <p className="text-xs text-foreground/50 font-light">Email</p>
            <a
              href={`mailto:${client.businessEmail}`}
              className="text-sm text-foreground/80 hover:text-foreground transition-colors break-all"
            >
              {client.businessEmail}
            </a>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-0">
        <button
          onClick={() => {
            // Use clientId if we have onboardingResponseId, otherwise use client._id
            const routeId = client.onboardingResponseId || client._id;
            router.push(`/dashboard/clients/${routeId}`);
          }}
          className="w-full px-4 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 transition-all duration-150 font-light"
        >
          View Details
        </button>
      </CardFooter>
    </Card>
  );
}

