import type { GeneratedTransaction } from "@casedrill/engine";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { FlagMenu } from "../components/FlagMenu";
import { longDate, money } from "../format";
import { useCase } from "./useCase";

export function TransactionsTab() {
  const { caseId, work, transactions, profile } = useCase();
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("");
  const [rail, setRail] = useState("");

  const railLabel = (id: string) => profile.rails.find((item) => item.id === id)?.label ?? id;
  const rails = useMemo(() => [...new Set(transactions.map((item) => item.rail))], [transactions]);

  const rows = useMemo(
    () => transactions.filter((item) => (!direction || item.direction === direction) && (!rail || item.rail === rail)),
    [transactions, direction, rail],
  );

  const columns = useMemo<ColumnDef<GeneratedTransaction>[]>(
    () => [
      { id: "date", header: "Date", accessorFn: (row) => `${row.date} ${row.time}`, cell: ({ row }) => longDate(row.original.date) },
      { id: "counterparty", header: "Counterparty", accessorKey: "counterpartyName" },
      { id: "direction", header: "In or out", accessorFn: (row) => (row.direction === "in" ? "In" : "Out") },
      { id: "method", header: "Method", accessorFn: (row) => profile.rails.find((item) => item.id === row.rail)?.label ?? row.rail },
      { id: "reference", header: "Reference", accessorKey: "reference" },
      {
        id: "amount",
        header: "Amount",
        accessorKey: "amount",
        cell: ({ row }) => money(row.original.amount, row.original.currency),
        meta: { numeric: true },
      },
      {
        id: "flag",
        header: "Flag",
        enableSorting: false,
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <FlagMenu
            caseId={caseId}
            marks={work.marks}
            target={{
              key: `transaction:${row.original.id}`,
              targetType: "transaction",
              targetRef: row.original.ruleId,
              label: `${row.original.counterpartyName}, ${longDate(row.original.date)}`,
            }}
          />
        ),
      },
    ],
    [caseId, work.marks, profile],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter: search },
    onSortingChange: setSorting,
    onGlobalFilterChange: setSearch,
    globalFilterFn: "includesString",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const visible = table.getRowModel().rows.map((row) => row.original);
  const sum = (kind: string) => visible.filter((item) => item.direction === kind).reduce((total, item) => total + item.amount, 0);
  const currency = transactions[0]?.currency ?? "GBP";

  return (
    <div>
      <div className="filters">
        <label className="stacked">
          Search
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <label className="stacked">
          In or out
          <select value={direction} onChange={(event) => setDirection(event.target.value)}>
            <option value="">All</option>
            <option value="in">In</option>
            <option value="out">Out</option>
          </select>
        </label>
        <label className="stacked">
          Method
          <select value={rail} onChange={(event) => setRail(event.target.value)}>
            <option value="">All</option>
            {rails.map((item) => (
              <option key={item} value={item}>
                {railLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <p className="totals" aria-live="polite">
          {visible.length} shown. In {money(sum("in"), currency)}. Out {money(sum("out"), currency)}.
        </p>
      </div>

      <div className="table-scroll tall" tabIndex={0} role="region" aria-label="Transactions">
        <table className="ledger">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const numeric = (header.column.columnDef.meta as { numeric?: boolean } | undefined)?.numeric;
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className={numeric ? "num" : undefined}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    >
                      {header.column.getCanSort() ? (
                        <button type="button" className="sort" onClick={header.column.getToggleSortingHandler()}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" ? " ▲" : sorted === "desc" ? " ▼" : ""}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const flagged = work.marks.some((mark) => mark.key === `transaction:${row.original.id}`);
              return (
                <tr key={row.id} className={flagged ? "flagged" : undefined}>
                  {row.getVisibleCells().map((cell) => {
                    const numeric = (cell.column.columnDef.meta as { numeric?: boolean } | undefined)?.numeric;
                    return (
                      <td key={cell.id} className={numeric ? "num" : undefined}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && <p className="empty">No transactions match these filters. Clear a filter to see more.</p>}
      </div>
    </div>
  );
}
