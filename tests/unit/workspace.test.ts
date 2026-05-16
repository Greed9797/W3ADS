import { describe, expect, it } from "vitest";

import { assertCanManageMembers, canManageMembers } from "@/lib/auth/permissions";
import { createWorkspaceSlug } from "@/lib/auth/workspace";

describe("workspace helpers", () => {
  it("creates a stable ascii slug from a workspace name", () => {
    expect(createWorkspaceSlug("  Agência W3 Educação & Performance  ")).toBe(
      "agencia-w3-educacao-performance",
    );
  });

  it("keeps slugs usable when the workspace name has no letters", () => {
    expect(createWorkspaceSlug("!!!")).toMatch(/^workspace-[a-z0-9]+$/);
  });

  it("allows only owners and admins to manage members", () => {
    expect(canManageMembers("OWNER")).toBe(true);
    expect(canManageMembers("ADMIN")).toBe(true);
    expect(canManageMembers("VIEWER")).toBe(false);
  });

  it("throws when a viewer tries to manage members", () => {
    expect(() => assertCanManageMembers("VIEWER")).toThrow("Sem permissao");
  });
});
