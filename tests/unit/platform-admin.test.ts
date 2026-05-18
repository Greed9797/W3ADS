import { describe, expect, it } from "vitest";

import {
  assertCanManageProviderConfigs,
  canManageProviderConfigs,
} from "@/lib/auth/platform-permissions";

describe("platform admin permissions", () => {
  it("allows only W3 platform admins to manage provider configurations", () => {
    expect(canManageProviderConfigs({ platformRole: "W3_ADMIN" })).toBe(true);
    expect(canManageProviderConfigs({ platformRole: "USER" })).toBe(false);
  });

  it("throws a stable permission error for non-platform admins", () => {
    expect(() => assertCanManageProviderConfigs({ platformRole: "USER" })).toThrow(
      "Sem permissao para configurar provedores.",
    );
  });
});
