import { JobList } from "@/components/jobs/job-list";

export default function HomePage() {
  return (
    <>
      <header className="mb-10 space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          New Grad Sponsoring Jobs
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
          Latest entry-level software engineering jobs that sponsor work visas.
        </p>
      </header>

      <JobList />
    </>
  );
}
