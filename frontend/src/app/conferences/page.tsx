import { ConferenceList } from "@/components/conferences/conference-list";

export default function ConferencesPage() {
  return (
    <>
      <header className="mb-10 space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Conferences for You
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
          U.S. in-person conferences with student funding, plus eligibility and
          deadlines from the backend.
        </p>
      </header>
      <ConferenceList />
    </>
  );
}
