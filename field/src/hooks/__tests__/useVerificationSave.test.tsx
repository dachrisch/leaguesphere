import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, vi } from "vitest";

import { saveRoster } from "../../api/passcheck";
import { useVerificationSave } from "../useVerificationSave";
import type { ApiError } from "../../api/client";

vi.mock("../../api/passcheck", () => ({
  saveRoster: vi.fn(),
}));

const mockedSave = vi.mocked(saveRoster);

const input = {
  officialName: "M. Weber",
  note: "",
  entries: [{ id: 12, jersey_number: 7 }],
};

beforeEach(() => {
  mockedSave.mockReset();
  localStorage.clear();
});

it("maps a 400 body onto the sheet errors", async () => {
  const error: ApiError = {
    status: 400,
    message: "invalid roster",
    body: { errors: { team: "Mindestspielstärke 11 nicht erreicht." } },
  };
  mockedSave.mockRejectedValueOnce(error);
  const { result } = renderHook(() => useVerificationSave(1, 7));

  await act(async () => {
    await result.current.save(input);
  });

  expect(result.current.state).toEqual({
    status: "error",
    errors: { team: "Mindestspielstärke 11 nicht erreicht." },
    conflict: null,
  });
});

it("surfaces a device conflict and keeps the client id for the retry", async () => {
  const conflict: ApiError = {
    status: 409,
    message: "Diese Passliste wird bereits auf einem anderen Gerät geführt.",
    body: { detail: "conflict" },
  };
  mockedSave.mockRejectedValueOnce(conflict).mockResolvedValueOnce(undefined);
  const { result } = renderHook(() => useVerificationSave(1, 7));

  await act(async () => {
    await result.current.save(input);
  });
  expect(result.current.state).toMatchObject({
    status: "error",
    conflict: conflict.message,
  });

  await act(async () => {
    await result.current.save(input);
  });

  const first = mockedSave.mock.calls[0][2];
  const second = mockedSave.mock.calls[1][2];
  expect(second.client_id).toBe(first.client_id);
  expect(second.device_id).toBe(first.device_id);
  expect(result.current.state).toEqual({ status: "done" });
});

it("uses a fresh client id after the flow is reset", async () => {
  mockedSave.mockResolvedValue(undefined);
  const { result } = renderHook(() => useVerificationSave(1, 7));

  await act(async () => {
    await result.current.save(input);
  });
  const first = mockedSave.mock.calls[0][2].client_id;

  act(() => {
    result.current.reset();
  });
  await act(async () => {
    await result.current.save(input);
  });

  expect(mockedSave.mock.calls[1][2].client_id).not.toBe(first);
});
