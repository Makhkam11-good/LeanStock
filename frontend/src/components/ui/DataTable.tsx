import type { Pagination } from "../../types/api";
import { Button } from "./Button";
import { EmptyState, ErrorState, LoadingState } from "./States";

export interface Column<T> {
  header: string;
  cell: (item: T) => React.ReactNode;
  className?: string;
  width?: string;
}

export function DataTable<T>({
  data,
  columns,
  getKey,
  isLoading,
  error,
  emptyTitle,
  emptyDescription,
  pagination,
  onLoadMore,
  isFetchingMore,
}: {
  data?: T[];
  columns: Array<Column<T>>;
  getKey: (item: T) => string;
  isLoading?: boolean;
  error?: unknown;
  emptyTitle: string;
  emptyDescription: string;
  pagination?: Pagination;
  onLoadMore?: () => void;
  isFetchingMore?: boolean;
}) {
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;
  if (!data?.length) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  return (
    <div className="max-w-full overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full table-fixed divide-y divide-slate-200 text-sm">
        <colgroup>
          {columns.map((column) => {
            const isControlColumn = column.header === "Actions" || column.header === "Detail";
            const width = column.width ?? (isControlColumn ? "7rem" : undefined);
            return <col key={column.header} style={width ? { width } : undefined} />;
          })}
        </colgroup>
        <thead className="bg-slate-50">
          <tr>
            {columns.map((column) => {
              const isControlColumn = column.header === "Actions" || column.header === "Detail";
              return (
                <th
                  key={column.header}
                  className={`px-4 py-3 font-semibold text-slate-600 ${isControlColumn ? "whitespace-nowrap text-center" : "text-left"} ${column.className ?? ""}`}
                >
                  <span className={isControlColumn ? "block" : "block truncate"}>{column.header}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((item) => (
            <tr key={getKey(item)} className="hover:bg-slate-50">
              {columns.map((column) => {
                const isControlColumn = column.header === "Actions" || column.header === "Detail";
                return (
                  <td
                    key={column.header}
                    className={`${isControlColumn ? "px-3 text-center" : "px-4 text-left"} py-3 align-middle text-slate-700 ${column.className ?? ""}`}
                  >
                    <div className={isControlColumn ? "flex max-w-full justify-center overflow-visible" : "min-w-0 truncate"}>
                      {column.cell(item)}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {pagination?.has_more && onLoadMore ? (
        <div className="border-t border-slate-200 p-3 text-center">
          <Button variant="secondary" onClick={onLoadMore} disabled={isFetchingMore}>
            {isFetchingMore ? "Loading..." : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
