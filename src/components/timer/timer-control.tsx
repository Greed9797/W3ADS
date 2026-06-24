"use client";

import { Pause, Play, Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  startTimerAction,
  stopTimerAction,
} from "@/app/(app)/dashboards/timer-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDuration } from "@/lib/timer/duration";

type ActiveSession = {
  id: string;
  /** ISO timestamp — server source of truth, survives reloads. */
  startedAt: string;
  /** Brand the running session belongs to (may differ from the selected one). */
  brandName: string;
};

type TimerControlProps = {
  /** Brand a NEW timer would be bound to (the currently-selected workspace). */
  brandName: string;
  activeSession: ActiveSession | null;
};

function useElapsedSeconds(startedAtIso: string | null): number {
  const [elapsed, setElapsed] = useState(() =>
    startedAtIso
      ? Math.max(
          0,
          Math.round((Date.now() - new Date(startedAtIso).getTime()) / 1000),
        )
      : 0,
  );
  const startedRef = useRef(startedAtIso);
  startedRef.current = startedAtIso;

  useEffect(() => {
    if (!startedAtIso) {
      setElapsed(0);
      return;
    }
    const startMs = new Date(startedAtIso).getTime();
    function tick() {
      // Pause updates while the tab is hidden; the next visible tick re-syncs
      // from startedAt, so the count is always correct on return.
      if (document.visibilityState === "visible") {
        setElapsed(Math.max(0, Math.round((Date.now() - startMs) / 1000)));
      }
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAtIso]);

  return elapsed;
}

export function TimerControl({ brandName, activeSession }: TimerControlProps) {
  const running = activeSession !== null;
  const elapsed = useElapsedSeconds(activeSession?.startedAt ?? null);
  const label = running ? activeSession.brandName : brandName;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-[var(--bg-surface)] text-[var(--w3-red)]">
            <Timer aria-hidden className="size-5" />
          </span>
          <div>
            <p className="text-caption text-[var(--text-tertiary)]">
              Passagem de conta — {label}
            </p>
            <p
              className="font-[var(--font-display)] text-2xl leading-none tracking-[-0.02em] text-[var(--metric-value)]"
              aria-live="polite"
            >
              {running ? formatDuration(elapsed) : "00:00:00"}
            </p>
          </div>
        </div>

        {running ? (
          <form
            action={stopTimerAction}
            className="flex flex-col gap-2 sm:items-end"
          >
            <input name="sessionId" type="hidden" value={activeSession.id} />
            <input
              name="note"
              type="text"
              maxLength={500}
              placeholder="O que foi feito nessa passagem? (opcional)"
              className="min-h-[44px] w-full rounded-md border border-[var(--border-strong)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] sm:w-80"
            />
            <Button type="submit" variant="destructive">
              <Pause aria-hidden className="size-4" />
              Parar
            </Button>
          </form>
        ) : (
          <form action={startTimerAction}>
            <Button type="submit">
              <Play aria-hidden className="size-4" />
              Iniciar timer
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
