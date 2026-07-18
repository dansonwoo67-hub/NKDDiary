import type { ReactNode } from "react";
import { PersonalCenterNav } from "@/features/personal-center/components/PersonalCenterNav";

export default function MeLayout({ children }: { children: ReactNode }) {
  return (
    <section className="hand-card rounded-[2rem] p-4 sm:p-6">
      <div className="flex gap-8">
        <PersonalCenterNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </section>
  );
}
