"use client";

import * as React from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";

type FormField = {
  id: string;
  ref: string;
  title: string;
  type: string;
};

type CreateManualClientDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  formFields: FormField[] | null;
  formId: string | null;
};

export default function CreateManualClientDialog({
  open,
  onOpenChange,
  email,
  formFields,
  formId,
}: CreateManualClientDialogProps) {
  const createClient = useMutation(api.clients.createManualClient);
  const fetchFormDetails = useAction(api.typeformActions.fetchTypeformFormDetails);
  const [loading, setLoading] = React.useState(false);
  const [loadingFormQuestions, setLoadingFormQuestions] = React.useState(false);
  const [formData, setFormData] = React.useState<Record<string, string>>({});
  const [generateScriptImmediately, setGenerateScriptImmediately] = React.useState(true);
  const [schedule, setSchedule] = React.useState<string[]>(["offset25", "monthly"]); // default = standard
  const [manualMonthlyStart, setManualMonthlyStart] = React.useState<string>("");
  const [firstScriptDate, setFirstScriptDate] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<FormField[]>(formFields || []);
  const [formQuestionsLoaded, setFormQuestionsLoaded] = React.useState(false);

  // Fetch form details when dialog opens
  React.useEffect(() => {
    if (!open) {
      // Reset state when dialog closes
      setFields([]);
      setFormQuestionsLoaded(false);
      setLoadingFormQuestions(false);
      setError(null);
      return;
    }

    // If formFields are already provided, use them
    if (formFields && formFields.length > 0) {
      setFields(formFields);
      setFormQuestionsLoaded(true);
      return;
    }

    // If we have a formId but no formFields, fetch them
    if (formId && !formFields) {
      setLoadingFormQuestions(true);
      const loadFormDetails = async () => {
        try {
          const details = await fetchFormDetails({ email, formId });
          if (details?.fields && details.fields.length > 0) {
            setFields(details.fields);
            setFormQuestionsLoaded(true);
          } else {
            // No fields found, show fallback
            setFormQuestionsLoaded(true);
          }
        } catch (err) {
          console.error("Failed to fetch form details:", err);
          setError(err instanceof Error ? err.message : "Failed to load form questions");
          setFormQuestionsLoaded(true); // Still show fallback even on error
        } finally {
          setLoadingFormQuestions(false);
        }
      };
      loadFormDetails();
    } else {
      // No formId, show fallback immediately
      setFormQuestionsLoaded(true);
    }
  }, [open, formId, formFields, email, fetchFormDetails]);

  // Reset form when dialog closes
  React.useEffect(() => {
    if (!open) {
      setFormData({});
      setError(null);
      setGenerateScriptImmediately(true);
      setSchedule(["offset25", "monthly"]);
      setManualMonthlyStart("");
      setFirstScriptDate("");
      setFields([]);
      setFormQuestionsLoaded(false);
    }
  }, [open]);

  // Helper functions for date calculations
  const addDays = React.useCallback((date: Date, days: number): Date => {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + days);
    return d;
  }, []);

  const formatDate = React.useCallback((d: Date | null): string => {
    if (!d) return "-";
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, []);

  const ordinal = React.useCallback((n: number): string => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }, []);

  const sortSchedule = React.useCallback((list: string[]): string[] => {
    const order = ["offset25", "monthly"];
    return order.filter((t) => list.includes(t));
  }, []);

  const handleDropBlock = React.useCallback((blockType: string) => {
    setSchedule((prev) => {
      if (prev.includes(blockType)) return prev;
      const next = [...prev, blockType];
      return sortSchedule(next);
    });
  }, [sortSchedule]);

  const handleRemoveBlock = React.useCallback((blockType: string) => {
    setSchedule((prev) => prev.filter((t) => t !== blockType));
  }, []);

  const clearAllBlocks = React.useCallback(() => {
    setSchedule([]);
    setManualMonthlyStart("");
  }, []);

  // Calculate schedule preview dates based on schedule
  const schedulePreview = React.useMemo(() => {
    const now = new Date();
    const initialDate = generateScriptImmediately ? now : (firstScriptDate ? new Date(firstScriptDate) : now);
    
    if (isNaN(initialDate.getTime())) {
      return null;
    }

    let first25: Date | null = null;
    let firstMonthly: Date | null = null;
    let secondMonthly: Date | null = null;
    let anchorDay: number | null = null;

    if (schedule.includes("offset25")) {
      first25 = addDays(initialDate, 25);
    }

    if (schedule.includes("monthly")) {
      if (schedule.includes("offset25") && first25) {
        // Standard flow: monthly anchored to the 25-day follow-up
        firstMonthly = first25;
      } else if (manualMonthlyStart) {
        // Skip 25: user picks the first monthly date
        firstMonthly = new Date(manualMonthlyStart + "T00:00:00");
      }

      if (firstMonthly && !isNaN(firstMonthly.getTime())) {
        anchorDay = firstMonthly.getDate();
        secondMonthly = new Date(firstMonthly);
        secondMonthly.setMonth(secondMonthly.getMonth() + 1);
      }
    }

    return {
      initialDate,
      first25,
      firstMonthly,
      secondMonthly,
      anchorDay,
    };
  }, [schedule, generateScriptImmediately, firstScriptDate, manualMonthlyStart, addDays]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Extract common fields from form data
      // First check standard keys
      let businessName = formData.businessName || formData["business_name"] || formData.company || formData.companyName || "";
      
      // If not found, check Typeform field keys
      if (!businessName.trim() && fields.length > 0) {
        const businessNameField = fields.find(f => 
          f.title.toLowerCase().includes("business name") || 
          f.title.toLowerCase().includes("company name")
        );
        if (businessNameField) {
          businessName = formData[businessNameField.ref] || 
                        formData[businessNameField.title.toLowerCase().replace(/\s+/g, "_")] || 
                        "";
        }
      }
      
      // Extract email - check standard keys first, then Typeform field keys
      let businessEmail = formData.businessEmail || formData.email || formData["business_email"] || "";
      if (!businessEmail.trim() && fields.length > 0) {
        const emailField = fields.find(f => f.type === "email");
        if (emailField) {
          businessEmail = formData[emailField.ref] || 
                          formData[emailField.title.toLowerCase().replace(/\s+/g, "_")] || 
                          "";
        }
      }
      
      const contactFirstName = formData.firstName || formData["first_name"] || formData.first || "";
      const contactLastName = formData.lastName || formData["last_name"] || formData.last || "";
      const website = formData.website || formData.url || formData["company_website"] || "";
      
      // Extract target revenue if present
      let targetRevenue: number | undefined;
      const revenueStr = formData.targetRevenue || formData.revenue || formData["target_revenue"] || formData.budget || "";
      if (revenueStr) {
        const parsed = parseFloat(revenueStr.replace(/[^0-9.]/g, ""));
        if (!isNaN(parsed)) {
          targetRevenue = parsed;
        }
      }

      if (!businessName.trim()) {
        setError("Business name is required. Please fill in the business name field (marked with *) to create a client.");
        setLoading(false);
        return;
      }

      // Validate email if it's marked as required (email type fields)
      // Check if any email field exists and is marked as required
      const hasEmailField = fields.some(f => f.type === "email");
      if (hasEmailField && !businessEmail.trim()) {
        setError("Business email is required. Please fill in the email field (marked with *) to create a client.");
        setLoading(false);
        return;
      }

      // Validate schedule: if monthly is selected without offset25, manualMonthlyStart is required
      if (schedule.includes("monthly") && !schedule.includes("offset25") && !manualMonthlyStart) {
        setError("Please select a start date for the monthly schedule.");
        setLoading(false);
        return;
      }

      // Calculate baseTime for cron jobs
      const now = Date.now();
      const initialDate = generateScriptImmediately ? new Date(now) : (firstScriptDate ? new Date(firstScriptDate) : new Date(now));
      const cronJobBaseTime = initialDate.getTime();

      // Determine schedule configuration
      const skipFirstCronJob = !schedule.includes("offset25");
      const enableCronJobs = schedule.length > 0;
      
      // If monthly is selected without offset25, use manualMonthlyStart as base
      let monthlyStartTime: number | undefined;
      if (schedule.includes("monthly") && !schedule.includes("offset25") && manualMonthlyStart) {
        const monthlyDate = new Date(manualMonthlyStart + "T00:00:00");
        if (!isNaN(monthlyDate.getTime())) {
          monthlyStartTime = monthlyDate.getTime();
        }
      }

      const clientId = await createClient({
        ownerEmail: email,
        businessEmail: businessEmail.trim() || undefined,
        businessName: businessName.trim(),
        contactFirstName: contactFirstName.trim() || undefined,
        contactLastName: contactLastName.trim() || undefined,
        targetRevenue,
        website: website.trim() || undefined,
        generateScriptImmediately,
        enableCronJobs,
        cronJobBaseTime: monthlyStartTime || cronJobBaseTime,
        skipFirstCronJob,
        monthlyStartTime: monthlyStartTime ? monthlyStartTime : undefined,
      });

      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create client");
    } finally {
      setLoading(false);
    }
  };

  // Helper to get field value by ref or title
  const getFieldValue = (ref: string, title: string): string => {
    return formData[ref] || formData[title.toLowerCase().replace(/\s+/g, "_")] || "";
  };

  const updateFieldValue = (ref: string, title: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [ref]: value,
      [title.toLowerCase().replace(/\s+/g, "_")]: value,
    }));
  };

  // Helper to check if business name is filled
  const hasBusinessName = React.useMemo(() => {
    // Check standard keys
    let businessName = formData.businessName || formData["business_name"] || formData.company || formData.companyName || "";
    
    // If not found, check Typeform field keys
    if (!businessName.trim() && fields.length > 0) {
      const businessNameField = fields.find(f => 
        f.title.toLowerCase().includes("business name") || 
        f.title.toLowerCase().includes("company name")
      );
      if (businessNameField) {
        businessName = formData[businessNameField.ref] || 
                      formData[businessNameField.title.toLowerCase().replace(/\s+/g, "_")] || 
                      "";
      }
    }
    
    return businessName.trim().length > 0;
  }, [formData, fields]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Manual Client</DialogTitle>
          <DialogDescription>
            Enter client details based on your Typeform onboarding questions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 text-sm text-red-500">
              {error}
            </div>
          )}

          {loadingFormQuestions ? (
            <div className="text-sm text-foreground/60 py-8 text-center">
              <p>Loading form questions...</p>
              <p className="mt-2 text-xs text-foreground/50">
                Fetching onboarding form structure from Typeform...
              </p>
            </div>
          ) : formQuestionsLoaded && fields.length > 0 ? (
            <div className="space-y-4">
              {fields.map((field) => {
                const value = getFieldValue(field.ref, field.title);
                const isRequired = field.type === "email" || field.title.toLowerCase().includes("business name") || field.title.toLowerCase().includes("company name");
                
                return (
                  <div key={field.id} className="space-y-2">
                    <Label htmlFor={field.ref} className="text-sm">
                      {field.title}
                      {isRequired && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    {field.type === "email" ? (
                      <Input
                        id={field.ref}
                        type="email"
                        value={value}
                        onChange={(e) => updateFieldValue(field.ref, field.title, e.target.value)}
                        placeholder={`Enter ${field.title.toLowerCase()}`}
                        className="w-full"
                      />
                    ) : field.type === "number" || field.title.toLowerCase().includes("revenue") || field.title.toLowerCase().includes("budget") ? (
                      <Input
                        id={field.ref}
                        type="number"
                        value={value}
                        onChange={(e) => updateFieldValue(field.ref, field.title, e.target.value)}
                        placeholder={`Enter ${field.title.toLowerCase()}`}
                        className="w-full"
                      />
                    ) : field.type === "website" || field.title.toLowerCase().includes("website") || field.title.toLowerCase().includes("url") ? (
                      <Input
                        id={field.ref}
                        type="url"
                        value={value}
                        onChange={(e) => updateFieldValue(field.ref, field.title, e.target.value)}
                        placeholder="https://example.com"
                        className="w-full"
                      />
                    ) : (
                      <Input
                        id={field.ref}
                        type="text"
                        value={value}
                        onChange={(e) => updateFieldValue(field.ref, field.title, e.target.value)}
                        placeholder={`Enter ${field.title.toLowerCase()}`}
                        className="w-full"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : formQuestionsLoaded && fields.length === 0 ? (
            // Fallback manual fields if form questions failed to load or no fields found
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="businessName" className="text-sm">
                  Business Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="businessName"
                  type="text"
                  value={formData.businessName || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, businessName: e.target.value }))}
                  placeholder="Enter business name"
                  required
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="businessEmail" className="text-sm">
                  Business Email
                </Label>
                <Input
                  id="businessEmail"
                  type="email"
                  value={formData.businessEmail || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, businessEmail: e.target.value }))}
                  placeholder="Enter business email"
                  className="w-full"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactFirstName" className="text-sm">
                    First Name
                  </Label>
                  <Input
                    id="contactFirstName"
                    type="text"
                    value={formData.contactFirstName || ""}
                    onChange={(e) => setFormData((prev) => ({ ...prev, contactFirstName: e.target.value }))}
                    placeholder="Enter first name"
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactLastName" className="text-sm">
                    Last Name
                  </Label>
                  <Input
                    id="contactLastName"
                    type="text"
                    value={formData.contactLastName || ""}
                    onChange={(e) => setFormData((prev) => ({ ...prev, contactLastName: e.target.value }))}
                    placeholder="Enter last name"
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {/* Script Generation Section */}
          <div className="pt-4 border-t border-foreground/10 space-y-6">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Script generation
            </h3>

            {/* Initial scripts */}
            <section className="space-y-2">
              <h4 className="font-medium text-sm text-foreground/80">Initial scripts</h4>
              <label className="inline-flex items-center gap-2 text-sm text-foreground/70 cursor-pointer">
                <Checkbox
                  id="generateScriptImmediately"
                  checked={generateScriptImmediately}
                  onCheckedChange={(checked) => setGenerateScriptImmediately(checked === true)}
                />
                <span>
                  Generate first scripts{" "}
                  <span className="font-semibold">immediately</span> when this
                  client is created
                </span>
              </label>
              <p className="text-xs text-foreground/60">
                If unchecked, the schedule is based on the client's created date
                instead of "now".
              </p>
            </section>

            {/* Drag & drop schedule builder */}
            <section className="space-y-3">
              <h4 className="font-medium text-sm text-foreground/80">
                Ongoing schedule builder
              </h4>

              <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
                {/* Timeline canvas (now on the left) */}
                <div className="rounded-lg border border-foreground/15 bg-foreground/5 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
                      Timeline
                    </div>
                    <button
                      type="button"
                      onClick={clearAllBlocks}
                      className="text-[11px] text-foreground/60 hover:text-foreground/80"
                    >
                      Clear all
                    </button>
                  </div>

                  {/* Pinned initial step */}
                  <div className="rounded-md border border-dashed border-foreground/20 bg-background px-3 py-2 text-xs text-foreground/80 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Step 1 · Initial scripts</span>
                      <span className="text-[11px] text-foreground/50">
                        {generateScriptImmediately ? "Runs on save" : "Runs at created date"}
                      </span>
                    </div>
                    <div className="text-[11px] text-foreground/50">
                      The first script set for this client.
                    </div>
                  </div>

                  {/* Droppable zone for follow-up steps */}
                  <div
                    className={[
                      "mt-1 rounded-md border border-dashed",
                      "px-3 py-3 bg-foreground/5 min-h-[96px]",
                    ].join(" ")}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const source = e.dataTransfer.getData(
                        "application/x-block-source"
                      );
                      const type = e.dataTransfer.getData("text/plain");
                      if (
                        source === "library" &&
                        (type === "offset25" || type === "monthly")
                      ) {
                        handleDropBlock(type);
                      }
                    }}
                  >
                    {schedule.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center text-[11px] text-foreground/50 gap-1">
                        <span>Drop blocks here to add follow-up runs.</span>
                        <span>
                          Leave empty for no automatic schedule (manual only).
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {sortSchedule(schedule).map((blockType, index) => {
                          const isOffset25 = blockType === "offset25";
                          const isMonthly = blockType === "monthly";

                          if (isOffset25) {
                            return (
                              <div
                                key={blockType}
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData(
                                    "application/x-block-source",
                                    "timeline"
                                  );
                                  e.dataTransfer.setData("text/plain", blockType);
                                }}
                                className="rounded-md border bg-background px-3 py-2 text-xs text-foreground/80 flex flex-col gap-1"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium">
                                    Step {index + 2} · 25 days after initial
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveBlock("offset25")}
                                    className="text-[11px] text-foreground/40 hover:text-foreground/70"
                                  >
                                    × Remove
                                  </button>
                                </div>
                                <div className="text-[11px] text-foreground/50">
                                  Generate scripts once,{" "}
                                  <span className="font-semibold">25 days</span>{" "}
                                  after the initial scripts.
                                </div>
                                <div className="text-[11px] text-foreground/50">
                                  Estimated date:{" "}
                                  <span className="font-medium">
                                    {formatDate(schedulePreview?.first25 || null)}
                                  </span>
                                </div>
                              </div>
                            );
                          }

                          if (isMonthly) {
                            const hasOffset = schedule.includes("offset25");

                            return (
                              <div
                                key={blockType}
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData(
                                    "application/x-block-source",
                                    "timeline"
                                  );
                                  e.dataTransfer.setData("text/plain", blockType);
                                }}
                                className="rounded-md border bg-background px-3 py-2 text-xs text-foreground/80 flex flex-col gap-1"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium">
                                    Step {index + 2} · Monthly recurrence
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveBlock("monthly")}
                                    className="text-[11px] text-foreground/40 hover:text-foreground/70"
                                  >
                                    × Remove
                                  </button>
                                </div>

                                {hasOffset ? (
                                  <>
                                    <div className="text-[11px] text-foreground/50">
                                      Starts on the{" "}
                                      <span className="font-semibold">
                                        same day as the 25-day follow-up
                                      </span>{" "}
                                      and then repeats every month on that calendar
                                      day.
                                    </div>
                                    <div className="text-[11px] text-foreground/50">
                                      First monthly run:{" "}
                                      <span className="font-medium">
                                        {formatDate(schedulePreview?.firstMonthly || null)}
                                      </span>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="text-[11px] text-foreground/50">
                                      Skip the 25-day run and start directly with a{" "}
                                      <span className="font-semibold">
                                        monthly cadence
                                      </span>
                                      .
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                      <span className="text-[11px] text-foreground/50">
                                        First monthly run:
                                      </span>
                                      <Input
                                        type="date"
                                        className="rounded border border-foreground/20 px-2 py-1 text-[11px] h-auto"
                                        value={manualMonthlyStart}
                                        onChange={(e) =>
                                          setManualMonthlyStart(e.target.value)
                                        }
                                      />
                                    </div>
                                    {manualMonthlyStart && (
                                      <div className="text-[11px] text-foreground/50">
                                        Then every month on that same calendar day.
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          }

                          return null;
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Blocks library (now on the right, and droppable to remove) */}
                <div
                  className="rounded-lg border border-foreground/15 bg-foreground/5 p-3 space-y-3"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const source = e.dataTransfer.getData(
                      "application/x-block-source"
                    );
                    const type = e.dataTransfer.getData("text/plain");
                    if (
                      source === "timeline" &&
                      (type === "offset25" || type === "monthly")
                    ) {
                      handleRemoveBlock(type);
                    }
                  }}
                >
                  <div className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
                    Blocks
                  </div>
                  <p className="text-xs text-foreground/60">
                    Drag blocks from here into the timeline to add them, or drag
                    blocks back into this panel to remove them from the timeline.
                  </p>

                  <div className="space-y-2">
                    {[
                      {
                        type: "offset25",
                        title: "25 days after initial",
                        description: "Run scripts once, 25 days after the first scripts.",
                      },
                      {
                        type: "monthly",
                        title: "Monthly on same calendar day",
                        description:
                          "Repeat scripts every month based on the first follow-up date or a chosen start date.",
                      },
                    ].map((block) => {
                      const used = schedule.includes(block.type);
                      return (
                        <div
                          key={block.type}
                          draggable={!used}
                          onDragStart={(e) => {
                            e.dataTransfer.setData(
                              "application/x-block-source",
                              "library"
                            );
                            e.dataTransfer.setData("text/plain", block.type);
                          }}
                          className={[
                            "rounded-md border px-3 py-2 text-xs shadow-sm",
                            "bg-background flex flex-col gap-1",
                            used
                              ? "opacity-40 cursor-not-allowed"
                              : "cursor-grab hover:border-foreground/30",
                          ].join(" ")}
                        >
                          <div className="font-medium text-foreground/90">
                            {block.title}
                          </div>
                          <div className="text-[11px] text-foreground/50">
                            {block.description}
                          </div>
                          {used && (
                            <div className="text-[10px] text-emerald-600 mt-1">
                              In timeline (drag out to remove)
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>

            {/* Preview */}
            <section className="rounded-md bg-foreground/5 px-3 py-3 text-xs text-foreground/70 space-y-1 border border-foreground/15">
              <div className="font-semibold text-foreground/90 mb-1">
                Schedule preview
              </div>

              <div>
                <span className="font-medium">Initial scripts: </span>
                {generateScriptImmediately
                  ? `Immediately (${formatDate(new Date())})`
                  : `On client created date (${formatDate(schedulePreview?.initialDate || null)})`}
              </div>

              {schedule.includes("offset25") && (
                <div>
                  <span className="font-medium">25-day follow-up: </span>
                  {formatDate(schedulePreview?.first25 || null)}
                </div>
              )}

              {schedule.includes("monthly") && (
                <>
                  <div>
                    <span className="font-medium">First monthly run: </span>
                    {schedulePreview?.firstMonthly ? formatDate(schedulePreview.firstMonthly) : "Select a start date"}
                  </div>
                  {schedulePreview?.anchorDay && (
                    <div>
                      <span className="font-medium">Then: </span>
                      Every month on the {ordinal(schedulePreview.anchorDay)}{" "}
                      {schedulePreview.secondMonthly && `(next: ${formatDate(schedulePreview.secondMonthly)})`}
                    </div>
                  )}
                </>
              )}

              {schedule.length === 0 && (
                <div>No follow-up cron jobs will be scheduled automatically.</div>
              )}
            </section>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5 transition-all duration-150 font-light"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm rounded-md border border-foreground/15 bg-foreground text-background hover:bg-foreground/90 transition-all duration-150 font-light disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
              onClick={(e) => {
                // Check validation before submit
                // First check standard keys
                let businessName = formData.businessName || formData["business_name"] || formData.company || formData.companyName || "";
                
                // If not found, check Typeform field keys
                if (!businessName.trim() && fields.length > 0) {
                  const businessNameField = fields.find(f => 
                    f.title.toLowerCase().includes("business name") || 
                    f.title.toLowerCase().includes("company name")
                  );
                  if (businessNameField) {
                    businessName = formData[businessNameField.ref] || 
                                  formData[businessNameField.title.toLowerCase().replace(/\s+/g, "_")] || 
                                  "";
                  }
                }
                
                if (!businessName.trim()) {
                  e.preventDefault();
                  setError("Business name is required. Please fill in the business name field (marked with *) to create a client.");
                  return;
                }
                // Check email validation if email field exists
                let businessEmail = formData.businessEmail || formData.email || formData["business_email"] || "";
                if (!businessEmail.trim() && fields.length > 0) {
                  const emailField = fields.find(f => f.type === "email");
                  if (emailField) {
                    businessEmail = formData[emailField.ref] || 
                                    formData[emailField.title.toLowerCase().replace(/\s+/g, "_")] || 
                                    "";
                  }
                }
                const hasEmailField = fields.some(f => f.type === "email");
                if (hasEmailField && !businessEmail.trim()) {
                  e.preventDefault();
                  setError("Business email is required. Please fill in the email field (marked with *) to create a client.");
                  return;
                }
                // Check schedule validation
                if (schedule.includes("monthly") && !schedule.includes("offset25") && !manualMonthlyStart) {
                  e.preventDefault();
                  setError("Please select a start date for the monthly schedule.");
                  return;
                }
              }}
            >
              {loading ? "Creating..." : "Create Client"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

