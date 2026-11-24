import { ReachoutTracker } from "@/components/reachout/reachout-tracker";

export default function ReachoutPage() {
  return (
    <>
      <header className="mb-10 space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Reach Out
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
          LinkedIn contacts worth DMing about full-time roles, ranked by how
          much each message matters.
        </p>
      </header>
      <ReachoutTracker />
    </>
  );
}
