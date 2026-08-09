"use client";

import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { JobSearchFilters } from "@/types/job";

const AGE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any age" },
  { value: "24h", label: "Last 24 hours" },
  { value: "3d", label: "Last 3 days" },
  { value: "7d", label: "Last week" },
  { value: "14d", label: "Last 2 weeks" },
  { value: "30d", label: "Last month" },
];

const inputClassName = cn(
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900",
  "shadow-sm outline-none transition-colors placeholder:text-slate-400",
  "focus:border-blue-300 focus:ring-2 focus:ring-blue-100",
);

interface JobSearchBarProps {
  value: JobSearchFilters;
  onChange: (next: JobSearchFilters) => void;
}

export function JobSearchBar({ value, onChange }: JobSearchBarProps) {
  const hasActiveFilters =
    Boolean(value.company.trim()) ||
    Boolean(value.source.trim()) ||
    Boolean(value.maxAge);

  function update(partial: Partial<JobSearchFilters>) {
    onChange({ ...value, ...partial });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
        <Search className="size-4 text-slate-500" aria-hidden />
        Search jobs
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Company
          </span>
          <input
            type="search"
            value={value.company}
            onChange={(event) => update({ company: event.target.value })}
            placeholder="e.g. Google"
            className={inputClassName}
            autoComplete="off"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Source
          </span>
          <input
            type="search"
            value={value.source}
            onChange={(event) => update({ source: event.target.value })}
            placeholder="e.g. Greenhouse"
            className={inputClassName}
            autoComplete="off"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Age
          </span>
          <select
            value={value.maxAge}
            onChange={(event) => update({ maxAge: event.target.value })}
            className={cn(inputClassName, "appearance-none pr-8")}
            aria-label="Filter by posting age"
          >
            {AGE_OPTIONS.map((option) => (
              <option key={option.value || "any"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {hasActiveFilters ? (
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange({ company: "", source: "", maxAge: "" })
            }
            className="text-slate-500 hover:text-slate-800"
          >
            <X className="size-3.5" aria-hidden />
            Clear search
          </Button>
        </div>
      ) : null}
    </div>
  );
}
