"use client";

import * as React from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card } from "./ui/card";
import { Plus, Trash2, Loader2, Calendar } from "lucide-react";
import { useRouter } from "next/navigation";

type ImportRow = {
  id: string;
  businessName: string;
  contactFirstName: string;
  contactLastName: string;
  startDate: string; // YYYY-MM-DD format
};

type ImportClientProps = {
  email: string;
};

export default function ImportClient({ email }: ImportClientProps) {
  const router = useRouter();
  const createClient = useMutation(api.clients.createManualClient);
  const [rows, setRows] = React.useState<ImportRow[]>([
    {
      id: crypto.randomUUID(),
      businessName: "",
      contactFirstName: "",
      contactLastName: "",
      startDate: "",
    },
  ]);
  const [isImporting, setIsImporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successCount, setSuccessCount] = React.useState<number | null>(null);

  const addRow = () => {
    setRows([
      ...rows,
      {
        id: crypto.randomUUID(),
        businessName: "",
        contactFirstName: "",
        contactLastName: "",
        startDate: "",
      },
    ]);
  };

  const removeRow = (id: string) => {
    if (rows.length > 1) {
      setRows(rows.filter((row) => row.id !== id));
    }
  };

  const updateRow = (id: string, field: keyof ImportRow, value: string) => {
    setRows(
      rows.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const handleImport = async () => {
    setError(null);
    setSuccessCount(null);
    
    // Validate rows
    const validRows = rows.filter(
      (row) => row.businessName.trim() && row.startDate
    );

    if (validRows.length === 0) {
      setError("Please fill in at least one row with business name and start date.");
      return;
    }

    // Validate dates are in the past
    const now = Date.now();
    const invalidDates = validRows.filter((row) => {
      const date = new Date(row.startDate + "T00:00:00");
      return isNaN(date.getTime()) || date.getTime() >= now;
    });

    if (invalidDates.length > 0) {
      setError("All start dates must be in the past.");
      return;
    }

    setIsImporting(true);

    try {
      let success = 0;
      const errors: string[] = [];

      // Import clients one by one
      for (const row of validRows) {
        try {
          const startDate = new Date(row.startDate + "T00:00:00");
          const cronJobBaseTime = startDate.getTime();

          await createClient({
            ownerEmail: email,
            businessName: row.businessName.trim(),
            contactFirstName: row.contactFirstName.trim() || undefined,
            contactLastName: row.contactLastName.trim() || undefined,
            generateScriptImmediately: false, // Don't generate immediately for imports
            enableCronJobs: true,
            cronJobBaseTime,
            skipFirstCronJob: false, // Use standard 25 + 30 day schedule
          });

          success++;
        } catch (err) {
          errors.push(
            `${row.businessName}: ${err instanceof Error ? err.message : "Failed to import"}`
          );
        }
      }

      if (errors.length > 0) {
        setError(
          `Imported ${success} client(s) successfully. Errors: ${errors.join("; ")}`
        );
      } else {
        setSuccessCount(success);
        // Clear form after successful import
        setTimeout(() => {
          setRows([
            {
              id: crypto.randomUUID(),
              businessName: "",
              contactFirstName: "",
              contactLastName: "",
              startDate: "",
            },
          ]);
          setSuccessCount(null);
        }, 2000);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to import clients"
      );
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-12 bg-background">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-light tracking-tight text-foreground mb-3">
            Import Clients
          </h1>
          <p className="text-base text-foreground/60 font-light">
            Quickly import multiple clients with their start dates. Cron jobs will be scheduled from the start date (25 days + 30 days pattern).
          </p>
        </div>

        {/* Import Form */}
        <Card className="bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md">
          <div className="p-6 space-y-6">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 pb-2 border-b border-foreground/10">
              <div className="col-span-3">
                <Label className="text-sm font-medium">Business Name *</Label>
              </div>
              <div className="col-span-3">
                <Label className="text-sm font-medium">First Name</Label>
              </div>
              <div className="col-span-3">
                <Label className="text-sm font-medium">Last Name</Label>
              </div>
              <div className="col-span-2">
                <Label className="text-sm font-medium">Start Date *</Label>
              </div>
            </div>

            {/* Rows */}
            <div className="space-y-3">
              {rows.map((row, index) => (
                <div
                  key={row.id}
                  className="grid grid-cols-12 gap-4 items-center"
                >
                  <div className="col-span-3">
                    <Input
                      value={row.businessName}
                      onChange={(e) =>
                        updateRow(row.id, "businessName", e.target.value)
                      }
                      placeholder="Business name"
                      className="w-full"
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      value={row.contactFirstName}
                      onChange={(e) =>
                        updateRow(row.id, "contactFirstName", e.target.value)
                      }
                      placeholder="First name"
                      className="w-full"
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      value={row.contactLastName}
                      onChange={(e) =>
                        updateRow(row.id, "contactLastName", e.target.value)
                      }
                      placeholder="Last name"
                      className="w-full"
                    />
                  </div>
                  <div className="col-span-2 relative">
                    <Input
                      type="date"
                      value={row.startDate}
                      onChange={(e) =>
                        updateRow(row.id, "startDate", e.target.value)
                      }
                      className="w-full pr-10"
                      max={new Date().toISOString().split("T")[0]} // Prevent future dates
                      id={`date-${row.id}`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById(`date-${row.id}`) as HTMLInputElement;
                        input?.showPicker?.();
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-foreground/40 hover:text-foreground/60 p-1"
                      title="Open date picker"
                    >
                      <Calendar className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRow(row.id)}
                      disabled={rows.length === 1}
                      className="h-8 w-8"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Row Button */}
            <div className="pt-2">
              <Button
                variant="outline"
                onClick={addRow}
                className="w-full"
                disabled={isImporting}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Row
              </Button>
            </div>

            {/* Error/Success Messages */}
            {error && (
              <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 text-sm text-red-500">
                {error}
              </div>
            )}

            {successCount !== null && (
              <div className="p-3 rounded-md bg-green-500/10 border border-green-500/20 text-sm text-green-500">
                Successfully imported {successCount} client(s)!
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-foreground/10">
              <Button
                variant="outline"
                onClick={() => router.push("/dashboard")}
                disabled={isImporting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={isImporting}
                className="min-w-[120px]"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  `Import ${rows.filter((r) => r.businessName.trim() && r.startDate).length} Client(s)`
                )}
              </Button>
            </div>
          </div>
        </Card>

        {/* Info Box */}
        <Card className="mt-6 bg-linear-to-br from-background to-background/95 border-foreground/10 shadow-md">
          <div className="p-6">
            <h3 className="text-sm font-medium text-foreground mb-2">
              How it works
            </h3>
            <ul className="text-sm text-foreground/60 space-y-1 list-disc list-inside">
              <li>Start date determines when the cron job schedule begins</li>
              <li>Cron jobs follow the standard pattern: 25 days after start date, then 30 days after that (55 days total), then monthly</li>
              <li>All start dates must be in the past</li>
              <li>Only rows with business name and start date will be imported</li>
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}

