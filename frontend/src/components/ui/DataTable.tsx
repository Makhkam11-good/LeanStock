import type { Pagination } from "../../types/api";
import { Button } from "./Button";
import { EmptyState, ErrorState, LoadingState } from "./States";

export interface Column<T> {
  header: string;
  cell: (item: T) => React.ReactNode;
  className?: string;
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
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.header}
                  className={`px-4 py-3 text-left font-semibold text-slate-600 ${column.className ?? ""}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((item) => (
              <tr key={getKey(item)} className="hover:bg-slate-50">
                {columns.map((column) => (
                  <td key={column.header} className={`px-4 py-3 align-middle text-slate-700 ${column.className ?? ""}`}>
                    {column.cell(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
