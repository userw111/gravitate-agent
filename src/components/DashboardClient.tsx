"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { extractClientInfo, type ClientInfo } from "@/lib/typeform";
import ClientTile from "./ClientTile";
import { SegmentedControl } from "./ui/segmented-control";
import * as React from "react";

type DashboardClientProps = {
  email: string;
};

type ClientStatus = "all" | "active" | "paused" | "unknown";

export default function DashboardClient({ email }: DashboardClientProps) {
  const [filter, setFilter] = React.useState<ClientStatus>("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const responses = useQuery(api.typeform.getAllResponsesForEmail, { email });

  if (responses === undefined) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-foreground/60 font-light">Loading clients...</p>
      </div>
    );
  }

  if (responses.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-foreground/60 font-light">
          No clients found. Sync responses from your Typeform to get started.
        </p>
      </div>
    );
  }

  // Extract client info from each response
  const allClients: ClientInfo[] = responses.map((response) => {
    const clientInfo = extractClientInfo(response.payload as Parameters<typeof extractClientInfo>[0]);
    return clientInfo;
  });

  // Filter clients based on selected status and search query
  const filteredClients = React.useMemo(() => {
    let clients = allClients;

    // Filter by status
    if (filter !== "all") {
      // For now, all clients have "Unknown" status, so we'll filter accordingly
      // This can be enhanced when status tracking is implemented
      if (filter === "unknown") {
        clients = allClients; // All current clients are unknown
      } else if (filter === "active") {
        clients = []; // No active clients yet
      } else if (filter === "paused") {
        clients = []; // No paused clients yet
      }
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      clients = clients.filter((client) => {
        const businessName = client.businessName?.toLowerCase() || "";
        const firstName = client.firstName?.toLowerCase() || "";
        const lastName = client.lastName?.toLowerCase() || "";
        const fullName = `${firstName} ${lastName}`.trim();
        const email = client.email?.toLowerCase() || "";
        
        return (
          businessName.includes(query) ||
          firstName.includes(query) ||
          lastName.includes(query) ||
          fullName.includes(query) ||
          email.includes(query)
        );
      });
    }

    return clients;
  }, [allClients, filter, searchQuery]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-2xl font-bold text-foreground">
          Clients
        </h2>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search Bar */}
          <div className="relative flex-1 sm:flex-initial sm:w-64">
            <input
              type="text"
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-foreground/15 bg-background/50 px-4 py-2 pl-10 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
            />
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40"
            >
              <path
                d="M7 12C9.76142 12 12 9.76142 12 7C12 4.23858 9.76142 2 7 2C4.23858 2 2 4.23858 2 7C2 9.76142 4.23858 12 7 12Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M14 14L10.5 10.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <SegmentedControl
            options={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "paused", label: "Paused" },
              { value: "unknown", label: "Unknown" },
            ]}
            value={filter}
            onChange={(value) => setFilter(value as ClientStatus)}
          />
        </div>
      </div>
      {filteredClients.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-foreground/60 font-light">
            No {filter === "all" ? "" : filter} clients found.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredClients.map((client, index) => {
            const response = responses.find((r) => {
              const clientInfo = extractClientInfo(r.payload as Parameters<typeof extractClientInfo>[0]);
              return clientInfo.responseId === client.responseId;
            });
            return response ? (
              <ClientTile key={response._id} client={client} responseId={response._id} />
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

