type EnvLike = Record<string, string | undefined>;

type AnalyticsEventInput = {
  name:
    | "signup"
    | "connector_connect"
    | "dashboard_view"
    | "data_export_request"
    | "delete_account_request"
    | "feedback_submit";
  userId: string;
  workspaceId?: string;
  properties?: Record<string, string | number | boolean | null | undefined>;
};

const blockedPropertyKeys = new Set(["email", "name", "customerEmail", "accessToken", "refreshToken"]);

export function isPostHogEnabled(env: EnvLike = process.env) {
  return Boolean(env.NEXT_PUBLIC_POSTHOG_KEY);
}

export function buildAnalyticsEvent(input: AnalyticsEventInput) {
  const properties: Record<string, string | number | boolean> = {};

  if (input.workspaceId) {
    properties.workspaceId = input.workspaceId;
  }

  for (const [key, value] of Object.entries(input.properties ?? {})) {
    if (value !== undefined && value !== null && !blockedPropertyKeys.has(key)) {
      properties[key] = value;
    }
  }

  return {
    name: input.name,
    distinctId: input.userId,
    properties,
  };
}
