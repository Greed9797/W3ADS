import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SidebarClient } from "@/components/layouts/sidebar-client";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

describe("SidebarClient", () => {
  it("collapses the sidebar and persists the preference", () => {
    localStorage.clear();

    const { container } = render(
      <SidebarClient
        currentRoleLabel="Owner"
        currentWorkspace={{ id: "workspace-1", name: "W3 Dev" }}
        logoutAction={async () => {}}
        navItems={[
          {
            href: "/dashboard",
            icon: "dashboard",
            label: "Dashboard",
            section: "overview",
          },
        ]}
        userEmail="owner@w3.dev"
        userImage={null}
        userName="W3 Owner"
      />,
    );

    // Scope to the desktop sidebar — collapse is desktop-only; the mobile drawer
    // always renders the label and would otherwise duplicate matches.
    const desktop = within(
      container.querySelector("[data-sidebar-collapsed]") as HTMLElement,
    );

    expect(desktop.getByText("Dashboard")).toBeInTheDocument();

    fireEvent.click(
      desktop.getByRole("button", { name: /recolher sidebar/i }),
    );

    expect(localStorage.getItem("w3ads.sidebar.collapsed")).toBe("1");
    expect(desktop.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(
      desktop.getByRole("link", { name: "Dashboard" }),
    ).toBeInTheDocument();
  });
});
