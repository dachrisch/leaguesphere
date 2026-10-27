import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { TeamOfficial } from "../api/types";
import PersonPicker, { type PersonValue } from "./PersonPicker";

function person(overrides: Partial<TeamOfficial> = {}): TeamOfficial {
  return {
    id: 11,
    first_name: "Michael",
    last_name: "Klein",
    team: "Crew Rhein",
    license: "B",
    valid_until: "2027-06-30",
    is_valid: true,
    ...overrides,
  };
}

const LINKED: PersonValue = { official: 11, name: "Michael Klein" };
const FREE_TEXT: PersonValue = { official: null, name: "Gast Schiri" };

interface Options {
  value?: PersonValue;
  taken?: Set<number>;
  search?: (query: string) => Promise<TeamOfficial[]>;
  disabled?: boolean;
}

function renderPicker({
  value = LINKED,
  taken = new Set<number>(),
  search,
  disabled = false,
}: Options = {}) {
  const onPick = vi.fn();
  const onFreeText = vi.fn();
  const searchMock = vi.fn(
    search ?? (async () => [person(), person({ id: 12, first_name: "Anna", last_name: "Richter" })]),
  );
  render(
    <PersonPicker
      disabled={disabled}
      label="Schiedsrichter"
      onFreeText={onFreeText}
      onPick={onPick}
      search={searchMock}
      taken={taken}
      teamId={7}
      value={value}
    />,
  );
  return { onPick, onFreeText, searchMock };
}

async function openPicker(): Promise<HTMLInputElement> {
  await userEvent.click(
    screen.getByRole("button", { name: "Schiedsrichter: Offiziellen wählen" }),
  );
  return screen.getByLabelText("Schiedsrichter: Person suchen");
}

describe("PersonPicker — closed state", () => {
  it("shows the linked official and a green link state", () => {
    renderPicker();
    const button = screen.getByRole("button", {
      name: "Schiedsrichter: Offiziellen wählen",
    });
    expect(button).toHaveTextContent("Michael Klein");
    expect(button).toHaveTextContent("verknüpft");
  });

  it("marks a free-text name as unlinked", () => {
    renderPicker({ value: FREE_TEXT });
    const button = screen.getByRole("button", {
      name: "Schiedsrichter: Offiziellen wählen",
    });
    expect(button).toHaveTextContent("Gast Schiri");
    expect(button).toHaveTextContent("Freitext");
  });

  it("asks for an official when the slot is empty", () => {
    renderPicker({ value: { official: null, name: null } });
    expect(
      screen.getByRole("button", { name: "Schiedsrichter: Offiziellen wählen" }),
    ).toHaveTextContent("Offiziellen wählen");
  });

  it("cannot be opened while the crew is read-only", () => {
    renderPicker({ disabled: true });
    expect(
      screen.getByRole("button", { name: "Schiedsrichter: Offiziellen wählen" }),
    ).toBeDisabled();
  });
});

describe("PersonPicker — search", () => {
  it("does not search below two characters", async () => {
    const { searchMock } = renderPicker();
    const input = await openPicker();
    await userEvent.type(input, "k");
    expect(screen.getByText("Mindestens 2 Zeichen")).toBeInTheDocument();
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("searches across the database while typing", async () => {
    const { searchMock } = renderPicker();
    const input = await openPicker();
    await userEvent.type(input, "kle");
    await waitFor(() => expect(searchMock).toHaveBeenCalledWith("kle"));
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("Michael Klein");
    expect(options[0]).toHaveTextContent("Crew Rhein");
  });

  it("picks a suggestion by tapping it", async () => {
    const { onPick } = renderPicker();
    const input = await openPicker();
    await userEvent.type(input, "rich");
    await userEvent.click(await screen.findByRole("option", { name: /Anna Richter/ }));
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 12, last_name: "Richter" }),
    );
    expect(
      screen.queryByLabelText("Schiedsrichter: Person suchen"),
    ).not.toBeInTheDocument();
  });

  it("picks the highlighted suggestion with the keyboard", async () => {
    const { onPick } = renderPicker();
    const input = await openPicker();
    await userEvent.type(input, "kle");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Enter}");
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 11, last_name: "Klein" }),
    );
  });

  it("closes on Escape without picking anybody", async () => {
    const { onPick } = renderPicker();
    await openPicker();
    await userEvent.keyboard("{Escape}");
    expect(onPick).not.toHaveBeenCalled();
    expect(
      screen.queryByLabelText("Schiedsrichter: Person suchen"),
    ).not.toBeInTheDocument();
  });

  it("shows a person who already fills another slot without offering them", async () => {
    const { onPick } = renderPicker({ taken: new Set([12]) });
    const input = await openPicker();
    await userEvent.type(input, "rich");
    const option = await screen.findByRole("option", { name: /Anna Richter/ });
    expect(option).toHaveAttribute("aria-disabled", "true");
    expect(option).toHaveTextContent("bereits gesetzt");
    await userEvent.click(option);
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe("PersonPicker — free text", () => {
  const NOBODY = async (): Promise<TeamOfficial[]> => [];

  it("asks for first and last name", async () => {
    renderPicker({ search: NOBODY });
    const input = await openPicker();
    await userEvent.type(input, "Gast");
    const freeText = await screen.findByRole("button", {
      name: "Als Freitext übernehmen",
    });
    expect(freeText).toBeDisabled();
    expect(screen.getByText("Vor- und Nachname angeben")).toBeInTheDocument();
  });

  it("keeps a guest name when nothing matches", async () => {
    const { onFreeText } = renderPicker({ search: NOBODY });
    const input = await openPicker();
    await userEvent.type(input, "Gast Schiri");
    await userEvent.click(
      await screen.findByRole("button", { name: "Als Freitext übernehmen" }),
    );
    expect(onFreeText).toHaveBeenCalledWith("Gast Schiri");
  });

  it("refuses free text while a person matches", async () => {
    renderPicker();
    const input = await openPicker();
    await userEvent.type(input, "kle");
    await screen.findAllByRole("option");
    expect(
      screen.queryByRole("button", { name: "Als Freitext übernehmen" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Bitte eine gefundene Person wählen"),
    ).toBeInTheDocument();
  });

  it("still allows free text when the search is offline", async () => {
    const offline = async (): Promise<TeamOfficial[]> => {
      throw new Error("offline");
    };
    const { onFreeText } = renderPicker({ search: offline });
    const input = await openPicker();
    await userEvent.type(input, "Gast Schiri");
    expect(await screen.findByText("Suche nur online")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Als Freitext übernehmen" }),
    );
    expect(onFreeText).toHaveBeenCalledWith("Gast Schiri");
  });
});

describe("PersonPicker — clearing", () => {
  it("clears a slot back to nobody", async () => {
    const onClear = vi.fn();
    render(
      <PersonPicker
        label="Schiedsrichter"
        onClear={onClear}
        onFreeText={vi.fn()}
        onPick={vi.fn()}
        search={async () => []}
        teamId={7}
        value={LINKED}
      />,
    );
    await openPicker();
    await userEvent.click(
      screen.getByRole("button", { name: "Auswahl entfernen" }),
    );
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByLabelText("Schiedsrichter: Person suchen"),
    ).not.toBeInTheDocument();
  });
});
