import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import TimeoutSheet from "./TimeoutSheet";

type Submit = (gameTime: string | null) => Promise<void>;

function renderSheet(
  overrides: Partial<Parameters<typeof TimeoutSheet>[0]> = {},
): { onSubmit: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } {
  const onSubmit = vi.fn<Submit>(async () => undefined);
  const onClose = vi.fn();
  render(
    <TimeoutSheet
      onClose={onClose}
      onSubmit={onSubmit}
      perHalf={2}
      teamName="Ravens"
      used={0}
      {...overrides}
    />,
  );
  return { onClose, onSubmit };
}

describe("TimeoutSheet", () => {
  it("records a timeout without a game time and starts the countdown", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet();

    await user.click(screen.getByRole("button", { name: "Auszeit nehmen" }));

    expect(onSubmit).toHaveBeenCalledWith(null);
    expect(screen.getByRole("timer")).toHaveTextContent(/^(01:00|00:59)$/);
    expect(screen.getByText("Auszeit beenden")).toBeInTheDocument();
  });

  it("writes both clock fields", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet();

    await user.type(screen.getByRole("textbox", { name: "Minuten" }), "1");
    await user.type(screen.getByRole("textbox", { name: "Sekunden" }), "5");
    await user.click(screen.getByRole("button", { name: "Auszeit nehmen" }));

    expect(onSubmit).toHaveBeenCalledWith("01:05");
  });

  it("does nothing while disabled", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({ disabled: true });

    await user.click(screen.getByRole("button", { name: "Auszeit nehmen" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("counts one empty clock field as zero", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet();

    await user.type(screen.getByRole("textbox", { name: "Sekunden" }), "5");
    await user.click(screen.getByRole("button", { name: "Auszeit nehmen" }));

    expect(onSubmit).toHaveBeenCalledWith("00:05");
  });

  it("warns on a third timeout and records it only on the confirmed tap", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({ used: 2 });

    await user.click(screen.getByRole("button", { name: "Trotzdem erfassen" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Keine Auszeit mehr in dieser Halbzeit",
    );

    await user.click(
      screen.getByRole("button", { name: "Auszeit erfassen (bestätigt)" }),
    );
    expect(onSubmit).toHaveBeenCalledWith(null);
  });

  it("refuses seconds above 59", async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.type(screen.getByRole("textbox", { name: "Sekunden" }), "99");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Minuten 00–59 und Sekunden 00–59.",
    );
    expect(
      screen.getByRole("button", { name: "Auszeit nehmen" }),
    ).toBeDisabled();
  });

  it("keeps the dialog open with the server's reason", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<Submit>(async () => {
      throw new ApiError(500, null, "Server weg");
    });
    renderSheet({ onSubmit });

    await user.click(screen.getByRole("button", { name: "Auszeit nehmen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Server weg");
  });

  it("closes from the countdown", async () => {
    const user = userEvent.setup();
    const { onClose } = renderSheet();

    await user.click(screen.getByRole("button", { name: "Auszeit nehmen" }));
    await user.click(screen.getByRole("button", { name: "Auszeit beenden" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
