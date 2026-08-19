import { Banknote, ExternalLink } from "lucide-react";

import { EligibilityBadge } from "@/components/conferences/eligibility-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  formatDate,
  fundingKindLabel,
} from "@/lib/conferences";
import { cn } from "@/lib/utils";
import type { ConferenceFunding } from "@/types/conference";

export function FundingBlock({
  grants,
}: {
  grants: ConferenceFunding[];
}) {
  if (grants.length === 0) return null;

  return (
    <div className="space-y-3" data-testid="funding-block">
      {grants.map((grant, index) => (
        <FundingCard key={`${grant.name}-${grant.kind}-${index}`} grant={grant} />
      ))}
    </div>
  );
}

export function FundingCard({ grant }: { grant: ConferenceFunding }) {
  const applyUrl = grant.application_url || grant.source_url;

  return (
    <div
      data-testid="funding-card"
      data-kind={grant.kind}
      className="rounded-xl border border-amber-200 bg-amber-50/60 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-900">
            <Banknote className="size-4" aria-hidden />
            {grant.name || fundingKindLabel(grant.kind)}
          </p>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-amber-800">
            {fundingKindLabel(grant.kind)}
          </p>
        </div>
        <EligibilityBadge status={grant.eligibility_status} />
      </div>

      {grant.amount ? (
        <p className="mt-2 text-lg font-semibold text-slate-900">{grant.amount}</p>
      ) : null}

      {grant.deadline ? (
        <p className="mt-2 text-sm text-slate-600">
          <span className="font-medium text-slate-700">Application deadline:</span>{" "}
          {formatDate(grant.deadline)}
        </p>
      ) : null}

      <div className="mt-2 space-y-1 text-sm text-slate-600">
        {grant.undergraduate_eligible === true ? (
          <p>Undergraduate eligible</p>
        ) : null}
        {grant.paper_required === true ? (
          <p>Accepted paper required</p>
        ) : null}
        {grant.requirements_text ? <p>{grant.requirements_text}</p> : null}
      </div>

      {applyUrl ? (
        <a
          href={applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ size: "sm" }),
            "mt-3 bg-blue-600 text-white hover:bg-blue-700",
          )}
        >
          Apply for Funding
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      ) : null}
    </div>
  );
}
