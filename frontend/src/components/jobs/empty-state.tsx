import type { ReactNode } from "react";
import { BriefcaseBusiness } from "lucide-react";

interface EmptyStateProps {
  message?: string;
  children?: ReactNode;
}

export function EmptyState({
  message = "No sponsoring new grad jobs available right now.",
  children,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-20 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
        <BriefcaseBusiness className="size-7 text-slate-400" aria-hidden />
      </div>
      <p className="max-w-sm text-base font-medium text-slate-600">{message}</p>
      {children ? <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}
