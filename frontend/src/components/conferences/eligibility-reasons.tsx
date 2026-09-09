import { Check, CircleHelp, X } from "lucide-react";

import type { EligibilityReason } from "@/lib/conferences";
import { cn } from "@/lib/utils";

export function EligibilityReasons({
  reasons,
}: {
  reasons: EligibilityReason[];
}) {
  if (reasons.length === 0) return null;

  return (
    <ul className="space-y-1 text-sm" data-testid="eligibility-reasons">
      {reasons.map((reason) => (
        <li
          key={`${reason.tone}-${reason.label}`}
          className={cn(
            "flex items-start gap-1.5",
            reason.tone === "pass" && "text-emerald-800",
            reason.tone === "unresolved" && "text-amber-800",
            reason.tone === "fail" && "text-rose-800",
          )}
        >
          {reason.tone === "pass" ? (
            <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          ) : reason.tone === "fail" ? (
            <X className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          ) : (
            <CircleHelp className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          )}
          <span>{reason.label}</span>
        </li>
      ))}
    </ul>
  );
}
