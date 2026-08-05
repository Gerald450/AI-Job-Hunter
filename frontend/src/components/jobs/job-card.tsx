import { ExternalLink } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatPostedAge } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Job } from "@/types/job";

interface JobCardProps {
  job: Job;
}

export function JobCard({ job }: JobCardProps) {
  const applyUrl = job.apply_url;
  const canApply = Boolean(applyUrl);

  return (
    <Card className="rounded-xl border border-border/80 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
      <CardHeader className="gap-2 pb-3">
        <CardTitle className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          {job.company}
        </CardTitle>
        <p className="text-base font-medium text-slate-700 sm:text-lg">
          {job.role}
        </p>
      </CardHeader>

      <CardContent className="space-y-1.5 pb-4 text-sm text-slate-500">
        <p>
          <span className="font-medium text-slate-600">Source:</span>{" "}
          {job.ats_source}
        </p>
        <p>
          <span className="font-medium text-slate-600">Posted:</span>{" "}
          {formatPostedAge(job.age)}
        </p>
        {job.location ? (
          <p>
            <span className="font-medium text-slate-600">Location:</span>{" "}
            {job.location}
          </p>
        ) : null}
      </CardContent>

      <CardFooter className="pt-0">
        {canApply ? (
          <a
            href={applyUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ size: "lg" }),
              "w-full bg-blue-600 text-white hover:bg-blue-700 sm:ml-auto sm:w-auto",
            )}
          >
            Apply
            <ExternalLink className="size-4" aria-hidden />
          </a>
        ) : (
          <Button
            disabled
            size="lg"
            className="w-full sm:ml-auto sm:w-auto"
            variant="secondary"
          >
            Link unavailable
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
