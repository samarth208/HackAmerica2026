// Read DESIGN.md and CLAUDE.md before modifying.
import React, { useRef, useState, useMemo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUp, ArrowDown, ArrowUpDown, Download, FileSearch } from "lucide-react";

export interface ColumnDef<T> {
  key: keyof T | string;
  header: string;
  width?: number;
  sortable?: boolean;
  render?: (value: unknown, row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  onSelectionChange?: (selected: T[]) => void;
  loading?: boolean;
  emptyMessage?: string;
  pageSize?: number;
  className?: string;
  stickyHeader?: boolean;
}

interface SortState {
  key: string | null;
  dir: "asc" | "desc";
}

function SortIcon({ columnKey, sortState }: { columnKey: string; sortState: SortState }): React.ReactElement {
  if (sortState.key !== columnKey) {
    return <ArrowUpDown size={12} className="text-text-muted opacity-50" />;
  }
  if (sortState.dir === "asc") {
    return <ArrowUp size={12} className="text-accent" />;
  }
  return <ArrowDown size={12} className="text-accent" />;
}

function SkeletonBody(): React.ReactElement {
  return (
    <div className="px-3 py-3">
      <div className="h-5 bg-surface rounded animate-pulse w-full mb-2" />
      <div className="h-5 bg-surface rounded animate-pulse w-full mb-2" />
      <div className="h-5 bg-surface rounded animate-pulse w-full mb-2" />
      <div className="h-5 bg-surface rounded animate-pulse w-full mb-2" />
      <div className="h-5 bg-surface rounded animate-pulse w-full mb-2" />
    </div>
  );
}

function EmptyBody({ message }: { message?: string }): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <FileSearch size={40} className="text-text-muted" />
      <p className="font-label text-text-primary">{message ?? "No data found"}</p>
    </div>
  );
}

