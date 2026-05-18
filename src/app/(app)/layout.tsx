import { Sidebar } from "@/components/layouts/sidebar";
import { Topbar } from "@/components/layouts/topbar";
import { OnboardingTour } from "@/components/onboarding/onboarding-tour";
import { AnalyticsProvider } from "@/components/observability/analytics-provider";
import { getCurrentUserContext } from "@/lib/auth/current";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await getCurrentUserContext();

  return (
    <main className="w3-app-shell min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <div className="grid min-h-screen lg:grid-cols-[240px_1fr]">
        <Sidebar context={context} />
        <section className="min-w-0">
          <Topbar context={context} />
          <div className="px-4 py-6 sm:px-6 lg:px-8">
            <OnboardingTour />
            {children}
          </div>
        </section>
      </div>
      <AnalyticsProvider userId={context.user.id} workspaceId={context.currentWorkspace.id} />
    </main>
  );
}
