import type { ConferenceStats } from "@/types/conference";

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function ConferenceStatsBar({ stats }: { stats: ConferenceStats }) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      data-testid="conference-stats"
    >
      <StatCard
        label="Relevant conferences"
        value={stats.recommended}
        className="border-slate-200 bg-white text-slate-900"
        labelClass="text-slate-500"
      />
      <StatCard
        label="With student funding"
        value={stats.with_funding}
        className="border-amber-200 bg-amber-50/70 text-amber-800"
        labelClass="text-amber-700"
      />
      <StatCard
        label="Deadlines this month"
        value={stats.deadlines_this_month}
        className="border-rose-200 bg-rose-50/70 text-rose-800"
        labelClass="text-rose-700"
      />
      <StatCard
        label="Travel grants"
        value={stats.travel_grants}
        className="border-blue-200 bg-blue-50/70 text-blue-800"
        labelClass="text-blue-700"
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  className,
  labelClass,
}: {
  label: string;
  value: number;
  className: string;
  labelClass: string;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 shadow-sm ${className}`}>
      <p className={`text-xs font-medium uppercase tracking-wide ${labelClass}`}>
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {formatCount(value)}
      </p>
    </div>
  );
}
