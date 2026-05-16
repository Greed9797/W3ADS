export function isAuthDisabled() {
  return process.env.AUTH_DISABLED !== "false";
}
