export function eligibilityBadgeClass(status: string | null | undefined): string {
  switch (status) {
    case "ELIGIBLE":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "LIKELY_ELIGIBLE":
      return "bg-blue-50 text-blue-800 ring-blue-200";
    case "NEEDS_VERIFICATION":
      return "bg-amber-50 text-amber-800 ring-amber-200";
    case "NOT_ELIGIBLE":
      return "bg-rose-50 text-rose-800 ring-rose-200";
    default:
      return "bg-slate-50 text-slate-700 ring-slate-200";
  }
}

export function matchBadgeClass(score: number): string {
  if (score >= 75) return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (score >= 50) return "bg-amber-50 text-amber-800 ring-amber-200";
  return "bg-rose-50 text-rose-800 ring-rose-200";
}
