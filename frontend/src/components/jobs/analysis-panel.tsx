"use client";

import { Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AnalysisResult } from "@/types/analysis";

interface AnalysisPanelProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  analysis: AnalysisResult | null;
  company?: string;
  role?: string;
  onClose: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-slate-600">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function matchTone(score: number): string {
  if (score >= 75) return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (score >= 50) return "bg-amber-50 text-amber-800 ring-amber-200";
  return "bg-rose-50 text-rose-800 ring-rose-200";
}

export function AnalysisPanel({
  open,
  loading,
  error,
  analysis,
  company,
  role,
  onClose,
  onRefresh,
  refreshing,
}: AnalysisPanelProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Resume analysis"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Resume Match
            </h3>
            {(company || role) && (
              <p className="mt-0.5 text-sm text-slate-500">
                {[company, role].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-4" aria-hidden />
            <span className="sr-only">Close</span>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-slate-600">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Analyzing resume against this job…
          </div>
        ) : error ? (
          <p className="mt-4 whitespace-pre-wrap text-sm text-red-600">{error}</p>
        ) : analysis ? (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ${matchTone(analysis.overall_match)}`}
              >
                Overall Resume Match: {analysis.overall_match}
              </span>
              <span className="text-xs text-slate-500">
                Confidence: {analysis.confidence}
                {analysis.cached ? " · Cached" : ""}
              </span>
            </div>

            {analysis.summary ? (
              <p className="text-sm leading-relaxed text-slate-700">
                {analysis.summary}
              </p>
            ) : null}

            <ListSection title="Strengths" items={analysis.strengths} />
            <ListSection title="Missing skills" items={analysis.missing_skills} />
            <ListSection
              title="Recommended improvements"
              items={analysis.recommended_improvements}
            />
            <ListSection
              title="Matched keywords"
              items={analysis.matched_keywords}
            />
            <ListSection
              title="Missing keywords"
              items={analysis.missing_keywords}
            />

            {onRefresh ? (
              <div className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={refreshing}
                  onClick={onRefresh}
                >
                  {refreshing ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : null}
                  Refresh analysis
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
