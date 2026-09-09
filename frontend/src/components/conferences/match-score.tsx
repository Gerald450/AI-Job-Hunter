"use client";

import { useState } from "react";

import { matchReasons } from "@/lib/conferences";
import { matchBadgeClass } from "@/lib/badges";
import { cn } from "@/lib/utils";
import type { Conference } from "@/types/conference";

export function MatchScore({
  conference,
  className,
}: {
  conference: Conference;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const score = typeof conference.match_score === "number" ? conference.match_score : 0;
  const reasons = matchReasons(conference);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        data-testid="match-score"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1",
          matchBadgeClass(score),
        )}
      >
        {score}% Match
      </button>
      {open ? (
        <div
          data-testid="match-breakdown"
          className="absolute left-0 z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
        >
          <p className="text-sm font-semibold text-slate-900">
            Why this matches you
          </p>
          {reasons.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              No match factors were returned for this conference.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
              {reasons.map((reason) => (
                <li key={`${reason.factor}-${reason.why}`}>
                  <span className="font-semibold tabular-nums">
                    {reason.points >= 0 ? "+" : ""}
                    {reason.points}
                  </span>{" "}
                  {reason.why || reason.factor}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
