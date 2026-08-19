import type { ReactNode } from "react";

import { AppNav } from "@/components/layout/app-nav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-blue-50/40">
      <AppNav />
      <div className="mx-auto w-full max-w-[900px] px-4 py-10 sm:px-6 sm:py-14">
        {children}
      </div>
    </div>
  );
}
