import { beforeEach, expect, vi } from "vitest";

const { get, put } = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
}));

vi.mock("axios", () => ({
  default: { get, put, defaults: {} },
}));

import { apiGet, apiGetBlobUrl, apiPut } from "../client";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:photo"),
  });
});

it("sends the knox token and parses JSON", async () => {
  localStorage.setItem("token", "abc");
  get.mockResolvedValue({ data: { ok: true } });

  await expect(apiGet<{ ok: boolean }>("/some/url")).resolves.toEqual({
    ok: true,
  });

  expect(get).toHaveBeenCalledWith("/some/url", {
    headers: {
      "Content-Type": "application/json",
      Authorization: "Token abc",
    },
  });
});

it("sends a PUT body with the token", async () => {
  localStorage.setItem("token", "abc");
  put.mockResolvedValue({ data: undefined });

  await apiPut("/some/url", { value: 1 });

  expect(put).toHaveBeenCalledWith(
    "/some/url",
    { value: 1 },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: "Token abc",
      },
    }
  );
});

it("maps the server detail onto the error", async () => {
  get.mockRejectedValue({
    response: { status: 400, data: { detail: "Kaputt" } },
    message: "Request failed with status code 400",
  });

  await expect(apiGet("/some/url")).rejects.toEqual({
    status: 400,
    message: "Kaputt",
    body: { detail: "Kaputt" },
  });
});

it("keeps the transport message when the response has no detail", async () => {
  get.mockRejectedValue({
    response: { status: 500, data: "server error" },
    message: "Network Error",
  });

  await expect(apiGet("/some/url")).rejects.toEqual({
    status: 500,
    message: "Network Error",
    body: "server error",
  });
});

it("turns a photo response into an object URL", async () => {
  localStorage.setItem("token", "abc");
  get.mockResolvedValue({ data: new Blob(["png"]) });

  await expect(apiGetBlobUrl("/photo")).resolves.toBe("blob:photo");

  expect(get).toHaveBeenCalledWith("/photo", {
    headers: {
      "Content-Type": "application/json",
      Authorization: "Token abc",
    },
    responseType: "blob",
  });
});
