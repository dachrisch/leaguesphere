import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ChallengeSheet, { challengeEvent } from "./ChallengeSheet";

function renderSheet(
  overrides: Partial<Parameters<typeof ChallengeSheet>[0]> = {},
): { onSubmit: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } {
  const onSubmit = vi.fn(async () => undefined);
  const onClose = vi.fn();
  render(
    <ChallengeSheet
      onClose={onClose}
      onSubmit={onSubmit}
      teamName="Ravens"
      {...overrides}
    />,
  );
  return { onClose, onSubmit };
}

describe("challengeEvent", () => {
  it("writes a challenge without text", () => {
    expect(challengeEvent("   ")).toEqual({ name: "Challenge" });
  });

  it("keeps the reason as the visible detail", () => {
    expect(challengeEvent("  Zuschauer zu viele  ")).toEqual({
      name: "Challenge",
      input: "Zuschauer zu viele",
    });
  });
});

describe("ChallengeSheet", () => {
  it("saves on one tap when nobody types a reason", async () => {
    const user = userEvent.setup();
    const { onSubmit, onClose } = renderSheet();

    await user.click(
      screen.getByRole("button", { name: "Challenge speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({ name: "Challenge" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("saves the reason when one is typed", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet();

    await user.type(
      screen.getByRole("textbox", { name: /Was wird gechallenget/ }),
      "Catch nicht im Feld",
    );
    await user.click(
      screen.getByRole("button", { name: "Challenge speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Challenge",
      input: "Catch nicht im Feld",
    });
  });

  it("keeps the sheet open with the reason when the write fails", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {
      throw new Error("kaputt");
    });
    renderSheet({ onSubmit });

    await user.click(
      screen.getByRole("button", { name: "Challenge speichern" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Challenge konnte nicht gespeichert werden",
    );
  });
});
