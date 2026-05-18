type EnvLike = Record<string, string | undefined>;

export const NUVEMSHOP_OAUTH_STATE_COOKIE = "adstart_nuvemshop_oauth_state";
export const NUVEMSHOP_DEFAULT_API_BASE_URL = "https://api.tiendanube.com/v1";

const requiredNuvemshopEnv = [
  "NUVEMSHOP_CLIENT_ID",
  "NUVEMSHOP_CLIENT_SECRET",
  "NUVEMSHOP_REDIRECT_URI",
] as const;

export type NuvemshopConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  apiBaseUrl: string;
};

export function getNuvemshopConfigStatus(env: EnvLike = process.env) {
  const missing = requiredNuvemshopEnv.filter((key) => !env[key]);

  return {
    configured: missing.length === 0,
    missing,
    apiBaseUrl: env.NUVEMSHOP_API_BASE_URL ?? NUVEMSHOP_DEFAULT_API_BASE_URL,
  };
}

export function getNuvemshopConfig(env: EnvLike = process.env): NuvemshopConfig {
  const status = getNuvemshopConfigStatus(env);

  if (!status.configured) {
    throw new Error(`Missing Nuvemshop env vars: ${status.missing.join(", ")}`);
  }

  return {
    clientId: env.NUVEMSHOP_CLIENT_ID!,
    clientSecret: env.NUVEMSHOP_CLIENT_SECRET!,
    redirectUri: env.NUVEMSHOP_REDIRECT_URI!,
    apiBaseUrl: status.apiBaseUrl,
  };
}

export function buildNuvemshopOAuthUrl(
  input: { state: string },
  env: EnvLike = process.env,
) {
  const config = getNuvemshopConfig(env);
  const url = new URL(`https://www.tiendanube.com/apps/${config.clientId}/authorize`);

  url.searchParams.set("state", input.state);

  return url;
}
