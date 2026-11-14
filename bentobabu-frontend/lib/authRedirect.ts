/**
 * BentoBabu — Authentication Redirect & Safe Return URL Utilities
 * Strictly enforces that all return URLs are valid internal relative paths.
 * Prevents open redirects, protocol-relative attacks, CRLF/null-byte injection, and auth loops.
 */

export const DEFAULT_POST_LOGIN_PATH = "/menu";

/**
 * Safely resolves and validates a return URL for post-authentication redirects.
 * Strictly guarantees that only valid internal relative paths are allowed.
 */
export function getSafeReturnUrl(
  rawTarget: unknown,
  defaultUrl: string = DEFAULT_POST_LOGIN_PATH
): string {
  if (typeof rawTarget !== "string") {
    return defaultUrl;
  }

  const trimmed = rawTarget.trim();
  if (!trimmed) {
    return defaultUrl;
  }

  // 1. Must strictly start with a single slash '/'
  // Rejects protocol-relative ('//'), backslash ('\', '/\'), or multi-slash ('///')
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\") ||
    trimmed.startsWith("\\")
  ) {
    return defaultUrl;
  }

  // 2. Reject control characters, newlines, carriage returns, or tabs (CRLF injection prevention)
  if (/[\u0000-\u001F\u007F-\u009F]/.test(trimmed)) {
    return defaultUrl;
  }

  // 3. Reject any schemes or pseudo-protocols
  if (/(javascript|data|vbscript|file):/i.test(trimmed)) {
    return defaultUrl;
  }

  try {
    // 4. Parse using a dummy localhost origin to strictly verify internal relative routing
    const parsed = new URL(trimmed, "http://localhost");

    // Must strictly match the localhost origin (rejects external domains like https://evil.com)
    if (parsed.origin !== "http://localhost") {
      return defaultUrl;
    }

    // Double check pathname starts with / and not //
    if (!parsed.pathname.startsWith("/") || parsed.pathname.startsWith("//")) {
      return defaultUrl;
    }

    // 5. Prevent redirect loops to authentication pages
    const authPaths = ["/login", "/register", "/forgot-password", "/logout"];
    const normalizedPath = parsed.pathname.toLowerCase();
    if (
      authPaths.some(
        (p) => normalizedPath === p || normalizedPath.startsWith(`${p}/`)
      )
    ) {
      return defaultUrl;
    }

    // 6. Return the internal pathname, search, and hash
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return defaultUrl;
  }
}

/**
 * Constructs a login URL with the returnTo parameter preserved.
 */
export function buildLoginUrl(returnTo?: string | null): string {
  if (!returnTo) return "/login";
  const safe = getSafeReturnUrl(returnTo, "");
  if (!safe || safe === DEFAULT_POST_LOGIN_PATH) {
    return "/login";
  }
  return `/login?returnTo=${encodeURIComponent(safe)}`;
}

/**
 * Constructs a register URL with the returnTo parameter preserved.
 */
export function buildRegisterUrl(returnTo?: string | null): string {
  if (!returnTo) return "/register";
  const safe = getSafeReturnUrl(returnTo, "");
  if (!safe || safe === DEFAULT_POST_LOGIN_PATH) {
    return "/register";
  }
  return `/register?returnTo=${encodeURIComponent(safe)}`;
}

