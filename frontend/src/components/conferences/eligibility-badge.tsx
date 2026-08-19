import { eligibilityLabel } from "@/lib/conferences";
import { eligibilityBadgeClass } from "@/lib/badges";
import { cn } from "@/lib/utils";

export function EligibilityBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const resolved = status || "NEEDS_VERIFICATION";
  return (
    <span
      data-testid="eligibility-badge"
      data-status={resolved}
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1",
        eligibilityBadgeClass(resolved),
        className,
      )}
    >
      {eligibilityLabel(resolved)}
    </span>
  );
}
