import { Sidebar } from "@/components/layouts/sidebar";
import { Topbar } from "@/components/layouts/topbar";
import { getCurrentUserContext } from "@/lib/auth/current";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await getCurrentUserContext();

  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <div className="grid min-h-screen lg:grid-cols-[240px_1fr]">
        <Sidebar context={context} />
        <section className="min-w-0">
          <Topbar context={context} />
          <div className="px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </section>
      </div>
    </main>
  );
}
