"use client";

import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Input } from "./ui/input";
import { Maximize2, Link2, Pencil } from "lucide-react";

type UnlinkedTranscriptsProps = {
  email: string;
  clientId?: string; // If provided, show linked transcripts for this client
  showEditButton?: boolean; // If true, show edit button instead of search/link controls
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

export default function UnlinkedTranscripts({ email, clientId, showEditButton = false }: UnlinkedTranscriptsProps) {
  const unlinkedTranscripts = useQuery(
    clientId 
      ? api.fireflies.getTranscriptsForClient 
      : api.fireflies.getUnlinkedTranscriptsForEmail, 
    clientId ? { clientId: clientId as any } : { email }
  );
  const clients = useQuery(api.clients.getAllClientsForOwner, { ownerEmail: email });
  const linkTranscript = useMutation(api.clients.linkTranscriptToClient);
  const unlinkTranscript = useMutation(api.clients.unlinkTranscriptFromClient);
  const updateClientEmail = useMutation(api.clients.updateClientEmail);

  const [linking, setLinking] = React.useState<string | null>(null);
  const [selectedTranscript, setSelectedTranscript] = React.useState<{
    transcriptId: string;
    title: string;
    transcript: string;
    date: number;
    participants?: string[];
  } | null>(null);
  const [dialogSearchQuery, setDialogSearchQuery] = React.useState("");
  const [dialogSelectedClientId, setDialogSelectedClientId] = React.useState<string>("");
  const [searchQueries, setSearchQueries] = React.useState<Record<string, string>>({});
  const [selectedClientIds, setSelectedClientIds] = React.useState<Record<string, string>>({});
  const [emailDialogOpen, setEmailDialogOpen] = React.useState(false);
  type Transcript = NonNullable<typeof unlinkedTranscripts>[0];

  const [pendingLink, setPendingLink] = React.useState<{ 
    transcriptId: string; 
    clientId: string; 
    email?: string; 
    transcript?: Transcript;
    otherTranscriptIds?: string[];
    otherTranscripts?: Transcript[];
  } | null>(null);
  // Track transcripts that have been linked in this session (to keep them visible)
  const [linkedInSession, setLinkedInSession] = React.useState<Record<string, { clientId: string; emailAdded?: boolean }>>({});
  // Cache linked transcripts locally so they stay visible even after query refresh
  const [linkedTranscriptCache, setLinkedTranscriptCache] = React.useState<Record<string, Transcript>>({});

  // Snapshot data so the UI stays visible during refetches
  const [unlinkedSnapshot, setUnlinkedSnapshot] = React.useState<Transcript[]>([]);
  const [clientsSnapshot, setClientsSnapshot] = React.useState<NonNullable<typeof clients>>([]);

  React.useEffect(() => {
    if (unlinkedTranscripts) {
      setUnlinkedSnapshot(unlinkedTranscripts);
    }
  }, [unlinkedTranscripts]);

  React.useEffect(() => {
    if (clients) {
      setClientsSnapshot(clients);
    }
  }, [clients]);

  const effectiveUnlinkedTranscripts = unlinkedTranscripts ?? unlinkedSnapshot;
  const effectiveClients = clients ?? clientsSnapshot;

  // All hooks must be called before any early returns
  const getFilteredClients = React.useCallback((query: string) => {
    if (!effectiveClients || !query.trim()) return effectiveClients || [];
    const lowerQuery = query.toLowerCase().trim();
    return effectiveClients.filter((client) => {
      const businessName = client.businessName?.toLowerCase() || "";
      const businessEmail = client.businessEmail?.toLowerCase() || "";
      const contactFirstName = client.contactFirstName?.toLowerCase() || "";
      const contactLastName = client.contactLastName?.toLowerCase() || "";
      const fullName = `${contactFirstName} ${contactLastName}`.trim();
      
      return (
        businessName.includes(lowerQuery) ||
        businessEmail.includes(lowerQuery) ||
        fullName.includes(lowerQuery) ||
        contactFirstName.includes(lowerQuery) ||
        contactLastName.includes(lowerQuery)
      );
    });
  }, [effectiveClients]);

  const dialogFilteredClients = React.useMemo(() => {
    return getFilteredClients(dialogSearchQuery);
  }, [dialogSearchQuery, getFilteredClients]);

  // Combine unlinked transcripts with transcripts linked in this session
  const displayedTranscripts = React.useMemo(() => {
    // If showing linked transcripts for a client, just return them directly
    if (clientId) {
      return effectiveUnlinkedTranscripts || [];
    }
    
    // Otherwise, handle unlinked transcripts with caching
    if (!effectiveUnlinkedTranscripts) return [];
    const linkedIds = new Set(Object.keys(linkedInSession));
    const linkedTranscripts = Object.values(linkedTranscriptCache);
    // Include unlinked transcripts and cached linked transcripts
    // Filter out transcripts that are in the cache to avoid duplicates
    const unlinked = effectiveUnlinkedTranscripts.filter(t => 
      !linkedIds.has(t.transcriptId) && !linkedTranscriptCache[t.transcriptId]
    );
    // Deduplicate by transcriptId - prefer cached versions for linked transcripts
    const transcriptMap = new Map<string, Transcript>();
    // First add unlinked transcripts
    unlinked.forEach(t => transcriptMap.set(t.transcriptId, t));
    // Then add cached linked transcripts (these will override if there's a duplicate)
    linkedTranscripts.forEach(t => transcriptMap.set(t.transcriptId, t));
    return Array.from(transcriptMap.values());
  }, [effectiveUnlinkedTranscripts, linkedInSession, linkedTranscriptCache, clientId]);

  // Watch for selection changes after linking - if user changes selection, unlink
  React.useEffect(() => {
    const checkAndUnlink = async () => {
      for (const [transcriptId, linkedInfo] of Object.entries(linkedInSession)) {
        // Check page selection
        const pageSelection = selectedClientIds[transcriptId];
        // Check dialog selection (only if this transcript is open in dialog)
        const dialogSelection = selectedTranscript?.transcriptId === transcriptId ? dialogSelectedClientId : undefined;
        const currentSelection = pageSelection || dialogSelection;
        
        // Only unlink if there's a different selection (not just cleared or same)
        if (currentSelection && currentSelection !== linkedInfo.clientId) {
          // User changed the selection to a different client - unlink the transcript
          try {
            await unlinkTranscript({ transcriptId });
            setLinkedInSession(prev => {
              const next = { ...prev };
              delete next[transcriptId];
              return next;
            });
            // Remove from cache so it can reappear in unlinkedTranscripts
            setLinkedTranscriptCache(prev => {
              const next = { ...prev };
              delete next[transcriptId];
              return next;
            });
            // Clear the selection that triggered the unlink
            if (selectedTranscript?.transcriptId === transcriptId) {
              setDialogSelectedClientId("");
            } else {
              setSelectedClientIds(prev => {
                const next = { ...prev };
                delete next[transcriptId];
                return next;
              });
            }
          } catch (error) {
            console.error("Failed to unlink transcript:", error);
          }
        }
      }
    };
    
    checkAndUnlink();
  }, [selectedClientIds, dialogSelectedClientId, linkedInSession, unlinkTranscript, selectedTranscript]);

  const isLoading =
    (unlinkedTranscripts === undefined && unlinkedSnapshot.length === 0) ||
    (clients === undefined && clientsSnapshot.length === 0);

  if (isLoading) {
    return (
      <div className="py-2">
          <p className="text-sm text-foreground/60 font-light">Loading...</p>
      </div>
    );
  }

  if (displayedTranscripts.length === 0 && Object.keys(linkedInSession).length === 0) {
    return (
      <div className="py-2">
          <p className="text-sm text-foreground/60 font-light">
            All transcripts are linked to clients.
          </p>
      </div>
    );
  }

  const handleLink = async (
    transcriptId: string, 
    clientId: string, 
    addEmail?: string, 
    transcriptToCache?: Transcript,
    otherTranscripts?: Transcript[]
  ) => {
    setLinking(transcriptId);
    
    // Cache the transcript BEFORE linking so it stays visible
    // Try to get it from displayedTranscripts first, then fallback to unlinkedTranscripts
    let transcript = transcriptToCache;
    if (!transcript) {
      transcript = displayedTranscripts?.find(t => t.transcriptId === transcriptId);
    }
    if (!transcript) {
      transcript = effectiveUnlinkedTranscripts.find(t => t.transcriptId === transcriptId);
    }
    
    // Cache all transcripts that will be linked (main + others)
    const transcriptsToLink = [transcript, ...(otherTranscripts || [])].filter(Boolean) as Transcript[];
    
    transcriptsToLink.forEach(t => {
      if (t) {
        setLinkedTranscriptCache(prev => ({
          ...prev,
          [t.transcriptId]: t
        }));
      }
    });
    
    try {
      // Link all transcripts with the same email
      const linkPromises = transcriptsToLink.map(t => 
        linkTranscript({
          transcriptId: t.transcriptId,
          clientId: clientId as any,
        })
      );
      
      await Promise.all(linkPromises);

      // If email should be added, update client email
      if (addEmail) {
        try {
          await updateClientEmail({
        clientId: clientId as any,
            email: addEmail,
      });
        } catch (emailError) {
          console.error("Failed to update client email:", emailError);
          // Don't fail the whole operation if email update fails
        }
      }

      // Track all transcripts as linked in this session (keep them visible)
      transcriptsToLink.forEach(t => {
        setLinkedInSession(prev => ({
          ...prev,
          [t.transcriptId]: { clientId, emailAdded: !!addEmail }
        }));
        
        // Update UI state for each transcript
        setSelectedClientIds(prev => ({
          ...prev,
          [t.transcriptId]: clientId
        }));
        
        // Set search query to show client name
        const linkedClient = effectiveClients.find(c => c._id === clientId);
        if (linkedClient) {
          setSearchQueries(prev => ({
            ...prev,
            [t.transcriptId]: linkedClient.businessName
          }));
        }
      });

      // Ensure dialog selection is set if this is from dialog
      if (selectedTranscript?.transcriptId === transcriptId) {
        if (!dialogSelectedClientId) {
          setDialogSelectedClientId(clientId);
        }
      }
    } catch (error) {
      console.error("Failed to link transcript:", error);
      alert(error instanceof Error ? error.message : "Failed to link transcript");
    } finally {
      setLinking(null);
      setPendingLink(null);
    }
  };

  const handleLinkClick = (transcriptId: string, transcript: Transcript, clientIdOverride?: string) => {
    const clientId = clientIdOverride || selectedClientIds[transcriptId];
    if (!clientId) return;

    // Filter participant emails (exclude owner email and @gravitate-digital.com emails)
    const participantEmails = transcript.participants?.filter(
      (p: string) => {
        const lowerEmail = p.toLowerCase().trim();
        return (
          lowerEmail !== email.toLowerCase().trim() &&
          !lowerEmail.endsWith("@gravitate-digital.com")
        );
      }
    ) || [];

    // If there are participant emails, show dialog
    if (participantEmails.length > 0) {
      const emailToLink = participantEmails[0];
      // Find other transcripts with the same email
      const otherTranscripts = displayedTranscripts.filter(t => 
        t.transcriptId !== transcriptId &&
        t.participants?.some((p: string) => p.toLowerCase().trim() === emailToLink.toLowerCase().trim())
      ) || [];
      
      setPendingLink({ 
        transcriptId, 
        clientId, 
        email: emailToLink, 
        transcript,
        otherTranscriptIds: otherTranscripts.map(t => t.transcriptId),
        otherTranscripts: otherTranscripts
      });
      setEmailDialogOpen(true);
    } else {
      // No emails to add, just link directly - pass transcript for caching
      handleLink(transcriptId, clientId, undefined, transcript);
    }
  };

  const handleDialogLinkClick = () => {
    if (!dialogSelectedClientId || !selectedTranscript) return;
    
    // Find the full transcript object from displayedTranscripts (includes cached linked ones)
    const fullTranscript = displayedTranscripts.find(t => t.transcriptId === selectedTranscript.transcriptId);
    if (fullTranscript) {
      handleLinkClick(selectedTranscript.transcriptId, fullTranscript, dialogSelectedClientId);
    } else {
      // Fallback: use selectedTranscript if full transcript not found
      // Filter participant emails (exclude owner email and @gravitate-digital.com emails)
      const participantEmails = selectedTranscript.participants?.filter(
        (p: string) => {
          const lowerEmail = p.toLowerCase().trim();
          return (
            lowerEmail !== email.toLowerCase().trim() &&
            !lowerEmail.endsWith("@gravitate-digital.com")
          );
        }
      ) || [];

      // If there are participant emails, show dialog
      if (participantEmails.length > 0) {
        // Need to get full transcript for caching - try to find it
        const fullTranscript = displayedTranscripts?.find(t => t.transcriptId === selectedTranscript.transcriptId) || 
                               effectiveUnlinkedTranscripts.find(t => t.transcriptId === selectedTranscript.transcriptId);
        const emailToLink = participantEmails[0];
        // Find other transcripts with the same email
        const otherTranscripts = displayedTranscripts.filter(t => 
          t.transcriptId !== selectedTranscript.transcriptId &&
          t.participants?.some((p: string) => p.toLowerCase().trim() === emailToLink.toLowerCase().trim())
        ) || [];
        
        setPendingLink({ 
          transcriptId: selectedTranscript.transcriptId, 
          clientId: dialogSelectedClientId, 
          email: emailToLink,
          transcript: fullTranscript,
          otherTranscriptIds: otherTranscripts.map(t => t.transcriptId),
          otherTranscripts: otherTranscripts
        });
        setEmailDialogOpen(true);
      } else {
        // No emails to add, just link directly - need transcript for caching
        const fullTranscript = displayedTranscripts?.find(t => t.transcriptId === selectedTranscript.transcriptId) || 
                               effectiveUnlinkedTranscripts.find(t => t.transcriptId === selectedTranscript.transcriptId);
        handleLink(selectedTranscript.transcriptId, dialogSelectedClientId, undefined, fullTranscript);
      }
    }
  };

  const handleOpenDialog = (transcript: Transcript) => {
    setSelectedTranscript({
      transcriptId: transcript.transcriptId,
      title: transcript.title,
      transcript: transcript.transcript,
      date: transcript.date,
      participants: transcript.participants,
    });
    // Pre-select client if editing a linked transcript
    if (clientId && transcript.clientId === clientId) {
      setDialogSelectedClientId(clientId);
      const currentClient = effectiveClients?.find(c => c._id === clientId);
      if (currentClient) {
        setDialogSearchQuery(currentClient.businessName);
      } else {
        setDialogSearchQuery("");
      }
    } else {
      setDialogSearchQuery("");
      setDialogSelectedClientId("");
    }
  };

  return (
    <>
      <div className="space-y-4">
        {displayedTranscripts.map((transcript) => {
            // Extract client emails from participants (exclude owner email)
            const clientEmails = transcript.participants?.filter(
              (p: string) => p.toLowerCase().trim() !== email.toLowerCase().trim()
            ) || [];

            return (
              <div
                key={transcript._id}
                className="p-4 rounded-md border border-foreground/10 bg-background/50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium truncate">{transcript.title}</h4>
                    <p className="text-xs text-foreground/60 mt-1">
                      {formatDate(transcript.date)}
                      {transcript.duration && ` • ${Math.round(transcript.duration / 60)} min`}
                    </p>
                    {clientEmails.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-foreground/50 mb-1">Participants:</p>
                        <div className="flex flex-wrap gap-1">
                          {clientEmails.map((email: string, idx: number) => (
                            <span
                              key={idx}
                              className="text-xs px-2 py-0.5 rounded bg-foreground/5 text-foreground/70"
                            >
                              {email}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {transcript.transcript && (
                      <p className="text-xs text-foreground/60 mt-2 line-clamp-2">
                        {transcript.transcript.substring(0, 150)}
                        {transcript.transcript.length > 150 ? "..." : ""}
                      </p>
                    )}
                  </div>
              <div className="shrink-0 flex flex-col gap-2 items-end w-full sm:w-auto">
                <div className="group w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground hover:border-accent-foreground/20 hover:shadow-md hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-200 active:translate-y-0 active:scale-100"
                    onClick={() => handleOpenDialog(transcript)}
                  >
                    <Maximize2 className="h-3 w-3 mr-1 transition-transform duration-200 group-hover:scale-110" />
                    View Full Transcript
                  </Button>
                </div>
                {showEditButton ? (
                  // Show edit button for linked transcripts
                  <div className="group w-full sm:w-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground hover:border-accent-foreground/20 hover:shadow-md hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-200 active:translate-y-0 active:scale-100"
                      onClick={() => {
                        // Pre-select the current client if available
                        if (clientId) {
                          setDialogSelectedClientId(clientId);
                        }
                        handleOpenDialog(transcript);
                      }}
                    >
                      <Pencil className="h-3 w-3 mr-1 transition-transform duration-200 group-hover:scale-110" />
                      Edit Link
                    </Button>
                  </div>
                ) : effectiveClients.length > 0 ? (
                  <div className="w-full sm:w-80 flex gap-2 items-start">
                    <div className="flex-1 relative">
                      <Input
                        type="text"
                        placeholder="Search clients..."
                        value={(() => {
                          const query = searchQueries[transcript.transcriptId];
                          if (query !== undefined) return query;
                          // If a client is selected, show their business name
                          const selectedClientId = selectedClientIds[transcript.transcriptId];
                          if (selectedClientId && effectiveClients) {
                            const selectedClient = effectiveClients.find(c => c._id === selectedClientId);
                            return selectedClient?.businessName || "";
                          }
                          return "";
                        })()}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          setSearchQueries(prev => ({
                            ...prev,
                            [transcript.transcriptId]: newValue
                          }));
                          // Clear selection if input is cleared or doesn't match selected client
                          if (newValue === "") {
                            setSelectedClientIds(prev => {
                              const next = { ...prev };
                              delete next[transcript.transcriptId];
                              return next;
                            });
                          } else {
                            const selectedClientId = selectedClientIds[transcript.transcriptId];
                            if (selectedClientId && effectiveClients) {
                              const selectedClient = effectiveClients.find(c => c._id === selectedClientId);
                              // Clear selection if the typed value doesn't match the selected client's name
                              if (selectedClient && !selectedClient.businessName.toLowerCase().includes(newValue.toLowerCase())) {
                                setSelectedClientIds(prev => {
                                  const next = { ...prev };
                                  delete next[transcript.transcriptId];
                                  return next;
                                });
                              }
                            }
                          }
                        }}
                        className="w-full text-sm"
                        disabled={linking === transcript.transcriptId}
                      />
                      {(() => {
                        const query = searchQueries[transcript.transcriptId];
                        const selectedClientId = selectedClientIds[transcript.transcriptId];
                        // Show dropdown if there's a query and either no client is selected, or the query doesn't match the selected client
                        if (!query) return false;
                          if (selectedClientId && effectiveClients) {
                            const selectedClient = effectiveClients.find(c => c._id === selectedClientId);
                          if (selectedClient && selectedClient.businessName.toLowerCase() === query.toLowerCase()) {
                            return false; // Hide dropdown if query exactly matches selected client
                          }
                        }
                        return getFilteredClients(query).length > 0;
                      })() && (
                        <div className="absolute z-10 w-full mt-1 max-h-32 overflow-y-auto border border-foreground/10 rounded-md bg-background shadow-lg">
                          {getFilteredClients(searchQueries[transcript.transcriptId] || "").map((client) => (
                            <button
                              key={client._id}
                              onClick={() => {
                                setSelectedClientIds(prev => ({
                                  ...prev,
                                  [transcript.transcriptId]: client._id
                                }));
                                // Set search query to client's business name
                                setSearchQueries(prev => ({
                                  ...prev,
                                  [transcript.transcriptId]: client.businessName
                                }));
                              }}
                              disabled={linking === transcript.transcriptId}
                              className={`w-full text-left px-3 py-2 text-sm hover:bg-foreground/5 disabled:opacity-50 disabled:cursor-not-allowed ${
                                selectedClientIds[transcript.transcriptId] === client._id ? "bg-foreground/10" : ""
                              }`}
                            >
                              <div className="font-medium">{client.businessName}</div>
                              {client.businessEmail && (
                                <div className="text-xs text-foreground/60">{client.businessEmail}</div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="group">
                      <Button
                        variant="default"
                        size="sm"
                        className="text-sm cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-lg hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap active:translate-y-0 active:scale-100"
                        onClick={() => handleLinkClick(transcript.transcriptId, transcript)}
                        disabled={!selectedClientIds[transcript.transcriptId] || linking === transcript.transcriptId}
                      >
                        <Link2 className="h-3 w-3 mr-1 transition-transform duration-200 group-hover:scale-110" />
                        Link
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-foreground/50 italic">
                    No clients available
                  </p>
                )}
              </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* Transcript Dialog */}
      {selectedTranscript && (
        <Dialog open={true} onOpenChange={(open) => {
          if (!open) {
            setSelectedTranscript(null);
            setDialogSearchQuery("");
            setDialogSelectedClientId("");
          }
        }}>
          <DialogContent className="flex flex-col gap-0 p-0 sm:max-h-[min(640px,80vh)] sm:max-w-lg [&>button:last-child]:hidden">
            <div className="overflow-y-auto">
              <DialogHeader className="contents space-y-0 text-left">
                <DialogTitle className="px-6 pt-6 text-base">
                  {selectedTranscript.title}
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="p-6">
                    <div className="space-y-4 [&_strong]:font-semibold [&_strong]:text-foreground">
                      <div className="space-y-2">
                        <p className="text-xs text-foreground/60">
                          {formatDate(selectedTranscript.date)}
                          {selectedTranscript.participants && selectedTranscript.participants.length > 0 && (
                            <> • {selectedTranscript.participants.join(", ")}</>
                          )}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                          {selectedTranscript.transcript}
                        </p>
                      </div>
                    </div>
                  </div>
                </DialogDescription>
              </DialogHeader>
            </div>
            <DialogFooter className="border-t px-6 py-4">
              <div className="w-full space-y-2 mb-3">
                <Input
                  type="text"
                  placeholder="Search clients..."
                  value={(() => {
                    if (dialogSearchQuery !== undefined && dialogSearchQuery !== "") return dialogSearchQuery;
                    // If a client is selected, show their business name
                    if (dialogSelectedClientId && effectiveClients) {
                      const selectedClient = effectiveClients.find(c => c._id === dialogSelectedClientId);
                      return selectedClient?.businessName || "";
                    }
                    return "";
                  })()}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setDialogSearchQuery(newValue);
                    // Clear selection if input is cleared or doesn't match selected client
                    if (newValue === "") {
                      setDialogSelectedClientId("");
                    } else {
                      if (dialogSelectedClientId && effectiveClients) {
                        const selectedClient = effectiveClients.find(c => c._id === dialogSelectedClientId);
                        // Clear selection if the typed value doesn't match the selected client's name
                        if (selectedClient && !selectedClient.businessName.toLowerCase().includes(newValue.toLowerCase())) {
                          setDialogSelectedClientId("");
                        }
                      }
                    }
                  }}
                  className="w-full"
                />
                {(() => {
                  const query = dialogSearchQuery || "";
                  // Show dropdown if there's a query and either no client is selected, or the query doesn't match the selected client
                  if (!query) return false;
                  if (dialogSelectedClientId && effectiveClients) {
                    const selectedClient = effectiveClients.find(c => c._id === dialogSelectedClientId);
                    if (selectedClient && selectedClient.businessName.toLowerCase() === query.toLowerCase()) {
                      return false; // Hide dropdown if query exactly matches selected client
                    }
                  }
                  return dialogFilteredClients && dialogFilteredClients.length > 0;
                })() && (
                  <div className="max-h-32 overflow-y-auto border border-foreground/10 rounded-md bg-background">
                    {dialogFilteredClients.map((client) => (
                      <button
                        key={client._id}
                        onClick={() => {
                          setDialogSelectedClientId(client._id);
                          // Set search query to client's business name
                          setDialogSearchQuery(client.businessName);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm cursor-pointer hover:bg-foreground/5 ${
                          dialogSelectedClientId === client._id ? "bg-foreground/10" : ""
                        }`}
                      >
                        <div className="font-medium">{client.businessName}</div>
                        {client.businessEmail && (
                          <div className="text-xs text-foreground/60">{client.businessEmail}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <DialogClose asChild>
                <Button 
                  type="button" 
                  variant="outline"
                  className="cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-200 active:translate-y-0 active:scale-100"
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="default"
                disabled={!dialogSelectedClientId || linking === selectedTranscript.transcriptId}
                onClick={handleDialogLinkClick}
                className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-200 active:translate-y-0 active:scale-100"
              >
                {linking === selectedTranscript.transcriptId ? "Linking..." : "Link"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Email Addition Alert Dialog */}
      <AlertDialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add email to client contact info?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingLink?.email && (
                <>
                  Add <strong>{pendingLink.email}</strong> to this client's contact information?
                  <br /><br />
                  If you do, every new transcript that comes through with this email will automatically be linked to this client.
                  {pendingLink.otherTranscriptIds && pendingLink.otherTranscriptIds.length > 0 && (
                    <>
                      <br /><br />
                      <strong>Note:</strong> There {pendingLink.otherTranscriptIds.length === 1 ? 'is' : 'are'} {pendingLink.otherTranscriptIds.length} other transcript{pendingLink.otherTranscriptIds.length === 1 ? '' : 's'} with the same participant email. {pendingLink.otherTranscriptIds.length === 1 ? 'It will' : 'They will'} also be linked to this client.
                    </>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => {
                setEmailDialogOpen(false);
                setPendingLink(null);
              }}
              className="cursor-pointer hover:bg-accent hover:text-accent-foreground hover:shadow-md hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-200 active:translate-y-0 active:scale-100"
            >
              Cancel
            </AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                if (pendingLink) {
                  // Link without adding email - pass transcript and other transcripts for caching
                  handleLink(
                    pendingLink.transcriptId, 
                    pendingLink.clientId, 
                    undefined, 
                    pendingLink.transcript,
                    pendingLink.otherTranscripts
                  );
                  setEmailDialogOpen(false);
                }
              }}
              className="cursor-pointer hover:bg-accent hover:text-accent-foreground hover:border-accent-foreground/20 hover:shadow-md hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-200 active:translate-y-0 active:scale-100"
            >
              Link Only
            </Button>
            <AlertDialogAction 
              onClick={() => {
                if (pendingLink) {
                  // Link with adding email - pass transcript and other transcripts for caching
                  handleLink(
                    pendingLink.transcriptId, 
                    pendingLink.clientId, 
                    pendingLink.email, 
                    pendingLink.transcript,
                    pendingLink.otherTranscripts
                  );
                  setEmailDialogOpen(false);
                }
              }}
              className="cursor-pointer hover:bg-primary/90 hover:shadow-lg hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-200 active:translate-y-0 active:scale-100"
            >
              Add Email
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

