import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  setDeviceId,
} from "./client";

const fetchMock = vi.fn<(path: string, init: RequestInit) => Promise<Response>>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function unreadableBodyResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.reject(new TypeError("terminated")),
  } as unknown as Response;
}

function lastCall(): {
  url: string;
  init: RequestInit;
  headers: Record<string, string>;
} {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  if (call === undefined) {
    throw new Error("fetch was not called");
  }
  const [url, init] = call;
  return { url, init, headers: init.headers as Record<string, string> };
}

async function expectApiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("expected the request to reject with an ApiError");
}

/** jsdom treats one assignment as one cookie, so set them one by one. */
function setCookies(cookies: Record<string, string>): void {
  for (const [name, value] of Object.entries(cookies)) {
    document.cookie = `${name}=${value}; path=/`;
  }
}

function clearCookies(): void {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim();
    if (name !== undefined && name !== "") {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  }
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  setDeviceId(null);
  clearCookies();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCookies();
});

describe("apiGet", () => {
  it("parses the JSON body and sends a same-origin GET", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 4, name: "Spieltag" }));

    const data = await apiGet<{ id: number; name: string }>("/api/gameday/list");

    expect(data).toEqual({ id: 4, name: "Spieltag" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, headers } = lastCall();
    expect(url).toBe("/api/gameday/list");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("same-origin");
    expect(init.body).toBeUndefined();
    expect(headers).toMatchObject({ Accept: "application/json" });
    expect(headers["X-CSRFToken"]).toBeUndefined();
  });

  it("does not send a CSRF header even when the cookie is present", async () => {
    setCookies({ sessionid: "abc123", csrftoken: "csrf-token" });
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await apiGet("/api/gamelog/1");

    expect(lastCall().headers["X-CSRFToken"]).toBeUndefined();
  });

  it("resolves 204 responses as undefined", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(apiGet("/api/gamelog/1")).resolves.toBeUndefined();
  });

  it("resolves an empty 200 body as undefined", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 200 }));

    await expect(apiGet("/api/gamelog/1")).resolves.toBeUndefined();
  });

  it("resolves a non-JSON 2xx body as raw text", async () => {
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));

    await expect(apiGet("/api/ping")).resolves.toBe("ok");
  });
});

describe("ApiError", () => {
  it("carries the status, body and DRF detail of a 400", async () => {
    const body = { detail: "Eintrag bereits gelöscht." };
    fetchMock.mockResolvedValue(jsonResponse(body, 400));

    const error = await expectApiError(apiGet("/api/gamelog/1"));

    expect(error.status).toBe(400);
    expect(error.body).toEqual(body);
    expect(error.detail).toBe("Eintrag bereits gelöscht.");
    expect(error.message).toBe("Eintrag bereits gelöscht.");
  });

  it("falls back to a generic German message without a server detail", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>kaputt</html>", { status: 500 }),
    );

    const error = await expectApiError(apiGet("/api/gamelog/1"));

    expect(error.status).toBe(500);
    expect(error.body).toBe("<html>kaputt</html>");
    expect(error.detail).toBeUndefined();
    expect(error.message).toBe("Die Anfrage ist fehlgeschlagen.");
  });

  it("ignores a non-string detail and keeps the body", async () => {
    const body = { detail: [{ message: "ungültig" }] };
    fetchMock.mockResolvedValue(jsonResponse(body, 422));

    const error = await expectApiError(apiGet("/api/gamelog/1"));

    expect(error.status).toBe(422);
    expect(error.body).toEqual(body);
    expect(error.detail).toBeUndefined();
    expect(error.message).toBe("Die Anfrage ist fehlgeschlagen.");
  });

  it("reports a failed fetch as status 0 instead of throwing a TypeError", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const error = await expectApiError(apiGet("/api/gamelog/1"));

    expect(error.status).toBe(0);
    expect(error.body).toBeNull();
    expect(error.detail).toBe("Keine Verbindung zum Server.");
    expect(error.message).toBe("Keine Verbindung zum Server.");
  });

  it("reports a body that dies mid-download as status 0", async () => {
    fetchMock.mockResolvedValue(unreadableBodyResponse(200));

    const error = await expectApiError(apiGet("/api/gamelog/1"));

    expect(error.status).toBe(0);
    expect(error.body).toBeNull();
  });

  it("keeps the server status when an error body cannot be read", async () => {
    fetchMock.mockResolvedValue(unreadableBodyResponse(503));

    const error = await expectApiError(apiGet("/api/gamelog/1"));

    expect(error.status).toBe(503);
    expect(error.body).toBeUndefined();
    expect(error.detail).toBeUndefined();
  });
});

