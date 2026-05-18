import type { PlatformRole } from "@prisma/client";

type PlatformUser = {
  platformRole: PlatformRole | "USER" | "W3_ADMIN";
};

export function canManageProviderConfigs(user: PlatformUser) {
  return user.platformRole === "W3_ADMIN";
}

export function assertCanManageProviderConfigs(user: PlatformUser) {
  if (!canManageProviderConfigs(user)) {
    throw new Error("Sem permissao para configurar provedores.");
  }
}
