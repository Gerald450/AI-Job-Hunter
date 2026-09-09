import { Flame } from "lucide-react";

import {
  deadlineKindLabel,
  deadlineStatusText,
  formatDate,
  isDeadlineUrgent,
} from "@/lib/conferences";
import { cn } from "@/lib/utils";
import type { ConferenceDeadline } from "@/types/conference";

export function DeadlineList({
  deadlines,
  highlightNearest = true,
}: {
  deadlines: ConferenceDeadline[];
  highlightNearest?: boolean;
}) {
  if (deadlines.length === 0) return null;

  const nearestId = highlightNearest
    ? nearestFutureIndex(deadlines)
    : -1;

  return (
    <ul className="space-y-2" data-testid="deadline-list">
      {deadlines.map((deadline, index) => {
        const urgent = isDeadlineUrgent(deadline);
        const status = deadlineStatusText(deadline);
        return (
          <li
            key={`${deadline.kind}-${deadline.deadline_at ?? index}`}
            data-kind={deadline.kind}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm",
              index === nearestId
                ? "border-blue-200 bg-blue-50/70"
                : "border-slate-200 bg-white",
            )}
          >
            <p className="font-medium text-slate-800">
              {deadlineKindLabel(deadline.kind)}
            </p>
            <p className="mt-0.5 text-slate-600">
              {deadline.is_rolling
                ? "Rolling"
                : formatDate(deadline.deadline_at) || "Date unavailable"}
            </p>
            {status ? (
              <p
                className={cn(
                  "mt-1 inline-flex items-center gap-1 text-xs font-semibold",
                  urgent ? "text-rose-700" : "text-slate-500",
                )}
              >
                {urgent ? <Flame className="size-3.5" aria-hidden /> : null}
                {status}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function nearestFutureIndex(deadlines: ConferenceDeadline[]): number {
  let best = -1;
  let bestDays = Number.POSITIVE_INFINITY;
  deadlines.forEach((deadline, index) => {
    if (deadline.expired || deadline.is_rolling) return;
    const days = deadline.days_until_deadline;
    if (days == null || days < 0) return;
    if (days < bestDays) {
      bestDays = days;
      best = index;
    }
  });
  return best;
}