describe("unsafe methods", () => {
  it.each([
    {
      method: "POST",
      send: () => apiPost("/api/gamelog/1", { team: "Heim" }),
    },
    {
      method: "PUT",
      send: () => apiPut("/api/game/1/possession", { team: "Heim" }),
    },
    {
      method: "DELETE",
      send: () => apiDelete("/api/gamelog/1", { sequence: 3 }),
    },
  ])("$method sends the CSRF token from the csrftoken cookie", async (case_) => {
    setCookies({
      sessionid: "abc123",
      csrf: "wrong-token",
      csrftoken: "csrf-token",
      theme: "dark",
    });
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await case_.send();

    const { init, headers } = lastCall();
    expect(init.method).toBe(case_.method);
    expect(headers["X-CSRFToken"]).toBe("csrf-token");
  });

  it("sends JSON bodies with the JSON content type", async () => {
    setCookies({ csrftoken: "csrf-token" });
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await apiPost("/api/gamelog/1", { team: "Heim", half: 1 });

    const { init, headers } = lastCall();
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ team: "Heim", half: 1 }));
  });

  it("sends the sequence as a JSON body on DELETE", async () => {
    setCookies({ csrftoken: "csrf-token" });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      apiDelete("/api/gamelog/1", { sequence: 3 }),
    ).resolves.toBeUndefined();

    const { url, init, headers } = lastCall();
    expect(url).toBe("/api/gamelog/1");
    expect(init.method).toBe("DELETE");
    expect(init.credentials).toBe("same-origin");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ sequence: 3 }));
  });

  it("sends no CSRF header when the cookie is absent and lets the server answer", async () => {
    setCookies({ sessionid: "abc123" });
    fetchMock.mockResolvedValue(jsonResponse({ detail: "CSRF Failed" }, 403));

    const error = await expectApiError(apiPost("/api/gamelog/1", {}));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastCall().headers["X-CSRFToken"]).toBeUndefined();
    expect(error.status).toBe(403);
    expect(error.detail).toBe("CSRF Failed");
  });

  it("sends an undecodable cookie value raw and proceeds", async () => {
    document.cookie = "csrftoken=%E0%A4%A";
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await expect(apiPost("/api/gamelog/1", {})).resolves.toEqual({ ok: true });

    expect(lastCall().headers["X-CSRFToken"]).toBe("%E0%A4%A");
  });

  it("sends no body and no JSON content type without a payload", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ ok: true })),
    );

    await apiPost("/api/game/1/halftime");

    let { init, headers } = lastCall();
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(headers["Content-Type"]).toBeUndefined();

    await apiPost("/api/game/1/halftime", null);

    ({ init, headers } = lastCall());
    expect(init.body).toBeUndefined();
    expect(headers["Content-Type"]).toBeUndefined();
  });
});

describe("device header", () => {
  it("attaches X-Scorecard-Device while a game is open and drops it after clearing", async () => {
    setDeviceId("device-abc");
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ ok: true })),
    );

    await apiGet("/api/gamelog/1");
    expect(lastCall().headers["X-Scorecard-Device"]).toBe("device-abc");

    await apiPost("/api/gamelog/1", { team: "Heim" });
    expect(lastCall().headers["X-Scorecard-Device"]).toBe("device-abc");

    setDeviceId(null);

    await apiGet("/api/gamelog/2");
    expect(lastCall().headers["X-Scorecard-Device"]).toBeUndefined();

    setDeviceId("");

    await apiGet("/api/gamelog/3");
    expect(lastCall().headers["X-Scorecard-Device"]).toBeUndefined();

    setDeviceId("   ");

    await apiGet("/api/gamelog/4");
    expect(lastCall().headers["X-Scorecard-Device"]).toBeUndefined();
  });

  it("lets a request override the module-level device id", async () => {
    setDeviceId("A");
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ ok: true })),
    );

    await apiGet("/api/gamelog/1", { deviceId: "B" });
    expect(lastCall().headers["X-Scorecard-Device"]).toBe("B");

    await apiPost("/api/gamelog/1", {}, { deviceId: "B" });
    expect(lastCall().headers["X-Scorecard-Device"]).toBe("B");

    await apiPut("/api/game/1/possession", { team: "Heim" }, { deviceId: "B" });
    expect(lastCall().headers["X-Scorecard-Device"]).toBe("B");

    await apiDelete("/api/gamelog/1", { sequence: 3 }, { deviceId: "B" });
    expect(lastCall().headers["X-Scorecard-Device"]).toBe("B");

    await apiGet("/api/gamelog/1", { deviceId: null });
    expect(lastCall().headers["X-Scorecard-Device"]).toBeUndefined();

    await apiGet("/api/gamelog/1", { deviceId: "   " });
    expect(lastCall().headers["X-Scorecard-Device"]).toBeUndefined();

    await apiGet("/api/gamelog/1");
    expect(lastCall().headers["X-Scorecard-Device"]).toBe("A");
  });
});
