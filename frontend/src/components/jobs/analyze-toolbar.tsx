"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

const PRESETS = [5, 10, 20, 50] as const;

interface AnalyzeToolbarProps {
  selectedCount: number;
  hasResume: boolean;
  analyzing: boolean;
  onAnalyzeSelected: () => void;
  onAnalyzeFirstN: (n: number) => void;
  onClearSelection: () => void;
  onSelectAllVisible: () => void;
}

export function AnalyzeToolbar({
  selectedCount,
  hasResume,
  analyzing,
  onAnalyzeSelected,
  onAnalyzeFirstN,
  onClearSelection,
  onSelectAllVisible,
}: AnalyzeToolbarProps) {
  const [customN, setCustomN] = useState("15");

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSelectAllVisible}
            disabled={analyzing}
          >
            Select page
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            disabled={analyzing || selectedCount === 0}
          >
            Clear ({selectedCount})
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!hasResume || analyzing || selectedCount === 0}
            onClick={onAnalyzeSelected}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            {analyzing ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : null}
            Analyze Selected
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Analyze first
          </span>
          {PRESETS.map((n) => (
            <Button
              key={n}
              type="button"
              variant="outline"
              size="sm"
              disabled={!hasResume || analyzing}
              onClick={() => onAnalyzeFirstN(n)}
            >
              {n}
            </Button>
          ))}
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              max={100}
              value={customN}
              onChange={(e) => setCustomN(e.target.value)}
              className="h-7 w-16 rounded-lg border border-slate-200 bg-white px-2 text-sm"
              aria-label="Custom first N"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!hasResume || analyzing}
              onClick={() => {
                const n = Number.parseInt(customN, 10);
                if (Number.isFinite(n) && n > 0) onAnalyzeFirstN(n);
              }}
            >
              Go
            </Button>
          </div>
        </div>
      </div>
      {!hasResume ? (
        <p className="mt-2 text-xs text-amber-700">
          Upload a resume above before running analysis.
        </p>
      ) : null}
    </div>
  );
}
