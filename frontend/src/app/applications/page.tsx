import { ApplicationsTracker } from "@/components/applications/applications-tracker";

export default function ApplicationsPage() {
  return (
    <>
      <header className="mb-10 space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Applications
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
          Track job applications and conference funding or registration status
          in one place.
        </p>
      </header>
      <ApplicationsTracker />
    </>
  );
}
