import Link from "next/link";

import { W3Logo } from "@/components/brand/w3-logo";
import { Button } from "@/components/ui/button";
import { docHref, listDocs } from "@/lib/docs/loader";

export const metadata = {
  title: "FAQ & Documentação — W3ADS",
  description:
    "Guia completo de configuração e conexão dos conectores W3ADS (Meta, Google Ads, GA4, Shopify, Nuvemshop e mais).",
};

export default async function FaqLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const groups = await listDocs();

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 backdrop-blur">
        <div className="mx-auto flex h-[64px] max-w-6xl items-center justify-between px-5">
          <Link href="/faq" aria-label="Início do FAQ">
            <W3Logo />
          </Link>
          <Button asChild size="sm" variant="secondary">
            <Link href="/login">Acessar o app</Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-8 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-[88px] space-y-6">
            <Link
              className="block text-caption text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              href="/faq"
            >
              ← Início do FAQ
            </Link>
            {groups.map((group) => (
              <div key={group.category}>
                <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                  {group.label}
                </p>
                <ul className="space-y-1">
                  {group.docs.map((doc) => (
                    <li key={doc.slug.join("/") || "root"}>
                      <Link
                        className="block rounded px-2 py-1 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                        href={docHref(doc.slug)}
                      >
                        {doc.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
