export function isAuthDisabled() {
  if (process.env.AUTH_DISABLED === "true") {
    return true;
  }

  if (process.env.AUTH_DISABLED === "false") {
    return false;
  }

  return process.env.NODE_ENV !== "production";
}
