import { ConnectorProvider, ConnectorStatus, Prisma } from "@prisma/client";

import {
  decryptConnectorCredentials,
  encryptConnectorCredentials,
  type ConnectorCredentialPayload,
} from "@/lib/connectors/credentials";
import { encryptToken, encryptTokenEnvelope, type EncryptedToken } from "@/lib/crypto/token-vault";
import { prisma } from "@/lib/db/prisma";

export type ConnectorSelectableAccount = {
  externalAccountId: string;
  accountName: string;
  metadata?: Prisma.InputJsonValue;
};

export type ConnectorSelectionCredentials = ConnectorCredentialPayload & {
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
};

export type ConnectorSelectionSessionPayload = {
  accounts: ConnectorSelectableAccount[];
  credentials: ConnectorSelectionCredentials;
};

export function parseSelectableAccounts(value: unknown): ConnectorSelectableAccount[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((account) => {
    if (!account || typeof account !== "object") {
      return [];
    }

    const record = account as Record<string, unknown>;
    const externalAccountId = record.externalAccountId;
    const accountName = record.accountName;

    if (typeof externalAccountId !== "string" || typeof accountName !== "string") {
      return [];
    }

    return [
      {
        externalAccountId,
        accountName,
        metadata: record.metadata as Prisma.InputJsonValue,
      },
    ];
  });
}

export function buildSelectedConnectorAccounts(input: {
  workspaceId: string;
  provider: ConnectorProvider;
  accounts: ConnectorSelectableAccount[];
  selectedExternalAccountIds: string[];
  encryptedCredentials: EncryptedToken;
  refreshTokenCiphertext?: string | null;
  tokenExpiresAt?: Date | null;
}) {
  const byId = new Map(input.accounts.map((account) => [account.externalAccountId, account]));
  const selected = input.selectedExternalAccountIds.map((id) => {
    const account = byId.get(id);
    if (!account) {
      throw new Error("Selected connector account was not found");
    }

    return account;
  });

  return selected.map((account) => ({
    workspaceId: input.workspaceId,
    provider: input.provider,
    externalAccountId: account.externalAccountId,
    accountName: account.accountName,
    status: ConnectorStatus.ACTIVE,
    accessTokenCiphertext: input.encryptedCredentials.ciphertext,
    refreshTokenCiphertext: input.refreshTokenCiphertext ?? null,
    tokenIv: input.encryptedCredentials.iv,
    tokenAuthTag: input.encryptedCredentials.authTag,
    tokenKeyVersion: input.encryptedCredentials.keyVersion,
    tokenExpiresAt: input.tokenExpiresAt ?? null,
    metadata: account.metadata ?? Prisma.JsonNull,
    lastSyncError: null,
  }));
}

export async function createConnectorSelectionSession(input: {
  workspaceId: string;
  userId: string;
  provider: ConnectorProvider;
  accounts: ConnectorSelectableAccount[];
  credentials: ConnectorSelectionCredentials;
  expiresAt?: Date;
}) {
  const encrypted = encryptConnectorCredentials(input.credentials);

  return prisma.connectorSelectionSession.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      provider: input.provider,
      accounts: input.accounts as unknown as Prisma.InputJsonValue,
      credentialCiphertext: encrypted.ciphertext,
      credentialIv: encrypted.iv,
      credentialAuthTag: encrypted.authTag,
      credentialKeyVersion: encrypted.keyVersion,
      expiresAt: input.expiresAt ?? new Date(Date.now() + 10 * 60 * 1000),
    },
  });
}

export function decryptSelectionCredentials(session: {
  credentialCiphertext: string;
  credentialIv: string;
  credentialAuthTag: string;
  credentialKeyVersion: string;
}) {
  return decryptConnectorCredentials({
    ciphertext: session.credentialCiphertext,
    iv: session.credentialIv,
    authTag: session.credentialAuthTag,
    keyVersion: session.credentialKeyVersion,
  }) as ConnectorSelectionCredentials;
}

export function encryptSelectedAccountCredentials(credentials: ConnectorSelectionCredentials) {
  const accessToken =
    typeof credentials.accessToken === "string" ? credentials.accessToken : JSON.stringify(credentials);

  return {
    encryptedAccessToken: encryptToken(accessToken),
    encryptedRefreshToken:
      typeof credentials.refreshToken === "string"
        ? encryptTokenEnvelope(credentials.refreshToken)
        : null,
    tokenExpiresAt:
      typeof credentials.tokenExpiresAt === "string" ? new Date(credentials.tokenExpiresAt) : null,
  };
}
