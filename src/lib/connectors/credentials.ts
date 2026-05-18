import { createHash } from "node:crypto";

import {
  decryptToken,
  encryptToken,
  type EncryptedToken,
} from "@/lib/crypto/token-vault";

export type ConnectorCredentialValue = string | number | boolean | null | undefined;
export type ConnectorCredentialPayload = Record<string, ConnectorCredentialValue>;

export function encryptConnectorCredentials(
  credentials: ConnectorCredentialPayload,
  options: { key?: string; keyVersion?: string } = {},
) {
  return encryptToken(JSON.stringify(credentials), options);
}

export function decryptConnectorCredentials(
  encrypted: EncryptedToken,
  options: { key?: string; keyVersion?: string } = {},
) {
  return JSON.parse(decryptToken(encrypted, options)) as ConnectorCredentialPayload;
}

export function connectorCredentialsFromAccount(account: {
  accessTokenCiphertext: string;
  tokenIv: string;
  tokenAuthTag: string;
  tokenKeyVersion: string;
}) {
  return decryptConnectorCredentials({
    ciphertext: account.accessTokenCiphertext,
    iv: account.tokenIv,
    authTag: account.tokenAuthTag,
    keyVersion: account.tokenKeyVersion,
  });
}

export function stableExternalAccountId(provider: string, accountSeed: string) {
  return createHash("sha256")
    .update(`${provider}:${accountSeed.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);
}
