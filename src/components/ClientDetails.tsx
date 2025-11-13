"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { extractClientInfo } from "@/lib/typeform";
import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useRouter } from "next/navigation";
import type { Id } from "../../convex/_generated/dataModel";
import UnlinkedTranscripts from "./UnlinkedTranscripts";
import ScriptTabContent from "./ScriptTabContent";
import { Pencil, X, Plus } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

type ClientDetailsProps = {
  email: string;
  responseId: string; // Can be either clientId or onboardingResponseId
};

function formatShortDate(dateString: string | null): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatMonthYear(dateString: string | null): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatFullDate(dateString: string | null): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getNextScriptDate(submittedAt: string | null): string | null {
  if (!submittedAt) return null;
  const date = new Date(submittedAt);
  date.setDate(date.getDate() + 7);
  return date.toISOString();
}


export default function ClientDetails({ email, responseId }: ClientDetailsProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState("overview");
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [originalNotes, setOriginalNotes] = React.useState("");
  const [isSavingNotes, setIsSavingNotes] = React.useState(false);
  const notesSaveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  
  // Convex IDs typically start with 'j' or 'k' followed by alphanumeric characters
  // Typeform response IDs are longer strings without this prefix
  // Try onboardingResponseId first since that's what ClientTile uses when available
  const clientByResponseId = useQuery(
    api.clients.getClientByOnboardingResponseId,
    { ownerEmail: email, onboardingResponseId: responseId }
  );
  
  // Also try as clientId if it looks like a Convex ID (starts with 'j' or 'k')
  const looksLikeClientId = responseId.length > 15 && (responseId.startsWith("j") || responseId.startsWith("k"));
  const clientById = useQuery(
    api.clients.getClientById,
    looksLikeClientId && !clientByResponseId ? { clientId: responseId as Id<"clients"> } : "skip"
  );
  
  // Get the typeform response if we have an onboardingResponseId
  const typeformResponse = useQuery(
    api.typeform.getResponseByResponseId,
    clientById?.onboardingResponseId || clientByResponseId?.onboardingResponseId
      ? { responseId: clientById?.onboardingResponseId || clientByResponseId?.onboardingResponseId || "" }
      : "skip"
  );
  
  // Get transcripts for this client
  const transcripts = useQuery(
    api.fireflies.getTranscriptsForClient,
    (clientById?._id || clientByResponseId?._id)
      ? { clientId: (clientById?._id || clientByResponseId?._id) as Id<"clients"> }
      : "skip"
  );

  const client = clientByResponseId || clientById;
  const updateClient = useMutation(api.clients.updateClient);
  // Get script count for this client (must be before any conditional returns to preserve hook order)
  const scriptCount = useQuery(
    api.scripts.getScriptCountForClient,
    client ? { clientId: client._id, ownerEmail: email } : "skip"
  );
  const totalScriptsGenerated = scriptCount ?? 0;
  
  // Get cron jobs for this client
  const cronJobs = useQuery(
    api.cronJobs.getCronJobsForClient,
    client ? { clientId: client._id } : "skip"
  );
  
  // Get settings (for backwards compatibility, but schedule is now fixed)
  const settings = useQuery(api.scriptSettings.getSettingsForEmail, { email });

  // Initialize notes from client data
  React.useEffect(() => {
    if (client?.notes !== undefined) {
      const clientNotes = client.notes || "";
      setNotes(clientNotes);
      setOriginalNotes(clientNotes);
    }
  }, [client?.notes]);

  // Save notes manually
  const handleSaveNotes = React.useCallback(async () => {
    if (!client) return;
    
    setIsSavingNotes(true);
    try {
      await updateClient({
        clientId: client._id,
        notes: notes || undefined,
      });
      console.log("[ClientDetails] Notes saved");
      // Update original notes after successful save
      setOriginalNotes(notes);
    } catch (error) {
      console.error("[ClientDetails] Failed to save notes:", error);
    } finally {
      setIsSavingNotes(false);
    }
  }, [client, notes, updateClient]);

  // Check if notes have changed
  const hasNotesChanged = notes !== originalNotes;

  // Auto-save notes with debouncing
  const handleNotesChange = React.useCallback((value: string) => {
    setNotes(value);
    
    // Clear existing timeout
    if (notesSaveTimeoutRef.current) {
      clearTimeout(notesSaveTimeoutRef.current);
    }
    
    // Set new timeout for auto-save (1 second debounce)
    notesSaveTimeoutRef.current = setTimeout(async () => {
      if (!client) return;
      
      setIsSavingNotes(true);
      try {
        await updateClient({
          clientId: client._id,
          notes: value || undefined,
        });
        console.log("[ClientDetails] Notes auto-saved");
        // Update original notes after successful auto-save
        setOriginalNotes(value);
      } catch (error) {
        console.error("[ClientDetails] Failed to save notes:", error);
      } finally {
        setIsSavingNotes(false);
      }
    }, 1000);
  }, [client, updateClient]);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (notesSaveTimeoutRef.current) {
        clearTimeout(notesSaveTimeoutRef.current);
      }
    };
  }, []);

  // Form state
  const [formData, setFormData] = React.useState({
    businessName: "",
    businessEmail: "",
    businessEmails: [] as string[],
    contactFirstName: "",
    contactLastName: "",
    targetRevenue: "",
    status: "active" as "active" | "paused" | "inactive",
  });
  const [newEmail, setNewEmail] = React.useState("");

  // Initialize form data when client loads or dialog opens
  React.useEffect(() => {
    if (client && editDialogOpen) {
      console.log("[ClientDetails] Initializing form data. Client:", {
        businessEmail: client.businessEmail,
        businessEmails: client.businessEmails,
        _id: client._id,
      });
      
      // Start with existing businessEmails array or empty array
      const emails = [...(client.businessEmails || [])];
      console.log("[ClientDetails] Starting emails array:", emails);
      
      // Include businessEmail in the list if it exists and isn't already there
      if (client.businessEmail && !emails.includes(client.businessEmail.toLowerCase().trim())) {
        emails.unshift(client.businessEmail.toLowerCase().trim());
        console.log("[ClientDetails] Added businessEmail to array:", emails);
      }
      
      const initialFormData = {
        businessName: client.businessName || "",
        businessEmail: client.businessEmail || "",
        businessEmails: emails,
        contactFirstName: client.contactFirstName || "",
        contactLastName: client.contactLastName || "",
        targetRevenue: client.targetRevenue?.toString() || "",
        status: client.status || "active",
      };
      
      console.log("[ClientDetails] Setting form data:", initialFormData);
      setFormData(initialFormData);
      setNewEmail("");
    }
  }, [client, editDialogOpen]);

  const handleAddEmail = () => {
    const trimmedEmail = newEmail.trim().toLowerCase();
    console.log("[ClientDetails] handleAddEmail called:", {
      newEmail,
      trimmedEmail,
      currentEmails: formData.businessEmails,
      alreadyExists: formData.businessEmails.includes(trimmedEmail),
      formDataSnapshot: { ...formData },
    });
    
    if (trimmedEmail && !formData.businessEmails.includes(trimmedEmail)) {
      const newEmails = [...formData.businessEmails, trimmedEmail];
      console.log("[ClientDetails] Adding email. New emails array:", newEmails);
      const updatedFormData = {
        ...formData,
        businessEmails: newEmails,
      };
      console.log("[ClientDetails] Setting formData to:", updatedFormData);
      setFormData(updatedFormData);
      setNewEmail("");
      
      // Log after state update (will show in next render)
      setTimeout(() => {
        console.log("[ClientDetails] FormData after update (check state):", formData);
      }, 0);
    } else {
      console.log("[ClientDetails] Email not added - empty or duplicate", {
        trimmedEmail,
        isEmpty: !trimmedEmail,
        isDuplicate: formData.businessEmails.includes(trimmedEmail),
      });
    }
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setFormData({
      ...formData,
      businessEmails: formData.businessEmails.filter(email => email !== emailToRemove),
    });
  };

  const handleSave = async () => {
    if (!client) return;
    
    console.log("[ClientDetails] handleSave called. Form data:", formData);
    console.log("[ClientDetails] Current client:", {
      _id: client._id,
      businessEmail: client.businessEmail,
      businessEmails: client.businessEmails,
    });
    console.log("[ClientDetails] newEmail value:", newEmail);
    
    setIsSaving(true);
    try {
      // If there's an email in the input field that hasn't been added yet, add it first
      let emailsToSave = [...formData.businessEmails];
      const trimmedNewEmail = newEmail.trim().toLowerCase();
      if (trimmedNewEmail && !emailsToSave.includes(trimmedNewEmail)) {
        console.log("[ClientDetails] Auto-adding email from input field:", trimmedNewEmail);
        emailsToSave.push(trimmedNewEmail);
      }
      
      // Normalize emails: lowercase, trim, and filter out empty strings
      const normalizedEmails = emailsToSave
        .map(email => email.toLowerCase().trim())
        .filter(Boolean);
      
      console.log("[ClientDetails] Normalized emails:", normalizedEmails);
      
      const updatePayload = {
        clientId: client._id,
        businessName: formData.businessName || undefined,
        businessEmail: normalizedEmails.length > 0 ? normalizedEmails[0] : undefined,
        businessEmails: normalizedEmails, // Always pass the normalized array
        contactFirstName: formData.contactFirstName || undefined,
        contactLastName: formData.contactLastName || undefined,
        targetRevenue: formData.targetRevenue ? parseFloat(formData.targetRevenue) : undefined,
        status: formData.status,
      };
      
      console.log("[ClientDetails] Calling updateClient with payload:", updatePayload);
      
      const result = await updateClient(updatePayload);
      
      console.log("[ClientDetails] updateClient result:", result);
      setEditDialogOpen(false);
      setNewEmail(""); // Clear the input field after saving
    } catch (error) {
      console.error("[ClientDetails] Failed to update client:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Show loading while queries are in progress
  if (clientByResponseId === undefined && (!looksLikeClientId || clientById === undefined)) {
    return (
      <div className="min-h-screen px-4 py-12 bg-background">
        <div className="mx-auto max-w-7xl">
          <div className="text-center py-12">
            <p className="text-sm text-foreground/60 font-light">Loading client details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen px-4 py-12 bg-background">
        <div className="mx-auto max-w-7xl">
          <div className="text-center py-12">
            <p className="text-sm text-foreground/60 font-light">Client not found.</p>
            <button
              onClick={() => router.push("/dashboard")}
              className="mt-4 px-4 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 transition-all duration-150 font-light"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Use client data from clients table as primary source
  const displayName = client.businessName || 
    (client.contactFirstName && client.contactLastName ? `${client.contactFirstName} ${client.contactLastName}` : 
    client.contactFirstName || "Unknown Client");

  // Extract additional info from typeform response if available
  let additionalInfo: Partial<ReturnType<typeof extractClientInfo>> = {};
  if (typeformResponse) {
    const extracted = extractClientInfo(typeformResponse.payload as Parameters<typeof extractClientInfo>[0]);
    additionalInfo = extracted;
  }

  const submittedAt = additionalInfo.submittedAt || new Date(client.createdAt).toISOString();
  const nextScriptDate = getNextScriptDate(submittedAt);
  const lastCallDate = transcripts && transcripts.length > 0 
    ? new Date(transcripts[0].date).toISOString() 
    : submittedAt;
  const memberSinceDate = new Date(client.createdAt).toISOString();

  return (
    <div className="min-h-screen px-4 py-12 bg-background">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push("/dashboard")}
            className="mb-4 text-sm text-foreground/60 hover:text-foreground transition-colors font-light flex items-center gap-2"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M10 12L6 8L10 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back to Dashboard
          </button>
          <div className="flex gap-2 mb-8">
            <button className="px-4 py-2 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 transition-all duration-150 font-medium">
              Generate Scripts Now
            </button>
            <button className="px-4 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 transition-all duration-150 font-light">
              Recalculate Dates
            </button>
            <button className="px-4 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 transition-all duration-150 font-light">
              Open Drive Folder
            </button>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Column - Client Information */}
          <div className="lg:col-span-1 space-y-4">
            {/* Client Overview Card */}
            <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md">
              <CardHeader>
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl font-bold mb-2">{displayName}</CardTitle>
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            client.status === "active"
                              ? "bg-green-500 text-white"
                              : client.status === "paused"
                              ? "bg-yellow-500 text-white"
                              : "bg-foreground/10 text-foreground/70"
                          }`}
                        >
                          {client.status ? client.status.charAt(0).toUpperCase() + client.status.slice(1) : "Inactive"}
                        </span>
                        <span className="text-sm text-foreground/60 font-light">
                          Next in 18d
                        </span>
                      </div>
                    </div>
                    <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 cursor-pointer hover:bg-accent hover:text-accent-foreground transition-all duration-200"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="flex flex-col gap-0 overflow-y-visible p-0 sm:max-w-lg [&>button:last-child]:top-3.5">
                        <DialogHeader className="contents space-y-0 text-left">
                          <DialogTitle className="border-b px-6 py-4 text-base">
                            Edit client
                          </DialogTitle>
                        </DialogHeader>
                        <DialogDescription className="sr-only">
                          Make changes to the client information here.
                        </DialogDescription>
                        <div className="overflow-y-auto">
                          <div className="px-6 pt-4 pb-6">
                            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
                              <div className="space-y-2">
                                <Label htmlFor="business-name">Business name</Label>
                                <Input
                                  id="business-name"
                                  placeholder="Business name"
                                  value={formData.businessName}
                                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                                  type="text"
                                  required
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Business emails</Label>
                                <div className="space-y-2">
                                  {formData.businessEmails.map((email, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                      <Input
                                        value={email}
                                        readOnly
                                        className="flex-1 bg-muted"
                                      />
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleRemoveEmail(email)}
                                        className="h-9 w-9 cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-all duration-200"
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ))}
                                  <div className="flex items-center gap-2">
                                    <Input
                                      placeholder="Add email address"
                                      value={newEmail}
                                      onChange={(e) => {
                                        console.log("[ClientDetails] Email input changed:", e.target.value);
                                        setNewEmail(e.target.value);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          console.log("[ClientDetails] Enter pressed, calling handleAddEmail");
                                          handleAddEmail();
                                        }
                                      }}
                                      type="email"
                                      className="flex-1"
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      onClick={(e) => {
                                        console.log("[ClientDetails] Plus button clicked");
                                        e.preventDefault();
                                        handleAddEmail();
                                      }}
                                      disabled={!newEmail.trim() || formData.businessEmails.includes(newEmail.trim().toLowerCase())}
                                      className="h-9 w-9 cursor-pointer hover:bg-accent hover:text-accent-foreground transition-all duration-200"
                                    >
                                      <Plus className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-col gap-4 sm:flex-row">
                                <div className="flex-1 space-y-2">
                                  <Label htmlFor="contact-first-name">Contact first name</Label>
                                  <Input
                                    id="contact-first-name"
                                    placeholder="First name"
                                    value={formData.contactFirstName}
                                    onChange={(e) => setFormData({ ...formData, contactFirstName: e.target.value })}
                                    type="text"
                                  />
                                </div>
                                <div className="flex-1 space-y-2">
                                  <Label htmlFor="contact-last-name">Contact last name</Label>
                                  <Input
                                    id="contact-last-name"
                                    placeholder="Last name"
                                    value={formData.contactLastName}
                                    onChange={(e) => setFormData({ ...formData, contactLastName: e.target.value })}
                                    type="text"
                                  />
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="target-revenue">Target revenue</Label>
                                <Input
                                  id="target-revenue"
                                  placeholder="0"
                                  value={formData.targetRevenue}
                                  onChange={(e) => setFormData({ ...formData, targetRevenue: e.target.value })}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="status">Status</Label>
                                <select
                                  id="status"
                                  value={formData.status}
                                  onChange={(e) => setFormData({ ...formData, status: e.target.value as "active" | "paused" | "inactive" })}
                                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <option value="active">Active</option>
                                  <option value="paused">Paused</option>
                                  <option value="inactive">Inactive</option>
                                </select>
                              </div>
                            </form>
                          </div>
                        </div>
                        <DialogFooter className="border-t px-6 py-4">
                          <DialogClose asChild>
                            <Button type="button" variant="outline" disabled={isSaving}>
                              Cancel
                            </Button>
                          </DialogClose>
                          <Button
                            type="button"
                            onClick={handleSave}
                            disabled={isSaving}
                            className="cursor-pointer hover:bg-primary/90 hover:shadow-lg hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-200 active:translate-y-0 active:scale-100"
                          >
                            {isSaving ? "Saving..." : "Save changes"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-foreground/60 font-light">Owner:</span>{" "}
                      <span className="font-medium">{email.split("@")[0]}</span>
                    </div>
                    {(client.businessEmail || (client.businessEmails && client.businessEmails.length > 0)) && (
                      <div>
                        <span className="text-foreground/60 font-light">Email{((client.businessEmails?.length || 0) + (client.businessEmail ? 1 : 0)) > 1 ? "s" : ""}:</span>{" "}
                        <div className="mt-1 space-y-1">
                          {client.businessEmail && (
                            <div className="font-medium">{client.businessEmail}</div>
                          )}
                          {client.businessEmails?.filter(email => email !== client.businessEmail).map((email, index) => (
                            <div key={index} className="font-medium">{email}</div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(client.contactFirstName || client.contactLastName) && (
                      <div>
                        <span className="text-foreground/60 font-light">Contact:</span>{" "}
                        <span className="font-medium">
                          {[client.contactFirstName, client.contactLastName].filter(Boolean).join(" ")}
                        </span>
                      </div>
                    )}
                    {client.targetRevenue && (
                      <div>
                        <span className="text-foreground/60 font-light">Target Revenue:</span>{" "}
                        <span className="font-medium">${client.targetRevenue.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-foreground/10">
                    <span className="px-2 py-1 rounded text-xs font-medium bg-foreground/10 text-foreground/70">
                      SaaS
                    </span>
                    <span className="px-2 py-1 rounded text-xs font-medium bg-foreground/10 text-foreground/70">
                      B2B
                    </span>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Status & Cadence Card */}
            <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md">
              <CardHeader>
                <CardTitle className="text-sm font-medium mb-4">Status & Cadence</CardTitle>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-foreground/60 font-light mb-1 block">Status</label>
                    <select className="w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm">
                      <option>Active</option>
                      <option>Paused</option>
                      <option>Unknown</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-foreground/60 font-light mb-1 block">Cron Job Schedule</label>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={client?.cronJobEnabled !== false}
                          onChange={(e) => {
                            if (client) {
                              updateClient({
                                clientId: client._id,
                                cronJobEnabled: e.target.checked,
                              });
                            }
                          }}
                          className="rounded border-foreground/20"
                        />
                        <label className="text-xs text-foreground/60 font-light cursor-pointer">
                          Enable cron jobs
                        </label>
                      </div>
                      <div className="rounded-md border border-foreground/10 bg-background/30 p-2">
                        <p className="text-xs text-foreground/70 font-medium mb-1">Fixed Schedule:</p>
                        <ul className="text-xs text-foreground/60 space-y-0.5 list-disc list-inside">
                          <li>Immediate (on creation)</li>
                          <li>25 days later</li>
                          <li>30 days after that (55d total)</li>
                          <li>Then monthly on that day</li>
                        </ul>
                      </div>
                      {cronJobs && cronJobs.length > 0 && cronJobs.some(j => j.isRepeating && j.status === "scheduled") && (
                        <p className="text-xs text-foreground/50 font-light">
                          Recurring monthly on day {cronJobs.find(j => j.isRepeating && j.status === "scheduled")?.dayOfMonth}
                        </p>
                      )}
                    </div>
                  </div>
                  {cronJobs && cronJobs.length > 0 && (
                    <div>
                      <label className="text-xs text-foreground/60 font-light mb-1 block">Scheduled Jobs</label>
                      <div className="space-y-1">
                        {cronJobs
                          .filter((job) => job.status === "scheduled")
                          .map((job) => (
                            <div key={job.cronJobId} className="text-xs text-foreground/70">
                              {new Date(job.scheduledTime).toLocaleDateString()} (day {job.dayOfMonth}{job.isRepeating ? ", monthly" : ""})
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-foreground/60 font-light mb-1 block">Next Script</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="mm/dd/yyyy"
                        className="flex-1 rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm"
                        defaultValue={nextScriptDate ? formatFullDate(nextScriptDate) : ""}
                      />
                      <button className="px-3 py-2 rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 text-sm">
                        📅
                      </button>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button className="flex-1 px-3 py-1.5 text-xs rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 font-light">
                        Save
                      </button>
                      <button className="flex-1 px-3 py-1.5 text-xs rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 font-light">
                        Revert
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-light cursor-pointer">
                      <input type="checkbox" className="rounded border-foreground/20" />
                      <span>Skip next drop</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm font-light cursor-pointer">
                      <input type="checkbox" defaultChecked className="rounded border-foreground/20" />
                      <span>Resume schedule</span>
                    </label>
                  </div>
                  <p className="text-xs text-foreground/50 font-light">
                    Cadence recalculates from Last Script Date unless you override Next.
                  </p>
                </div>
              </CardHeader>
            </Card>

            {/* Key Dates Card */}
            <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md">
              <CardHeader>
                <CardTitle className="text-sm font-medium mb-4">Key Dates</CardTitle>
                <div className="space-y-3">
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
                    <span className="font-light">Row Created: {formatFullDate(memberSinceDate)}</span>
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
                        d="M12 2h-1V1h-1v1H6V1H5v1H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 12H4V7h8v7z"
                        fill="currentColor"
                      />
                    </svg>
                    <span className="font-light">Last Script: {formatFullDate(lastCallDate)}</span>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Links & Assets Card */}
            <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Links & Assets</CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Right Column - Overview and Tabs */}
          <div className="lg:col-span-3 space-y-6">
            {/* Metric Tiles - Persistent, above tabs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Scripts Generated */}
              <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-light text-foreground/70">Scripts Generated</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">{totalScriptsGenerated}</div>
                </CardContent>
              </Card>

              {/* Next Script */}
              <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-light text-foreground/70">Next Script</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
                    {nextScriptDate ? formatShortDate(nextScriptDate) : "N/A"}
                  </div>
                </CardContent>
              </Card>

              {/* Last Call */}
              <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-light text-foreground/70">Last Call</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
                    {lastCallDate ? formatShortDate(lastCallDate) : "N/A"}
                  </div>
                </CardContent>
              </Card>

              {/* Member Since */}
              <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-light text-foreground/70">Member Since</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
                    {memberSinceDate ? formatMonthYear(memberSinceDate) : "N/A"}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-foreground/10">
              {["Overview", "Scripts", "Notes", "Call Intelligence", "Transcripts", "History & Logs"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab.toLowerCase().replace(" & ", "-").replace(" ", "-"))}
                  className={`px-4 py-2 text-sm font-light transition-colors ${
                    activeTab === tab.toLowerCase().replace(" & ", "-").replace(" ", "-")
                      ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                      : "text-foreground/60 hover:text-foreground"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            {activeTab === "overview" && (
              <div className="space-y-4">
                {/* Readiness Card */}
                <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md">
                  <CardHeader>
                    <CardTitle className="text-lg font-bold mb-4">
                      Next Script Due {nextScriptDate ? formatFullDate(nextScriptDate) : "N/A"}
                    </CardTitle>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-green-500">
                          <path d="M13 4L6 11L3 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="font-light">Typeform</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-green-500">
                          <path d="M13 4L6 11L3 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="font-light">Call notes (Oct 28)</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-green-500">
                          <path d="M13 4L6 11L3 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="font-light">Winning angle (CTR 2.8%)</span>
                      </div>
                    </div>
                    <CardContent className="pt-4">
                      <div className="flex gap-2">
                        <button className="px-4 py-2 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 transition-all duration-150 font-medium">
                          Generate Scripts Now
                        </button>
                        <button className="px-4 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 transition-all duration-150 font-light">
                          Preview inputs
                        </button>
                      </div>
                    </CardContent>
                  </CardHeader>
                </Card>

                {/* Angles & Strategy Card */}
                <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium mb-4">Angles & Strategy</CardTitle>
                    <div className="flex flex-wrap gap-2 mb-4">
                      <button className="px-3 py-1.5 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 font-light">
                        New service
                      </button>
                      <button className="px-3 py-1.5 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 font-light">
                        Social proof
                      </button>
                      <button className="px-3 py-1.5 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 font-light">
                        Objection handling
                      </button>
                    </div>
                    <textarea
                      placeholder="Angle notes for next drop..."
                      className="w-full min-h-[120px] rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm font-light resize-none"
                    />
                  </CardHeader>
                </Card>

                {/* Recent Activity Card */}
                <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium mb-4">Recent Activity</CardTitle>
                    <div className="space-y-2 text-sm">
                      <div className="text-foreground/70 font-light">
                        Cadence set to +25d/4w by {email.split("@")[0]} • Today 9:14a
                      </div>
                      <div className="text-red-600 dark:text-red-400 font-light">
                        Error: Drive quota limit • View log
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </div>
            )}

            {/* Notes Tab */}
            {activeTab === "notes" && (
              <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md">
                <CardHeader>
                  <div className="*:not-first:mt-2">
                    <Label htmlFor="client-notes">Notes</Label>
                    <p className="text-sm text-muted-foreground mb-4">
                      These notes will be factored into the scripts generated for this client.
                    </p>
                    <Textarea
                      id="client-notes"
                      placeholder="Add notes about this client..."
                      value={notes}
                      onChange={(e) => handleNotesChange(e.target.value)}
                      className="min-h-[300px]"
                    />
                    <div className="flex items-center justify-between mt-2">
                      <p
                        className="text-xs text-muted-foreground"
                        role="region"
                        aria-live="polite"
                      >
                        Notes are automatically saved as you type
                      </p>
                      <div className="flex items-center gap-2">
                        {isSavingNotes && (
                          <span className="text-xs text-muted-foreground">Saving...</span>
                        )}
                        <Button
                          type="button"
                          onClick={handleSaveNotes}
                          disabled={isSavingNotes || !hasNotesChanged}
                          size="sm"
                          className="cursor-pointer hover:bg-primary/90 hover:shadow-lg hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-200 active:translate-y-0 active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            )}

            {/* Scripts Tab */}
            {activeTab === "scripts" && (
              <div>
                <ScriptTabContent clientId={client._id} ownerEmail={email} />
              </div>
            )}

            {/* Transcripts Tab */}
            {activeTab === "transcripts" && (
              <div>
                <UnlinkedTranscripts 
                  email={email} 
                  clientId={client._id} 
                  showEditButton={true}
                />
              </div>
            )}

            {/* Other tabs placeholder */}
            {activeTab !== "overview" && activeTab !== "transcripts" && activeTab !== "notes" && activeTab !== "scripts" && (
              <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md">
                <CardContent className="py-12 text-center">
                  <p className="text-sm text-foreground/60 font-light">
                    {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} content coming soon...
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-foreground/10 text-center">
          <p className="text-sm text-foreground/60 font-light">
            No scripts yet. Set cadence and click 'Generate Scripts Now'. We'll create the Doc in the client's Drive automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
