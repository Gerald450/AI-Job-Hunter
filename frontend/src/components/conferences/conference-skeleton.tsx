import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

export function ConferenceListSkeleton() {
  return (
    <div
      className="flex flex-col gap-4"
      aria-busy="true"
      aria-live="polite"
      data-testid="conference-skeleton"
    >
      {Array.from({ length: 5 }).map((_, index) => (
        <Card
          key={index}
          className="rounded-xl border border-border/80 bg-white shadow-sm"
        >
          <CardHeader className="gap-3 pb-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-7 w-64 max-w-full" />
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-4 w-36" />
          </CardContent>
          <CardFooter>
            <Skeleton className="h-9 w-full sm:ml-auto sm:w-36" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
