const requiredProductionEnvGroups = [
  {
    keys: ["AUTH_SECRET", "NEXTAUTH_SECRET"],
    message: "AUTH_SECRET or NEXTAUTH_SECRET is required in production.",
    any: true,
  },
  {
    keys: ["DATABASE_URL"],
    message: "DATABASE_URL is required in production.",
  },
  {
    keys: ["DIRECT_URL"],
    message: "DIRECT_URL is required in production.",
  },
];

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function shouldValidateProductionEnv(env = process.env) {
  return env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
}

export function productionEnvErrors(env = process.env) {
  if (!shouldValidateProductionEnv(env)) {
    return [];
  }

  const errors = [];

  if (env.AUTH_DISABLED === "true") {
    errors.push("AUTH_DISABLED must be false or empty in production.");
  }

  for (const group of requiredProductionEnvGroups) {
    const configured = group.any
      ? group.keys.some((key) => hasText(env[key]))
      : group.keys.every((key) => hasText(env[key]));

    if (!configured) {
      errors.push(group.message);
    }
  }

  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = productionEnvErrors();

  if (errors.length > 0) {
    console.error(["Production environment is not ready:", ...errors.map((error) => `- ${error}`)].join("\n"));
    process.exit(1);
  }
}
