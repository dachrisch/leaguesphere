import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import Sheet from "./Sheet";

/** Opens the sheet from a real button, so focus restoration is observable. */
function Opener({ onClose = vi.fn() }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Öffnen
      </button>
      {open ? (
        <Sheet
          footer={
            <button className="startbtn" type="button">
              Speichern
            </button>
          }
          onClose={() => {
            onClose();
            setOpen(false);
          }}
          title="Wer hat gepunktet?"
        >
          <p>Inhalt</p>
        </Sheet>
      ) : null}
    </>
  );
}

async function open(): Promise<HTMLElement> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Öffnen" }));
  return screen.getByRole("dialog");
}

describe("Sheet", () => {
  it("is a modal dialog named by its title", () => {
    render(<Opener />);
    return open().then((dialog) => {
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAccessibleName("Wer hat gepunktet?");
      expect(dialog).toHaveTextContent("Inhalt");
      expect(
        screen.getByRole("button", { name: "Speichern" }),
      ).toBeInTheDocument();
    });
  });

  it("moves focus into the sheet and returns it to the opener", async () => {
    const onClose = vi.fn();
    render(<Opener onClose={onClose} />);

    const dialog = await open();
    expect(dialog).toHaveFocus();

    await userEvent.setup().keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Öffnen" })).toHaveFocus();
  });

  it("closes on Escape", async () => {
    render(<Opener />);
    await open();

    await userEvent.setup().keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on a click on the scrim but not inside the sheet", async () => {
    render(<Opener />);
    const user = userEvent.setup();
    const dialog = await open();
    const scrim = dialog.parentElement;

    expect(scrim).not.toBeNull();
    await user.click(dialog);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(scrim as HTMLElement);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on the close button", async () => {
    render(<Opener />);
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByRole("button", { name: "Schließen" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps Tab inside the sheet", async () => {
    render(<Opener />);
    const user = userEvent.setup();
    await open();

    const close = screen.getByRole("button", { name: "Schließen" });
    const save = screen.getByRole("button", { name: "Speichern" });

    await user.click(save);
    await user.tab();
    expect(close).toHaveFocus();

    await user.tab({ shift: true });
    expect(save).toHaveFocus();
  });

  it("shows the failure without closing", async () => {
    render(
      <Sheet error="Keine Berechtigung." onClose={vi.fn()} title="Titel">
        <p>Inhalt</p>
      </Sheet>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Keine Berechtigung.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
