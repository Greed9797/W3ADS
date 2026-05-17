import { CheckCircle2 } from "lucide-react";

import { FeedbackLink } from "@/components/feedback/feedback-link";
import { Button } from "@/components/ui/button";
import type { getCurrentUserContext } from "@/lib/auth/current";

type AppContext = Awaited<ReturnType<typeof getCurrentUserContext>>;

export function Topbar({ context }: { context: AppContext }) {
  return (
    <header className="sticky top-0 z-10 flex min-h-[72px] flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 py-4 sm:px-6 lg:px-8">
      <div className="min-w-0">
        <p className="text-caption text-[var(--text-tertiary)]">
          {context.currentWorkspace.name} / {context.currentMembership.role}
        </p>
        <h1 className="mt-1 truncate font-sans text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">
          Central de crescimento W3
        </h1>
      </div>
      <div className="flex flex-wrap gap-2">
        <FeedbackLink />
        <Button variant="secondary" className="gap-2">
          <CheckCircle2 aria-hidden className="size-4 text-[var(--success)]" />
          Sincronizado agora
        </Button>
      </div>
    </header>
  );
}
