"use client";

import { useMemo, useState } from "react";
import type {
  ColumnDef,
  ColumnFiltersState,
  ColumnSizingState,
  RowData,
  SortingState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Row } from "@tanstack/react-table";

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

const ClientsTable = ({ email }: ClientsTableProps) => {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([
    {
      id: "nextScriptDate",
      desc: false,
    },
  ]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const router = useRouter();

  const summaries = useQuery(api.clients.getClientsWithScheduleSummary, {
    ownerEmail: email,
  });

  const data: ClientRow[] = useMemo(() => {
    if (!summaries) return [];
    return summaries.map((client) => {
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
  }, [summaries]);

  // Custom global filter function that searches across all fields
  const globalFilterFn = (row: Row<ClientRow>, columnId: string, filterValue: string) => {
    const searchValue = filterValue.toLowerCase().trim();
    if (!searchValue) return true;

    const client = row.original;
    const searchableFields = [
      client.businessName,
      client.contactName,
      client.businessEmail,
      client.status,
      client.lastCallDate ? new Date(client.lastCallDate).toLocaleDateString() : "",
      client.lastScriptDate ? new Date(client.lastScriptDate).toLocaleDateString() : "",
      client.nextScriptDate ? new Date(client.nextScriptDate).toLocaleDateString() : "",
    ];

    return searchableFields.some((field) =>
      field?.toLowerCase().includes(searchValue)
    );
  };

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
      columnSizing,
    },
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: globalFilterFn,
    onColumnSizingChange: setColumnSizing,
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    defaultColumn: {
      minSize: 50,
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
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

  if (!summaries.length) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-foreground/60 font-light">
          No clients found. Sync responses from your Typeform to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="rounded-xl border bg-background">
        <div className="px-6 py-4 border-b bg-muted/30">
          <div className="relative max-w-md">
            <Input
              value={globalFilter ?? ""}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Search clients by name, email, status, or date..."
              type="text"
              className="pl-9"
            />
            <div className="text-muted-foreground/80 pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center pl-3">
              <SearchIcon size={16} />
            </div>
          </div>
        </div>
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


