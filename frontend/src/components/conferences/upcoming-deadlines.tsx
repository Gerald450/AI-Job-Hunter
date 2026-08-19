"use client";

import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import Link from "next/link";

import { fetchConferenceDeadlines } from "@/lib/api";
import {
  asArray,
  deadlineKindLabel,
  deadlineStatusText,
  isDeadlineUrgent,
} from "@/lib/conferences";
import { cn } from "@/lib/utils";
import type { ConferenceDeadline } from "@/types/conference";

export function UpcomingDeadlines() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["conference-deadlines"],
    queryFn: () => fetchConferenceDeadlines(25),
  });

  const items = asArray(data?.deadlines)
    .filter((item) => item.conference_id && !item.expired)
    .slice(0, 8);

  if (isLoading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Upcoming Deadlines</h2>
        <p className="mt-2 text-sm text-slate-500">Loading deadlines…</p>
      </section>
    );
  }

  if (isError || items.length === 0) {
    return null;
  }

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid="upcoming-deadlines"
    >
      <h2 className="text-sm font-semibold text-slate-800">Upcoming Deadlines</h2>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <DeadlineRow key={deadlineKey(item)} deadline={item} />
        ))}
      </ul>
    </section>
  );
}

function DeadlineRow({ deadline }: { deadline: ConferenceDeadline }) {
  const urgent = isDeadlineUrgent(deadline);
  return (
    <li>
      <Link
        href={`/conferences/${deadline.conference_id}`}
        className="flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800">
            {deadlineKindLabel(deadline.kind)}
          </p>
          <p className="truncate text-xs text-slate-500">
            {deadline.conference_name}
          </p>
        </div>
        <p
          className={cn(
            "inline-flex shrink-0 items-center gap-1 text-xs font-semibold",
            urgent ? "text-rose-700" : "text-slate-500",
          )}
        >
          {urgent ? <Flame className="size-3.5" aria-hidden /> : null}
          {deadlineStatusText(deadline)}
        </p>
      </Link>
    </li>
  );
}

function deadlineKey(deadline: ConferenceDeadline): string {
  return [
    deadline.conference_id,
    deadline.kind,
    deadline.deadline_at,
  ].join("-");
}
