// Match HTTP and Socket.IO against the same explicit frontend allowlist.
export function isAllowedOrigin(origin: string | undefined) {
  const allowed = (process.env.CLIENT_URL ?? "http://localhost:5173")
    .split(",")
    .map(value => value.trim())
    .filter(value => value.length > 0 && value !== "*");
  // Non-browser clients may omit Origin; JWT authentication still applies.
  return origin === undefined || allowed.includes(origin);
}
