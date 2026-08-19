"use client";

import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ConferenceSearchFilters } from "@/types/conference";

const inputClassName = cn(
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900",
  "shadow-sm outline-none transition-colors placeholder:text-slate-400",
  "focus:border-blue-300 focus:ring-2 focus:ring-blue-100",
);

const LOCATION_OPTIONS = [
  { value: "us", label: "U.S. in-person" },
  { value: "all", label: "All in-person" },
] as const;

const ELIGIBILITY_OPTIONS = [
  { value: "", label: "Any eligibility" },
  { value: "ELIGIBLE", label: "Eligible" },
  { value: "LIKELY_ELIGIBLE", label: "Likely Eligible" },
  { value: "NEEDS_VERIFICATION", label: "Needs Verification" },
] as const;

const FUNDING_OPTIONS = [
  { value: "available", label: "Funding Available" },
  { value: "eligible", label: "Funding Eligible" },
  { value: "needs_verification", label: "Funding Needs Verification" },
  { value: "travel", label: "Travel Grant" },
  { value: "scholarship", label: "Registration Scholarship" },
  { value: "waiver", label: "Registration Waiver" },
] as const;

const TOPIC_OPTIONS = [
  { value: "", label: "All topics" },
  { value: "computer_science", label: "Computer Science" },
  { value: "software_engineering", label: "Software Engineering" },
  { value: "ml", label: "AI/ML" },
  { value: "mathematics", label: "Mathematics" },
  { value: "research", label: "Research" },
  { value: "systems", label: "Systems" },
  { value: "security", label: "Security" },
] as const;

const DEADLINE_OPTIONS = [
  { value: "", label: "All" },
  { value: "closing_soon", label: "Due Soon" },
  { value: "this_month", label: "This Month" },
  { value: "next_3_months", label: "Next 3 Months" },
] as const;

const SOURCE_OPTIONS = [
  { value: "", label: "All sources" },
  { value: "acm", label: "ACM" },
  { value: "ieee", label: "IEEE" },
  { value: "usenix", label: "USENIX" },
  { value: "neurips", label: "NeurIPS" },
  { value: "icml", label: "ICML" },
  { value: "iclr", label: "ICLR" },
  { value: "aaai", label: "AAAI" },
  { value: "cvpr", label: "CVPR" },
  { value: "acl", label: "ACL" },
  { value: "community", label: "Community Sources" },
] as const;

interface ConferenceFiltersProps {
  value: ConferenceSearchFilters;
  onChange: (next: ConferenceSearchFilters) => void;
}

export const EMPTY_CONFERENCE_FILTERS: ConferenceSearchFilters = {
  search: "",
  location: "us",
  eligibility: "",
  funding: "available",
  topic: "",
  deadline: "",
  source: "",
};

export function ConferenceFilters({ value, onChange }: ConferenceFiltersProps) {
  const hasActiveFilters =
    Boolean(value.search.trim()) ||
    value.location !== "us" ||
    Boolean(value.eligibility) ||
    value.funding !== "available" ||
    Boolean(value.topic) ||
    Boolean(value.deadline) ||
    Boolean(value.source);

  function update(partial: Partial<ConferenceSearchFilters>) {
    onChange({ ...value, ...partial });
  }

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
      data-testid="conference-filters"
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
        <Search className="size-4 text-slate-500" aria-hidden />
        Search conferences
      </div>

      <label className="mb-3 flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Search
        </span>
        <input
          type="search"
          value={value.search}
          onChange={(event) => update({ search: event.target.value })}
          placeholder="Conference name, organization, or location"
          className={inputClassName}
          autoComplete="off"
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FilterSelect
          label="Location"
          value={value.location}
          options={LOCATION_OPTIONS}
          onChange={(next) =>
            update({ location: next as ConferenceSearchFilters["location"] })
          }
        />
        <FilterSelect
          label="Eligibility"
          value={value.eligibility}
          options={ELIGIBILITY_OPTIONS}
          onChange={(next) =>
            update({
              eligibility: next as ConferenceSearchFilters["eligibility"],
            })
          }
        />
        <FilterSelect
          label="Funding"
          value={value.funding}
          options={FUNDING_OPTIONS}
          onChange={(next) =>
            update({ funding: next as ConferenceSearchFilters["funding"] })
          }
        />
        <FilterSelect
          label="Topics"
          value={value.topic}
          options={TOPIC_OPTIONS}
          onChange={(next) => update({ topic: next })}
        />
        <FilterSelect
          label="Deadline"
          value={value.deadline}
          options={DEADLINE_OPTIONS}
          onChange={(next) =>
            update({ deadline: next as ConferenceSearchFilters["deadline"] })
          }
        />
        <FilterSelect
          label="Source"
          value={value.source}
          options={SOURCE_OPTIONS}
          onChange={(next) => update({ source: next })}
        />
      </div>

      {hasActiveFilters ? (
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(EMPTY_CONFERENCE_FILTERS)}
            className="text-slate-500 hover:text-slate-800"
          >
            <X className="size-3.5" aria-hidden />
            Clear filters
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(inputClassName, "appearance-none pr-8")}
        aria-label={`Filter by ${label.toLowerCase()}`}
      >
        {options.map((option) => (
          <option key={option.value || "any"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
