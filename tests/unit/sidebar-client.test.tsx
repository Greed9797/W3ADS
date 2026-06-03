import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SidebarClient } from "@/components/layouts/sidebar-client";

describe("SidebarClient", () => {
  it("collapses the sidebar and persists the preference", () => {
    localStorage.clear();

    render(
      <SidebarClient
        currentRoleLabel="Owner"
        currentWorkspace={{ id: "workspace-1", name: "W3 Dev" }}
        isClientRole={false}
        logoutAction={async () => {}}
        navItems={[
          { href: "/dashboard", icon: "dashboard", label: "Dashboard" },
        ]}
        switchWorkspaceAction={async () => {}}
        workspaces={[
          {
            id: "workspace-1",
            label: "W3 Dev · Owner",
            name: "W3 Dev",
          },
        ]}
      />,
    );

    expect(screen.getByText("Dashboard")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /recolher sidebar/i }),
    );

    expect(localStorage.getItem("w3ads.sidebar.collapsed")).toBe("1");
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Dashboard" }),
    ).toBeInTheDocument();
  });
});
