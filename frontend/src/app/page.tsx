import { JobList } from "@/components/jobs/job-list";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-blue-50/40">
      <div className="mx-auto w-full max-w-[900px] px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-10 space-y-3">
          <p className="text-sm font-semibold tracking-wide text-blue-600">
            AI Job Hunter
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            New Grad Sponsoring Jobs
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Latest entry-level software engineering jobs that sponsor work visas.
          </p>
        </header>

        <JobList />
      </div>
    </main>
  );
}
