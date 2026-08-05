"use client";

import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ErrorStateProps {
  message?: string;
  onRetry: () => void;
}

export function ErrorState({
  message = "We couldn't load jobs from the server.",
  onRetry,
}: ErrorStateProps) {
  return (
    <Card className="rounded-xl border border-red-100 bg-white shadow-sm">
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertCircle className="size-5" aria-hidden />
        </div>
        <div className="space-y-1">
          <CardTitle className="text-lg text-slate-900">
            Something went wrong
          </CardTitle>
          <CardDescription className="text-slate-600">{message}</CardDescription>
        </div>
      </CardHeader>
      <CardFooter>
        <Button
          onClick={onRetry}
          className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto"
        >
          Retry
        </Button>
      </CardFooter>
    </Card>
  );
}
