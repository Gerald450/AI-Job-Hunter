"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

import type { BatchJobResult, BatchProgress, BatchSort } from "@/types/analysis";
import { cn } from "@/lib/utils";

interface BatchResultsProps {
  progress: BatchProgress | null;
  results: BatchJobResult[];
  sort: BatchSort;
  onSortChange: (sort: BatchSort) => void;
  analyzing: boolean;
}

function sortedResults(results: BatchJobResult[], sort: BatchSort): BatchJobResult[] {
  const copy = [...results];
  if (sort === "match") {
    copy.sort((a, b) => (b.overall_match ?? -1) - (a.overall_match ?? -1));
  } else if (sort === "company") {
    copy.sort((a, b) => a.company.localeCompare(b.company));
  }
  // "newest" keeps insertion / job list order
  return copy;
}

function statusClass(status: BatchJobResult["status"]): string {
  if (status === "completed") return "text-emerald-700";
  if (status === "failed") return "text-rose-700";
  return "text-slate-500";
}

export function BatchResults({
  progress,
  results,
  sort,
  onSortChange,
  analyzing,
}: BatchResultsProps) {
  const [expanded, setExpanded] = useState(true);

  // Re-open when a new batch run starts so progress stays visible.
  useEffect(() => {
    if (analyzing) setExpanded(true);
  }, [analyzing]);

  if (!progress && results.length === 0) return null;

  const rows = sortedResults(results, sort);
  const completedCount = progress?.completed ?? results.filter((r) => r.status === "completed").length;
  const failedCount = progress?.failed ?? results.filter((r) => r.status === "failed").length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-2 rounded-lg text-left outline-none ring-offset-2 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-300"
          aria-expanded={expanded}
          aria-controls="batch-analysis-panel"
        >
          <ChevronDown
            className={cn(
              "mt-0.5 size-4 shrink-0 text-slate-500 transition-transform duration-200",
              !expanded && "-rotate-90",
            )}
            aria-hidden
          />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">
              Batch analysis
              {!expanded ? (
                <span className="ml-2 font-normal text-slate-500">
                  ({completedCount} ok
                  {failedCount ? `, ${failedCount} failed` : ""}
                  {analyzing ? ", running…" : ""})
                </span>
              ) : null}
            </h3>
            {expanded && progress ? (
              <p className="mt-0.5 text-sm text-slate-500">
                {analyzing
                  ? progress.message
                  : `Done — ${progress.completed} completed, ${progress.failed} failed`}
              </p>
            ) : null}
          </div>
        </button>

        {expanded ? (
          <label className="flex items-center gap-2 text-sm text-slate-600 sm:pl-6">
            Sort
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value as BatchSort)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
            >
              <option value="match">Highest match</option>
              <option value="newest">Newest / list order</option>
              <option value="company">Company</option>
            </select>
          </label>
        ) : null}
      </div>

      {expanded ? (
        <div id="batch-analysis-panel" className="border-t border-slate-100 px-4 pb-4 pt-3">
          {progress ? (
            <div className="grid grid-cols-3 gap-2 text-center text-xs sm:text-sm">
              <div className="rounded-lg bg-emerald-50 px-2 py-2 text-emerald-800">
                Completed {progress.completed}
              </div>
              <div className="rounded-lg bg-rose-50 px-2 py-2 text-rose-800">
                Failed {progress.failed}
              </div>
              <div className="rounded-lg bg-slate-100 px-2 py-2 text-slate-700">
                Remaining {progress.remaining}
              </div>
            </div>
          ) : null}

          <div className={cn("overflow-x-auto", progress && "mt-4")}>
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Company</th>
                  <th className="py-2 pr-3 font-medium">Role</th>
                  <th className="py-2 pr-3 font-medium">Match</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 font-medium">Summary</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.jobId} className="border-b border-slate-100 align-top">
                    <td className="py-2.5 pr-3 font-medium text-slate-900">
                      {row.company}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-700">{row.role}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-slate-800">
                      {row.overall_match != null ? row.overall_match : "—"}
                    </td>
                    <td className={cn("py-2.5 pr-3 capitalize", statusClass(row.status))}>
                      {row.status}
                    </td>
                    <td className="py-2.5 text-slate-600">
                      {row.error ? (
                        <span className="whitespace-pre-wrap text-rose-600">
                          {row.error}
                        </span>
                      ) : (
                        row.summary || "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
