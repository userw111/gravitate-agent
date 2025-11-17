"use client";

import { useMemo, useState } from "react";
import type {
  ColumnDef,
  ColumnSizingState,
  RowData,
  SortingState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    filterVariant?: "text" | "range" | "select";
  }
}

type ClientStatus = "active" | "paused" | "inactive";

type ClientRow = {
  id: string;
  businessName: string;
  contactName: string;
  businessEmail: string;
  status: ClientStatus;
  lastCallDate: number | null;
  lastScriptDate: number | null;
  nextScriptDate: number | null;
};

type ClientsTableProps = {
  email: string;
  searchQuery: string;
  filter: "all" | "active" | "paused" | "inactive";
  sortByScriptDate: boolean;
};

const columns: ColumnDef<ClientRow>[] = [
  {
    header: "Business Name",
    accessorKey: "businessName",
    size: 200,
    minSize: 100,
    cell: ({ row }) => {
      const name = row.original.businessName || "Unknown Business";
      const contact = row.original.contactName;
      const initials = name
        .split(" ")
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("");

      return (
        <div className="flex items-center gap-3">
          <Avatar className="rounded-sm h-8 w-8">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0">
            <div className="font-medium truncate">
              {name}
            </div>
            {contact && (
              <div className="text-xs text-foreground/60 truncate">
                {contact}
              </div>
            )}
          </div>
        </div>
      );
    },
  },
  {
    header: "Status",
    accessorKey: "status",
    size: 100,
    minSize: 60,
    cell: ({ row }) => {
      const status = row.original.status;
      const styles =
        {
          active:
            "bg-green-600/10 text-green-600 dark:bg-green-400/10 dark:text-green-400",
          paused:
            "bg-amber-600/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400",
          inactive:
            "bg-foreground/10 text-foreground/70 dark:bg-foreground/10 dark:text-foreground/70",
        }[status] || "bg-foreground/10 text-foreground/70";

      return (
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
            styles
          )}
        >
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      );
    },
  },
  {
    header: "Days Until Next Script",
    accessorKey: "nextScriptDate",
    size: 180,
    minSize: 100,
    cell: ({ row }) => {
      const nextDate = row.original.nextScriptDate;
      if (!nextDate) return <span className="text-xs text-foreground/50">N/A</span>;

      const now = Date.now();
      const diffDays = Math.round((nextDate - now) / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        return (
          <span className="text-xs text-destructive font-medium">
            {Math.abs(diffDays)}d overdue
          </span>
        );
      }

      return (
        <span className="text-xs text-foreground/80 font-medium">
          {diffDays}d
        </span>
      );
    },
  },
  {
    header: "Last Script Date",
    accessorKey: "lastScriptDate",
    size: 140,
    minSize: 100,
    cell: ({ row }) => {
      const value = row.original.lastScriptDate;
      if (!value) return <span className="text-xs text-foreground/50">No scripts</span>;
      return (
        <span className="text-xs text-foreground/80">
          {new Date(value).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      );
    },
  },
  {
    header: "Last Call Date",
    accessorKey: "lastCallDate",
    size: 140,
    minSize: 100,
    cell: ({ row }) => {
      const value = row.original.lastCallDate;
      if (!value) return <span className="text-xs text-foreground/50">No calls</span>;
      return (
        <span className="text-xs text-foreground/80">
          {new Date(value).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      );
    },
  },
  {
    header: "Business Email",
    accessorKey: "businessEmail",
    size: 220,
    minSize: 120,
    cell: ({ row }) => {
      const email = row.original.businessEmail;
      if (!email) return <span className="text-xs text-foreground/50">N/A</span>;
      return (
        <span className="text-xs text-foreground/80 truncate">
          {email}
        </span>
      );
    },
  },
];

const ClientsTable = ({ email, searchQuery, filter, sortByScriptDate }: ClientsTableProps) => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const router = useRouter();

  const summaries = useQuery(api.clients.getClientsWithScheduleSummary, {
    ownerEmail: email,
  });

  const data: ClientRow[] = useMemo(() => {
    if (!summaries) return [];
    let mapped = summaries.map((client) => {
      const contactName =
        client.contactFirstName && client.contactLastName
          ? `${client.contactFirstName} ${client.contactLastName}`
          : client.contactFirstName ||
            client.contactLastName ||
            "";

      const businessEmail =
        client.businessEmail ||
        (Array.isArray(client.businessEmails) && client.businessEmails.length > 0
          ? client.businessEmails[0]
          : "");

      return {
        id: client._id,
        businessName: client.businessName || "Unknown Business",
        contactName,
        businessEmail,
        status: (client.status || "inactive") as ClientStatus,
        lastCallDate: client.lastCallDate ?? null,
        lastScriptDate: client.lastScriptDate ?? null,
        nextScriptDate: client.nextScriptDate ?? null,
      };
    });

    // Filter by status
    if (filter !== "all") {
      mapped = mapped.filter((client) => {
        if (filter === "active") {
          return client.status === "active";
        } else if (filter === "paused") {
          return client.status === "paused";
        } else if (filter === "inactive") {
          return client.status === "inactive";
        }
        return true;
      });
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      mapped = mapped.filter((client) => {
        const businessName = client.businessName?.toLowerCase() || "";
        const contactName = client.contactName?.toLowerCase() || "";
        const email = client.businessEmail?.toLowerCase() || "";
        const status = client.status?.toLowerCase() || "";
        const lastCallDate = client.lastCallDate ? new Date(client.lastCallDate).toLocaleDateString().toLowerCase() : "";
        const lastScriptDate = client.lastScriptDate ? new Date(client.lastScriptDate).toLocaleDateString().toLowerCase() : "";
        const nextScriptDate = client.nextScriptDate ? new Date(client.nextScriptDate).toLocaleDateString().toLowerCase() : "";
        
        return (
          businessName.includes(query) ||
          contactName.includes(query) ||
          email.includes(query) ||
          status.includes(query) ||
          lastCallDate.includes(query) ||
          lastScriptDate.includes(query) ||
          nextScriptDate.includes(query)
        );
      });
    }

    // Sort clients
    if (sortByScriptDate) {
      // Sort by script generation date (soonest at top)
      mapped = [...mapped].sort((a, b) => {
        const aDate = a.nextScriptDate ?? Infinity;
        const bDate = b.nextScriptDate ?? Infinity;
        return aDate - bDate;
      });
    } else if (filter === "all") {
      // When showing all clients, automatically put paused and inactive at the bottom
      mapped = [...mapped].sort((a, b) => {
        // Active clients come first
        if (a.status === "active" && b.status !== "active") return -1;
        if (b.status === "active" && a.status !== "active") return 1;
        
        // Paused and inactive come last (paused before inactive)
        if (a.status === "paused" && b.status === "inactive") return -1;
        if (a.status === "inactive" && b.status === "paused") return 1;
        
        // Within same status group, maintain original order
        return 0;
      });
    }
    
    return mapped;
  }, [summaries, filter, searchQuery, sortByScriptDate]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnSizing,
    },
    onColumnSizingChange: setColumnSizing,
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    defaultColumn: {
      minSize: 50,
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    enableSortingRemoval: false,
  });

  if (summaries === undefined) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-foreground/60 font-light">
          Loading clients…
        </p>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-foreground/60 font-light">
          No clients found.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="rounded-xl border bg-background">
        <Table className="table-fixed w-full">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-background">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="relative h-11 select-none text-[11px] font-medium text-foreground/60"
                    style={{ width: header.getSize(), minWidth: header.getSize(), maxWidth: header.getSize() }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                    {header.column.getCanResize() && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none bg-foreground/20 hover:bg-foreground/40 active:bg-foreground/60 transition-colors z-10"
                      />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer border-t border-foreground/5 hover:bg-muted/60"
                  onClick={() => {
                    const clientId = row.original.id;
                    router.push(`/dashboard/clients/${clientId}`);
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="text-xs align-middle"
                      style={{ width: cell.column.getSize(), minWidth: cell.column.getSize(), maxWidth: cell.column.getSize() }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-sm text-foreground/60"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default ClientsTable;


