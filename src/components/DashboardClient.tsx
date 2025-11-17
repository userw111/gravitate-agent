"use client";

import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import ClientTile from "./ClientTile";
import ClientsTable from "./ClientsTable";
import { SegmentedControl } from "./ui/segmented-control";
import CreateManualClientDialog from "./CreateManualClientDialog";
import { Button } from "./ui/button";
import { ArrowUpDown } from "lucide-react";
import * as React from "react";

type DashboardClientProps = {
  email: string;
};

type ClientStatus = "all" | "active" | "paused" | "inactive";

type ViewMode = "grid" | "table";

export default function DashboardClient({ email }: DashboardClientProps) {
  const [filter, setFilter] = React.useState<ClientStatus>("all");
  const [viewMode, setViewMode] = React.useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [sortByScriptDate, setSortByScriptDate] = React.useState(false);
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [formFields, setFormFields] = React.useState<Array<{ id: string; ref: string; title: string; type: string }> | null>(null);
  const [selectedFormId, setSelectedFormId] = React.useState<string | null>(null);
  const [forms, setForms] = React.useState<Array<{ id: string; title: string }>>([]);
  const [formsLoading, setFormsLoading] = React.useState(false);
  
  const fetchForms = useAction(api.typeformActions.fetchTypeformForms);
  const fetchFormDetails = useAction(api.typeformActions.fetchTypeformFormDetails);
  const typeformConfig = useQuery(api.typeform.getConfigForEmail, { email });
  
  // Use enriched query that includes accurate nextScriptDate and lastCallDate
  const clients = useQuery(api.clients.getClientsWithScheduleSummary, { ownerEmail: email });

  // Filter and sort clients based on selected status, search query, and sort preference
  // IMPORTANT: This hook must be called before any early returns to maintain hook order
  const filteredClients = React.useMemo(() => {
    // Return empty array if clients are not loaded yet
    if (clients === undefined) {
      return [];
    }

    let filtered = clients;

    // Filter by status
    if (filter !== "all") {
      filtered = filtered.filter((client) => {
        if (filter === "active") {
          return client.status === "active";
      } else if (filter === "paused") {
          return client.status === "paused";
        } else if (filter === "inactive") {
          return client.status === "inactive" || !client.status;
      }
        return true;
      });
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((client) => {
        const businessName = client.businessName?.toLowerCase() || "";
        const firstName = client.contactFirstName?.toLowerCase() || "";
        const lastName = client.contactLastName?.toLowerCase() || "";
        const fullName = `${firstName} ${lastName}`.trim();
        const email = client.businessEmail?.toLowerCase() || "";
        
        return (
          businessName.includes(query) ||
          firstName.includes(query) ||
          lastName.includes(query) ||
          fullName.includes(query) ||
          email.includes(query)
        );
      });
    }

    // Sort clients
    if (sortByScriptDate) {
      // Sort by script generation date (soonest at top)
      filtered = [...filtered].sort((a, b) => {
        const aDate = a.nextScriptDate ?? Infinity;
        const bDate = b.nextScriptDate ?? Infinity;
        return aDate - bDate;
      });
    } else if (filter === "all") {
      // When showing all clients, automatically put paused and inactive at the bottom
      filtered = [...filtered].sort((a, b) => {
        const aStatus = a.status || "inactive";
        const bStatus = b.status || "inactive";
        
        // Active clients come first
        if (aStatus === "active" && bStatus !== "active") return -1;
        if (bStatus === "active" && aStatus !== "active") return 1;
        
        // Paused and inactive come last (paused before inactive)
        if (aStatus === "paused" && bStatus === "inactive") return -1;
        if (aStatus === "inactive" && bStatus === "paused") return 1;
        
        // Within same status group, maintain original order
        return 0;
      });
    }

    return filtered;
  }, [clients, filter, searchQuery, sortByScriptDate]);

  if (clients === undefined) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-foreground/60 font-light">Loading clients...</p>
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-foreground/60 font-light">
          No clients found. Sync responses from your Typeform to get started.
        </p>
      </div>
    );
  }

  const handleCreateClick = async () => {
    // Reset form fields when opening dialog - let dialog handle fetching
    setFormFields(null);
    
    // Fetch forms list if we have access token and haven't loaded yet
    if (typeformConfig?.accessToken && forms.length === 0 && !formsLoading) {
      setFormsLoading(true);
      try {
        const fetchedForms = await fetchForms({ email });
        setForms(fetchedForms);
        
        // Set the first form ID so dialog can fetch its details
        if (fetchedForms.length > 0) {
          setSelectedFormId(fetchedForms[0]?.id);
        }
      } catch (error) {
        console.error("Failed to fetch forms:", error);
        // Continue anyway - dialog will show fallback
      } finally {
        setFormsLoading(false);
      }
    } else if (forms.length > 0 && !selectedFormId) {
      // Forms already loaded, set first form ID
      setSelectedFormId(forms[0]?.id);
    }
    
    // Open dialog - it will handle fetching form details
    setShowCreateDialog(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-foreground">
            Clients
          </h2>
          <button
            onClick={handleCreateClick}
            className="flex items-center justify-center w-8 h-8 rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 transition-all duration-150 text-foreground/70 hover:text-foreground"
            title="Create manual client"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M8 3v10M3 8h10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortByScriptDate(!sortByScriptDate)}
            className="flex items-center gap-2"
            title={sortByScriptDate ? "Sort by script date (soonest first)" : "Default sort"}
          >
            <ArrowUpDown className="h-4 w-4" />
            {sortByScriptDate ? "By Date" : "Default"}
          </Button>
          <SegmentedControl
            options={[
              { value: "grid", label: "Cards" },
              { value: "table", label: "Table" },
            ]}
            value={viewMode}
            onChange={(value) => setViewMode(value as ViewMode)}
          />
          <SegmentedControl
            options={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "paused", label: "Paused" },
              { value: "inactive", label: "Inactive" },
            ]}
            value={filter}
            onChange={(value) => setFilter(value as ClientStatus)}
          />
        </div>
      </div>
      {viewMode === "table" ? (
        <ClientsTable 
          email={email} 
          searchQuery={searchQuery}
          filter={filter}
          sortByScriptDate={sortByScriptDate}
        />
      ) : filteredClients.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-foreground/60 font-light">
            No {filter === "all" ? "" : filter} clients found.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredClients.map((client) => (
            <ClientTile key={client._id} client={client} />
          ))}
        </div>
      )}
      
      <CreateManualClientDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        email={email}
        formFields={formFields}
        formId={selectedFormId}
      />
    </div>
  );
}

