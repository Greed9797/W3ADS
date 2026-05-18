import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse, type NextRequest } from "next/server";

type EnvLike = Partial<NodeJS.ProcessEnv>;

export type RateLimitTarget = {
  keyPrefix: "auth" | "connectors" | "webhooks";
  limit: number;
  window: `${number} ${"s" | "m" | "h"}`;
};

const authPaths = new Set(["/login", "/sign-up", "/forgot-password", "/reset-password"]);

function isProductionLike(env: EnvLike) {
  return env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
}

export function classifyRateLimitTarget(input: {
  pathname: string;
  method: string;
}): RateLimitTarget | null {
  const method = input.method.toUpperCase();

  if (input.pathname.startsWith("/api/auth") || (method === "POST" && authPaths.has(input.pathname))) {
    return { keyPrefix: "auth", limit: 10, window: "15 m" };
  }

  if (input.pathname.startsWith("/api/connectors")) {
    return { keyPrefix: "connectors", limit: 60, window: "1 m" };
  }

  if (input.pathname.startsWith("/api/webhooks")) {
    return { keyPrefix: "webhooks", limit: 300, window: "1 m" };
  }

  return null;
}

export function rateLimitConfigError(env: EnvLike = process.env) {
  if (!isProductionLike(env)) {
    return null;
  }

  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for production rate limiting.";
  }

  return null;
}

function clientIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

const ratelimitCache = new Map<string, Ratelimit>();

function rateLimiterFor(target: RateLimitTarget) {
  const key = `${target.keyPrefix}:${target.limit}:${target.window}`;
  const cached = ratelimitCache.get(key);

  if (cached) {
    return cached;
  }

  const limiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(target.limit, target.window),
    analytics: true,
    prefix: `w3ads:${target.keyPrefix}`,
  });
  ratelimitCache.set(key, limiter);

  return limiter;
}

export async function rateLimitMiddleware(request: NextRequest) {
  const target = classifyRateLimitTarget({
    pathname: request.nextUrl.pathname,
    method: request.method,
  });

  if (!target) {
    return null;
  }

  const configError = rateLimitConfigError();
  if (configError) {
    return NextResponse.json(
      {
        error: "rate_limit_not_configured",
        message: configError,
      },
      { status: 503 },
    );
  }

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  const result = await rateLimiterFor(target).limit(
    `${target.keyPrefix}:${clientIp(request)}:${request.nextUrl.pathname}`,
  );

  if (result.success) {
    return null;
  }

  return NextResponse.json(
    {
      error: "rate_limited",
      reset: result.reset,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))),
      },
    },
  );
}
