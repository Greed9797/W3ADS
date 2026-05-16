type EnvLike = Record<string, string | undefined>;

export const GOOGLE_ADS_DEFAULT_API_VERSION = "v24";
export const GOOGLE_ADS_OAUTH_SCOPE = "https://www.googleapis.com/auth/adwords";

const requiredGoogleAdsEnv = [
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_REDIRECT_URI",
] as const;

export type GoogleAdsConfig = {
  apiVersion: string;
  clientId: string;
  clientSecret: string;
  developerToken: string;
  redirectUri: string;
  loginCustomerId?: string;
};

export function getGoogleAdsConfigStatus(env: EnvLike = process.env) {
  const missing = requiredGoogleAdsEnv.filter((key) => !env[key]);

  return {
    configured: missing.length === 0,
    missing,
    apiVersion: env.GOOGLE_ADS_API_VERSION ?? GOOGLE_ADS_DEFAULT_API_VERSION,
  };
}

export function getGoogleAdsConfig(env: EnvLike = process.env): GoogleAdsConfig {
  const status = getGoogleAdsConfigStatus(env);

  if (!status.configured) {
    throw new Error(`Missing Google Ads env vars: ${status.missing.join(", ")}`);
  }

  return {
    apiVersion: status.apiVersion,
    clientId: env.GOOGLE_ADS_CLIENT_ID!,
    clientSecret: env.GOOGLE_ADS_CLIENT_SECRET!,
    developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    redirectUri: env.GOOGLE_ADS_REDIRECT_URI!,
    loginCustomerId: env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  };
}

export function buildGoogleAdsOAuthUrl(
  input: { state: string; scope?: string },
  env: EnvLike = process.env,
) {
  const config = getGoogleAdsConfig(env);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.scope ?? GOOGLE_ADS_OAUTH_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", input.state);

  return url;
}
