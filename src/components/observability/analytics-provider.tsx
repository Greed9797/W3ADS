"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { buildAnalyticsEvent, isPostHogEnabled } from "@/lib/observability/analytics";

export function AnalyticsProvider({
  userId,
  workspaceId,
}: {
  userId: string;
  workspaceId?: string;
}) {
  const pathname = usePathname();

  useEffect(() => {
    if (!isPostHogEnabled({ NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY })) {
      return;
    }

    const event = buildAnalyticsEvent({
      name: "dashboard_view",
      userId,
      workspaceId,
      properties: {
        path: pathname,
      },
    });

    window.dispatchEvent(new CustomEvent("adstartw3:analytics", { detail: event }));
  }, [pathname, userId, workspaceId]);

  return null;
}
