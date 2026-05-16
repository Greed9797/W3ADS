"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const storageKey = "adstart_w3_onboarding_done";

export function OnboardingTour() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(window.localStorage.getItem(storageKey) !== "true");
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className="mb-6 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-caption text-[var(--text-tertiary)]">Primeiros passos</p>
          <ol className="mt-3 flex flex-col gap-2 text-sm text-[var(--text-secondary)] md:flex-row md:flex-wrap">
            <li>
              <span className="font-semibold text-[var(--text-primary)]">1.</span> Conectar uma fonte de dados
            </li>
            <li>
              <span className="font-semibold text-[var(--text-primary)]">2.</span> Conferir o dashboard geral
            </li>
            <li>
              <span className="font-semibold text-[var(--text-primary)]">3.</span> Convidar um membro do workspace
            </li>
          </ol>
        </div>
        <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href="/connectors">Conectar conta</Link>
        </Button>
        <Button
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => {
            window.localStorage.setItem(storageKey, "true");
            setVisible(false);
          }}
        >
          Fechar
        </Button>
        </div>
      </div>
    </div>
  );
}
