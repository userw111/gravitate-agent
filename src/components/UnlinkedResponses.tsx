"use client";

import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { extractTypeformData, type ExtractedTypeformData } from "@/lib/extractTypeformData";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

type UnlinkedResponsesProps = {
  email: string;
};

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function UnlinkedResponses({ email }: UnlinkedResponsesProps) {
  const unlinkedResponses = useQuery(api.typeform.getUnlinkedResponsesForEmail, { email });
  const createClient = useMutation(api.clients.upsertClientFromTypeform);
  const linkResponse = useMutation(api.clients.linkResponseToClient);
  const existingClients = useQuery(api.clients.getAllClientsForOwner, { ownerEmail: email });

  const [creating, setCreating] = React.useState<string | null>(null);
  const [creatingAll, setCreatingAll] = React.useState(false);
  const [selectedResponse, setSelectedResponse] = React.useState<{
    responseId: string;
    data: ExtractedTypeformData;
  } | null>(null);
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [formData, setFormData] = React.useState<{
    businessEmail: string;
    businessName: string;
    contactFirstName: string;
    contactLastName: string;
  }>({
    businessEmail: "",
    businessName: "",
    contactFirstName: "",
    contactLastName: "",
  });

  // No longer need to fetch form fields - they're stored in the database

  if (unlinkedResponses === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Unlinked Typeform Responses</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground/60 font-light">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (unlinkedResponses.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Unlinked Typeform Responses</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground/60 font-light">
            All responses are linked to clients.
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleCreateClient = async (responseId: string, extractedData: ExtractedTypeformData) => {
    setCreating(responseId);
    setSelectedResponse({ responseId, data: extractedData });
    
    // Pre-fill form with extracted data
    setFormData({
      businessEmail: extractedData.businessEmail || "",
      businessName: extractedData.businessName || "",
      contactFirstName: extractedData.contactFirstName || "",
      contactLastName: extractedData.contactLastName || "",
    });
    
    setShowCreateDialog(true);
    setCreating(null);
  };

  const handleLinkToExisting = async (responseId: string, clientId: string) => {
    setCreating(responseId);
    try {
      await linkResponse({
        clientId: clientId as any,
        responseId,
      });
    } catch (error) {
      console.error("Failed to link response:", error);
      alert(error instanceof Error ? error.message : "Failed to link response");
    } finally {
      setCreating(null);
    }
  };

  const handleSubmitCreate = async () => {
    if (!selectedResponse) return;
    
    if (!formData.businessEmail || !formData.businessName) {
      alert("Business email and name are required");
      return;
    }

    setCreating(selectedResponse.responseId);
    try {
      const clientId = await createClient({
        ownerEmail: email,
        businessEmail: formData.businessEmail.toLowerCase().trim(),
        businessName: formData.businessName,
        contactFirstName: formData.contactFirstName || undefined,
        contactLastName: formData.contactLastName || undefined,
        onboardingResponseId: selectedResponse.responseId,
      });
      
      // Link the response to the client
      await linkResponse({
        clientId: clientId as any,
        responseId: selectedResponse.responseId,
      });
      
      setShowCreateDialog(false);
      setSelectedResponse(null);
    } catch (error) {
      console.error("Failed to create client:", error);
      alert(error instanceof Error ? error.message : "Failed to create client");
    } finally {
      setCreating(null);
    }
  };

  const handleCreateAllClients = async () => {
    if (!unlinkedResponses || unlinkedResponses.length === 0) return;
    
    if (!confirm(`Create ${unlinkedResponses.length} client${unlinkedResponses.length > 1 ? 's' : ''}? You can add emails later.`)) {
      return;
    }

    setCreatingAll(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const response of unlinkedResponses) {
        try {
          const extractedData = extractTypeformData(response.payload as Parameters<typeof extractTypeformData>[0]);
          
          // Generate a placeholder email if not available
          const businessEmail = extractedData.businessEmail || `pending-${response.responseId}@placeholder.local`;
          const businessName = extractedData.businessName || "Unnamed Business";
          
          const clientId = await createClient({
            ownerEmail: email,
            businessEmail: businessEmail.toLowerCase().trim(),
            businessName: businessName,
            contactFirstName: extractedData.contactFirstName || undefined,
            contactLastName: extractedData.contactLastName || undefined,
            onboardingResponseId: response.responseId,
          });
          
          // Link the response to the client
          await linkResponse({
            clientId: clientId as any,
            responseId: response.responseId,
          });
          
          successCount++;
        } catch (error) {
          console.error(`Failed to create client for response ${response.responseId}:`, error);
          errorCount++;
        }
      }
      
      if (errorCount > 0) {
        alert(`Created ${successCount} client${successCount > 1 ? 's' : ''}. ${errorCount} failed.`);
      } else {
        alert(`Successfully created ${successCount} client${successCount > 1 ? 's' : ''}!`);
      }
    } catch (error) {
      console.error("Failed to create all clients:", error);
      alert(error instanceof Error ? error.message : "Failed to create all clients");
    } finally {
      setCreatingAll(false);
    }
  };

  return (
    <>
      <Card>
        <div className="flex items-center justify-between p-6 pb-0">
          <CardTitle>Unlinked Typeform Responses ({unlinkedResponses.length})</CardTitle>
          {unlinkedResponses.length > 0 && (
            <button
              onClick={handleCreateAllClients}
              disabled={creatingAll}
              className="shrink-0 px-4 py-2 text-sm font-medium rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
            >
              {creatingAll ? "Creating..." : `Create All Clients (${unlinkedResponses.length})`}
            </button>
          )}
        </div>
        <CardContent>
          <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
            {unlinkedResponses.map((response) => {
              const extractedData = extractTypeformData(response.payload as Parameters<typeof extractTypeformData>[0]);
              
              const businessName = extractedData.businessName || "Unnamed Business";
              const contactName = extractedData.contactFirstName || extractedData.contactLastName
                ? `${extractedData.contactFirstName || ""} ${extractedData.contactLastName || ""}`.trim()
                : null;
              const businessEmail = extractedData.businessEmail || null;
              
              return (
                <div
                  key={response._id}
                  className="group p-4 rounded-lg border border-foreground/10 bg-background/30 hover:bg-background/50 hover:border-foreground/20 transition-all duration-150"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <h4 className="text-sm font-medium text-foreground/90">
                          {businessName}
                        </h4>
                        {contactName && (
                          <span className="text-xs text-foreground/50">
                            {contactName}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1.5">
                        {businessEmail && (
                          <span className="text-xs text-foreground/60">
                            {businessEmail}
                          </span>
                        )}
                        <span className="text-xs text-foreground/40">
                          {extractedData.submittedAt 
                            ? formatDate(new Date(extractedData.submittedAt).getTime()) 
                            : formatDate(response.syncedAt)}
                        </span>
                      </div>
                    </div>
                    
                    <div className="shrink-0 flex items-center gap-2">
                      {existingClients && existingClients.length > 0 && (
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              handleLinkToExisting(response.responseId, e.target.value);
                            }
                          }}
                          disabled={creating === response.responseId}
                          className="text-xs px-3 py-1.5 rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
                          defaultValue=""
                        >
                          <option value="">Link to...</option>
                          {existingClients.map((client) => (
                            <option key={client._id} value={client._id}>
                              {client.businessName}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => handleCreateClient(response.responseId, extractedData)}
                        disabled={creating === response.responseId}
                        className="px-4 py-1.5 text-xs font-medium rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 disabled:opacity-50 transition-all duration-150"
                      >
                        {creating === response.responseId ? "Creating..." : "Create Client"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Create Client Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Client Profile</DialogTitle>
            <DialogDescription>
              Review and edit the extracted information to create a client profile.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-foreground/70">Business Email *</label>
                <input
                  type="email"
                  className="w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm"
                  value={formData.businessEmail}
                  onChange={(e) => setFormData({ ...formData, businessEmail: e.target.value })}
                  placeholder="business@example.com"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm text-foreground/70">Business Name *</label>
                <input
                  type="text"
                  className="w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm"
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  placeholder="Company Name"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm text-foreground/70">First Name</label>
                <input
                  type="text"
                  className="w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm"
                  value={formData.contactFirstName}
                  onChange={(e) => setFormData({ ...formData, contactFirstName: e.target.value })}
                  placeholder="John"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm text-foreground/70">Last Name</label>
                <input
                  type="text"
                  className="w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm"
                  value={formData.contactLastName}
                  onChange={(e) => setFormData({ ...formData, contactLastName: e.target.value })}
                  placeholder="Doe"
                />
              </div>
            </div>
            
            {selectedResponse && (
              <div className="mt-4 p-3 rounded-md bg-foreground/5 border border-foreground/10">
                <p className="text-xs text-foreground/50 mb-2 font-medium">Extracted from response:</p>
                <div className="text-xs space-y-1.5">
                  {selectedResponse.data.phoneNumber && (
                    <div className="text-foreground/70">
                      <span className="text-foreground/50">Phone: </span>
                      {selectedResponse.data.phoneNumber}
                    </div>
                  )}
                  {selectedResponse.data.website && (
                    <div className="text-foreground/70">
                      <span className="text-foreground/50">Website: </span>
                      {selectedResponse.data.website}
                    </div>
                  )}
                  {selectedResponse.data.industry && (
                    <div className="text-foreground/70">
                      <span className="text-foreground/50">Industry: </span>
                      {selectedResponse.data.industry}
                    </div>
                  )}
                  {selectedResponse.data.location && (
                    <div className="text-foreground/70">
                      <span className="text-foreground/50">Location: </span>
                      {selectedResponse.data.location}
                    </div>
                  )}
                  {selectedResponse.data.currentRevenue && (
                    <div className="text-foreground/70">
                      <span className="text-foreground/50">Current Revenue: </span>
                      ${selectedResponse.data.currentRevenue.toLocaleString()}
                    </div>
                  )}
                  {selectedResponse.data.budget && (
                    <div className="text-foreground/70">
                      <span className="text-foreground/50">Budget: </span>
                      ${selectedResponse.data.budget.toLocaleString()}
                    </div>
                  )}
                  {selectedResponse.data.targetRevenue && (
                    <div className="text-foreground/70">
                      <span className="text-foreground/50">Target Revenue: </span>
                      ${selectedResponse.data.targetRevenue.toLocaleString()}
                    </div>
                  )}
                  {!selectedResponse.data.phoneNumber && 
                   !selectedResponse.data.website && 
                   !selectedResponse.data.industry && 
                   !selectedResponse.data.location && 
                   !selectedResponse.data.currentRevenue && 
                   !selectedResponse.data.budget && 
                   !selectedResponse.data.targetRevenue && (
                    <div className="text-foreground/50 italic">No additional information extracted</div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <button
              onClick={() => {
                setShowCreateDialog(false);
                setSelectedResponse(null);
              }}
              className="px-4 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 transition-all duration-150"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitCreate}
              disabled={creating !== null || !formData.businessEmail || !formData.businessName}
              className="px-4 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 disabled:opacity-50 transition-all duration-150"
            >
              {creating ? "Creating..." : "Create Client"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

