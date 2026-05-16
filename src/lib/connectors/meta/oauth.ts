type EnvLike = Record<string, string | undefined>;

export const META_DEFAULT_API_VERSION = "v25.0";
export const META_OAUTH_SCOPES = [
  "ads_read",
  "ads_management",
  "business_management",
  "read_insights",
] as const;

const requiredMetaEnv = ["META_APP_ID", "META_APP_SECRET", "META_REDIRECT_URI"] as const;

export type MetaEnvKey = (typeof requiredMetaEnv)[number];

export type MetaConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  apiVersion: string;
};

export function getMetaConfigStatus(env: EnvLike = process.env) {
  const missing = requiredMetaEnv.filter((key) => !env[key]);

  return {
    configured: missing.length === 0,
    missing,
    apiVersion: env.META_API_VERSION ?? META_DEFAULT_API_VERSION,
  };
}

export function getMetaConfig(env: EnvLike = process.env): MetaConfig {
  const status = getMetaConfigStatus(env);

  if (!status.configured) {
    throw new Error(`Missing Meta env vars: ${status.missing.join(", ")}`);
  }

  return {
    appId: env.META_APP_ID!,
    appSecret: env.META_APP_SECRET!,
    redirectUri: env.META_REDIRECT_URI!,
    apiVersion: status.apiVersion,
  };
}

export function buildMetaOAuthUrl(
  input: { state: string; scopes?: readonly string[] },
  env: EnvLike = process.env,
) {
  const config = getMetaConfig(env);
  const url = new URL(`https://www.facebook.com/${config.apiVersion}/dialog/oauth`);

  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", (input.scopes ?? META_OAUTH_SCOPES).join(","));
  url.searchParams.set("response_type", "code");

  return url;
}
