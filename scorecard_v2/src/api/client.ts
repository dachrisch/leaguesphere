/**
 * Thin fetch wrapper for the scorecard v2 API.
 *
 * Session auth: every request is same-origin, so the Django session cookie is
 * sent. CSRF comes from the `csrftoken` cookie seeded by `ensure_csrf_cookie`;
 * there is no token in `localStorage` and no meta tag. When the cookie is
 * missing we still send the request and let Django answer 403 — inventing a
 * client-side error here would hide the real server answer.
 *
 * Errors: a non-2xx response throws {@link ApiError} with the HTTP status and
 * the parsed body. A failed fetch (offline, DNS, abort) throws {@link ApiError}
 * with `status === 0`, so the sync engine can tell "not delivered, retry" from
 * "the server rejected it".
 *
 * Device lock: while a game is open the caller sets the device id once via
 * {@link setDeviceId}; it is attached as `X-Scorecard-Device` to every request
 * until cleared. Module-level state is deliberate — the header describes the
 * browser session, not one caller — and is reset in tests.
 */

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const GENERIC_ERROR_MESSAGE = "Die Anfrage ist fehlgeschlagen.";
const NETWORK_ERROR_MESSAGE = "Keine Verbindung zum Server.";
const CSRF_COOKIE = "csrftoken";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly detail?: string;

  constructor(status: number, body: unknown, detail?: string) {
    super(detail ?? GENERIC_ERROR_MESSAGE);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.detail = detail;
  }
}

let deviceId: string | null = null;

/**
 * Attach `X-Scorecard-Device` to every following request, or clear it with
 * `null` when the open game is left.
 */
export function setDeviceId(id: string | null): void {
  deviceId = id === "" ? null : id;
}

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // A malformed escape in an unrelated cookie must not break the request.
    return value;
  }
}

function readCookie(name: string): string | null {
  for (const cookie of document.cookie.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator === -1) {
      continue;
    }
    if (cookie.slice(0, separator).trim() === name) {
      return decodeCookieValue(cookie.slice(separator + 1).trim());
    }
  }
  return null;
}

function detailFrom(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("detail" in body)) {
    return undefined;
  }
  const { detail } = body as { detail?: unknown };
  return typeof detail === "string" ? detail : undefined;
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }
  const text = await response.text();
  if (text.trim() === "") {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (UNSAFE_METHODS.has(method)) {
    const csrfToken = readCookie(CSRF_COOKIE);
    if (csrfToken !== null) {
      headers["X-CSRFToken"] = csrfToken;
    }
  }
  if (deviceId !== null) {
    headers["X-Scorecard-Device"] = deviceId;
  }

  const serializedBody = body === undefined ? undefined : JSON.stringify(body);

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers,
      body: serializedBody,
    });
  } catch {
    throw new ApiError(0, null, NETWORK_ERROR_MESSAGE);
  }

  let parsed: unknown;
  try {
    parsed = await readBody(response);
  } catch {
    // The connection dropped while reading the body. An error status is still
    // the server's answer; a 2xx that never arrived counts as not delivered.
    if (response.ok) {
      throw new ApiError(0, null, NETWORK_ERROR_MESSAGE);
    }
    parsed = undefined;
  }

  if (!response.ok) {
    throw new ApiError(response.status, parsed, detailFrom(parsed));
  }
  return parsed as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>("GET", path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("POST", path, body);
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("PUT", path, body);
}

export function apiDelete<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("DELETE", path, body);
}