export default function DataTable<T extends object>({
  data,
  columns,
  rowKey,
  onRowClick,
  selectable,
  onSelectionChange,
  loading,
  emptyMessage,
  pageSize,
  className,
  stickyHeader,
}: DataTableProps<T>): React.ReactElement {
  const [sortState, setSortState] = useState<SortState>({ key: null, dir: "asc" });
  const [page, setPage] = useState<number>(0);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const effectivePageSize = pageSize ?? 25;

  const handleSort = useCallback((key: string) => {
    setSortState(prev => {
      if (prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return { key, dir: "asc" };
    });
    setPage(0);
  }, []);

  const sortedData = useMemo<T[]>(() => {
    if (!sortState.key) return data;
    const k = sortState.key;
    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[k];
      const bVal = (b as Record<string, unknown>)[k];
      const aStr = String(aVal ?? "");
      const bStr = String(bVal ?? "");
      const cmp = aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: "base" });
      return sortState.dir === "asc" ? cmp : -cmp;
    });
  }, [data, sortState]);

  const pagedData = useMemo<T[]>(
    () => sortedData.slice(page * effectivePageSize, (page + 1) * effectivePageSize),
    [sortedData, page, effectivePageSize]
  );

  // Selection helpers
  const pagedKeys = useMemo(() => pagedData.map(rowKey), [pagedData, rowKey]);
  const allPageSelected = pagedKeys.length > 0 && pagedKeys.every(k => selectedKeys.has(k));
  const somePageSelected = !allPageSelected && pagedKeys.some(k => selectedKeys.has(k));

  const toggleSelectAll = useCallback(() => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (allPageSelected) {
        pagedKeys.forEach(k => next.delete(k));
      } else {
        pagedKeys.forEach(k => next.add(k));
      }
      return next;
    });
  }, [allPageSelected, pagedKeys]);

  const toggleSelect = useCallback((key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Fire onSelectionChange whenever selectedKeys changes
  const prevSelectedKeysRef = useRef<Set<string>>(selectedKeys);
  if (prevSelectedKeysRef.current !== selectedKeys) {
    prevSelectedKeysRef.current = selectedKeys;
    if (onSelectionChange) {
      const selected = data.filter(row => selectedKeys.has(rowKey(row)));
      onSelectionChange(selected);
    }
  }

  // CSV export
  function exportCsv(): void {
    const headers = columns.map(c => c.header).join(",");
    const rows = data
      .map(row =>
        columns
          .map(c => {
            const val = (row as Record<string, unknown>)[c.key as string];
            return `"${String(val ?? "").replace(/"/g, '""')}"`;
          })
          .join(",")
      )
      .join("\n");
    const blob = new Blob([headers + "\n" + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Virtualizer
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: pagedData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 5,
  });

  const showingStart = Math.min(page * effectivePageSize + 1, sortedData.length);
  const showingEnd = Math.min((page + 1) * effectivePageSize, sortedData.length);

  return (
    <div className={`bg-surface border border-border rounded-lg overflow-hidden ${className ?? ""}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-end px-3 py-2 border-b border-border">
        <button
          onClick={exportCsv}
          className="flex items-center gap-1 text-text-muted hover:text-text-primary transition-colors font-label text-xs"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Table */}
      <div>
        {/* Sticky header row */}
        <div
          className={`flex bg-bg border-b border-border ${stickyHeader !== false ? "sticky top-0 z-10" : ""}`}
        >
          {selectable && (
            <div className="px-3 py-3 w-10 shrink-0">
              <input
                type="checkbox"
                checked={allPageSelected}
                ref={el => {
                  if (el) el.indeterminate = somePageSelected;
                }}
                onChange={toggleSelectAll}
                className="accent-accent cursor-pointer"
              />
            </div>
          )}
          {columns.map(col => (
            <div
              key={String(col.key)}
              className={`font-label text-xs text-text-muted uppercase tracking-wide px-3 py-3 text-left select-none flex items-center gap-1 ${col.sortable ? "cursor-pointer hover:text-text-primary transition-colors" : ""}`}
              style={col.width ? { width: col.width, flexShrink: 0 } : { flex: 1 }}
              onClick={col.sortable ? () => handleSort(String(col.key)) : undefined}
            >
              {col.header}
              {col.sortable && <SortIcon columnKey={String(col.key)} sortState={sortState} />}
            </div>
          ))}
        </div>

        {/* Body */}
        {loading ? (
          <SkeletonBody />
        ) : pagedData.length === 0 ? (
          <EmptyBody {...(emptyMessage !== undefined ? { message: emptyMessage } : {})} />
        ) : (
          <div
            ref={parentRef}
            style={{ maxHeight: "calc(100vh - 200px)", overflow: "auto" }}
          >
            <div style={{ height: rowVirtualizer.getTotalSize() + "px", position: "relative" }}>
              {rowVirtualizer.getVirtualItems().map(virtualRow => {
                const row = pagedData[virtualRow.index];
                if (!row) return null;
                const key = rowKey(row);
                const isSelected = selectedKeys.has(key);
                return (
                  <div
                    key={key}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className={`flex border-b border-border/50 transition-colors ${onRowClick ? "cursor-pointer hover:bg-surface/80" : ""} ${isSelected ? "bg-accent/5 border-l-2 border-accent" : ""}`}
                    onClick={() => onRowClick?.(row)}
                  >
                    {selectable && (
                      <div className="px-3 py-2.5 w-10 shrink-0 flex items-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => {
                            e.stopPropagation();
                            toggleSelect(key);
                          }}
                          className="accent-accent cursor-pointer"
                        />
                      </div>
                    )}
                    {columns.map(col => (
                      <div
                        key={String(col.key)}
                        className="font-ui text-sm text-text-primary px-3 py-2.5"
                        style={col.width ? { width: col.width, flexShrink: 0 } : { flex: 1 }}
                      >
                        {col.render
                          ? col.render(
                              (row as Record<string, unknown>)[col.key as string],
                              row
                            )
                          : String(
                              (row as Record<string, unknown>)[col.key as string] ?? ""
                            )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Pagination footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border">
        <span className="font-ui text-xs text-text-muted">
          {sortedData.length === 0
            ? "No results"
            : `Showing ${showingStart}–${showingEnd} of ${sortedData.length}`}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="font-label text-xs text-text-muted hover:text-text-primary disabled:opacity-40 px-2 py-1 rounded border border-border transition-colors"
          >
            Prev
          </button>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={(page + 1) * effectivePageSize >= sortedData.length}
            className="font-label text-xs text-text-muted hover:text-text-primary disabled:opacity-40 px-2 py-1 rounded border border-border transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
