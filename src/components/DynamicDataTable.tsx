"use client";

import * as React from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface DynamicDataTableProps {
  data: unknown[];
  maxRows?: number;
  previewRows?: number;
  showPreview?: boolean;
}

// Separate component for rendering a table - this allows proper hook usage
function DataTableContent({
  tableData,
  columns,
  totalRows,
  rowsToShow,
  showViewAllButton,
  onViewAll,
}: {
  tableData: Record<string, unknown>[];
  columns: ColumnDef<Record<string, unknown>>[];
  totalRows: number;
  rowsToShow: number;
  showViewAllButton?: boolean;
  onViewAll?: () => void;
}) {
  const tableInstance = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="w-full max-w-full rounded-md border overflow-hidden">
      <div className="w-full max-w-full overflow-x-auto">
        <Table className="min-w-full">
          <TableHeader>
            {tableInstance.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="text-xs">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {tableInstance.getRowModel().rows.length ? (
              tableInstance.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="text-xs">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {totalRows > rowsToShow && (
        <div className="text-xs text-muted-foreground px-4 py-2 border-t bg-muted/50 flex items-center justify-between">
          <span>Showing {rowsToShow} of {totalRows} rows</span>
          {showViewAllButton && onViewAll && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onViewAll();
              }}
              className="h-6 text-xs"
            >
              View All
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function DynamicDataTable({ 
  data, 
  maxRows = 50,
  previewRows = 3,
  showPreview = false,
}: DynamicDataTableProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  // Infer columns from the first item
  const firstItem = data[0];
  if (typeof firstItem !== "object" || firstItem === null) {
    return null;
  }

  // Get all unique keys from all items - memoized
  const allKeys = React.useMemo(() => {
    const keys = new Set<string>();
    data.forEach((item) => {
      if (typeof item === "object" && item !== null) {
        Object.keys(item).forEach((key) => keys.add(key));
      }
    });
    return Array.from(keys);
  }, [data]);

  const columns = React.useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      allKeys.map((key) => ({
        id: key,
        accessorKey: key,
        header: () => (
          <span className="font-semibold">
            {key
              .replace(/([A-Z])/g, " $1")
              .replace(/^./, (str) => str.toUpperCase())
              .trim()}
          </span>
        ),
        cell: ({ getValue }) => {
          const value = getValue();
          return <CellValue value={value} />;
        },
        minSize: 100,
        size: 150,
      })),
    [allKeys]
  );

  // Memoize data slices to prevent unnecessary re-renders
  const previewData = React.useMemo(
    () => data.slice(0, previewRows) as Record<string, unknown>[],
    [data, previewRows]
  );

  const fullData = React.useMemo(
    () => data.slice(0, maxRows) as Record<string, unknown>[],
    [data, maxRows]
  );

  if (showPreview) {
    return (
      <>
        <div 
          className="mt-3 w-full cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => setIsExpanded(true)}
        >
          <DataTableContent
            tableData={previewData}
            columns={columns}
            totalRows={data.length}
            rowsToShow={previewRows}
            showViewAllButton={true}
            onViewAll={() => setIsExpanded(true)}
          />
        </div>
        {isExpanded && (
          <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
            <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col p-0">
              <DialogHeader className="px-6 pt-6 pb-4 border-b flex flex-row items-center justify-between">
                <DialogTitle>Full Data ({data.length} rows)</DialogTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsExpanded(false)}
                  className="h-6 w-6"
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogHeader>
              <div className="flex-1 overflow-auto p-6">
                <DataTableContent
                  tableData={fullData}
                  columns={columns}
                  totalRows={data.length}
                  rowsToShow={Math.min(maxRows, data.length)}
                />
              </div>
            </DialogContent>
          </Dialog>
        )}
      </>
    );
  }

  const tableData = React.useMemo(
    () => data.slice(0, maxRows) as Record<string, unknown>[],
    [data, maxRows]
  );

  return (
    <div className="mt-3 w-full">
      <DataTableContent
        tableData={tableData}
        columns={columns}
        totalRows={data.length}
        rowsToShow={Math.min(maxRows, data.length)}
      />
    </div>
  );
}

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }

  if (typeof value === "boolean") {
    return (
      <span className="inline-flex items-center">
        {value ? (
          <span className="text-emerald-600 dark:text-emerald-400">✓</span>
        ) : (
          <span className="text-muted-foreground">✗</span>
        )}
      </span>
    );
  }

  if (typeof value === "object") {
    if (Array.isArray(value)) {
      return (
        <span className="text-muted-foreground">
          [{value.length} {value.length === 1 ? "item" : "items"}]
        </span>
      );
    }
    return (
      <span className="font-mono text-[10px] wrap-break-word">
        {JSON.stringify(value)}
      </span>
    );
  }

  if (typeof value === "string" && value.length > 100) {
    return (
      <span className="wrap-break-word" title={value}>
        {value.slice(0, 100)}...
      </span>
    );
  }

  return <span className="wrap-break-word">{String(value)}</span>;
}
