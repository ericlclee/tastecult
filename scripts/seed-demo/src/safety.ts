const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Demo data must never reach a hosted database, so only localhost URLs are allowed. */
export function isLocalDatabaseUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}
