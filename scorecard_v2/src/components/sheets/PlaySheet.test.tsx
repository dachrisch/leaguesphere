import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { RosterPlayer } from "../../api/types";
import { FIRST_AND_TEN, seriesAt } from "../../app/drive";
import PlaySheet, {
  playEvent,
  playEvents,
  playInput,
  playName,
  resultOptions,
  stepsFor,
} from "./PlaySheet";
import { yardsValue } from "./yards";

const ROSTER: RosterPlayer[] = [
  { side: "home", jersey: 7, name: "Meier" },
  { side: "home", jersey: 12, name: "Kern" },
  { side: "home", jersey: 23, name: "Schulz" },
  { side: "away", jersey: 11, name: "Wolf" },
];

function renderSheet(
  overrides: Partial<Parameters<typeof PlaySheet>[0]> = {},
): { onSubmit: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } {
  const onSubmit = vi.fn(async () => undefined);
  const onClose = vi.fn();
  render(
    <PlaySheet
      onClose={onClose}
      onSubmit={onSubmit}
      roster={ROSTER}
      side="home"
      teamName="Ravens"
      {...overrides}
    />,
  );
  return { onClose, onSubmit };
}

type User = ReturnType<typeof userEvent.setup>;

async function next(user: User, times = 1): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await user.click(screen.getByRole("button", { name: "Weiter" }));
  }
}

async function setYards(user: User, value: string): Promise<void> {
  const yards = screen.getByRole("textbox", { name: /Raumgewinn|Raumverlust/ });
  await user.clear(yards);
  await user.type(yards, value);
}

describe("PlaySheet helpers", () => {
  it("names the row by play type and pass result", () => {
    expect(playName("pass", true)).toBe("Pass");
    expect(playName("pass", false)).toBe("Pass unvollständig");
    expect(playName("run", true)).toBe("Run");
    expect(playName("sack", true)).toBe("Sack");
  });

  it("writes the visible text of a complete pass", () => {
    expect(playInput({ type: "pass", complete: true, yards: 8, qb: 12 })).toBe(
      "8 Yards · QB #12",
    );
  });

  it("drops the yards of an incomplete pass but keeps the thrower", () => {
    expect(
      playInput({ type: "pass", complete: false, yards: 0, qb: 12 }),
    ).toBe("QB #12");
  });

  it("writes the loss of a sack as words", () => {
    expect(playInput({ type: "sack", complete: true, yards: 5, qb: null })).toBe(
      "5 Yards Verlust",
    );
  });

  it("stores the yards signed, so a sack is a loss", () => {
    const sack = playEvent({
      type: "sack",
      complete: true,
      yards: 5,
      qb: null,
      player: 12,
    });
    expect(sack).toEqual({
      name: "Sack",
      player: 12,
      input: "5 Yards Verlust",
      payload: { yards: -5 },
    });

    const pass = playEvent({
      type: "pass",
      complete: true,
      yards: 8,
      qb: 12,
      player: 7,
    });
    expect(pass).toEqual({
      name: "Pass",
      player: 7,
      input: "8 Yards · QB #12",
      payload: { yards: 8, complete: true, qb: 12 },
    });
  });

  it("keeps the payload free of details that do not apply", () => {
    expect(
      playEvent({ type: "run", complete: true, yards: 14, qb: 12, player: 23 }),
    ).toEqual({
      name: "Run",
      player: 23,
      input: "14 Yards",
      payload: { yards: 14 },
    });
  });

  it("appends a safety for the defence", () => {
    expect(
      playEvents({
        type: "run",
        complete: true,
        yards: -5,
        qb: null,
        player: 23,
        safety: true,
      }),
    ).toEqual([
      expect.objectContaining({ name: "Run", payload: { yards: -5 } }),
      { name: "Safety (+2)", payload: { defense: true } },
    ]);
  });

  it("appends the interception and an optional pick six", () => {
    const events = playEvents({
      type: "pass",
      complete: false,
      yards: 0,
      qb: 12,
      player: null,
      defender: 11,
      interception: { deadBall: 30, returnYards: 5, pickSix: true },
    });

    expect(events[0]).toMatchObject({ name: "Pass unvollständig" });
    expect(events[1]).toMatchObject({
      name: "Interception",
      player: 11,
      input: "bis B20 · 5 Yards Return",
      payload: { deadBall: 30, returnYards: 5, defense: true },
    });
    expect(events[2]).toEqual({
      name: "Touchdown",
      player: 11,
      payload: { defense: true },
    });
  });

  it("knows which results a type can produce", () => {
    expect(resultOptions("pass").map((option) => option.label)).toEqual([
      "Complete",
      "Incomplete",
      "Touchdown",
      "Interception",
    ]);
    expect(resultOptions("sack").map((option) => option.label)).toEqual([
      "Sack",
      "Safety",
    ]);
  });

  it("skips the steps that do not apply", () => {
    expect(stepsFor("run", "gain")).toEqual([
      "type",
      "result",
      "distance",
      "player",
      "defender",
    ]);
    expect(stepsFor("sack", "gain")).toEqual([
      "type",
      "result",
      "distance",
      "player",
    ]);
    expect(stepsFor("pass", "interception")).toEqual([
      "type",
      "result",
      "qb",
      "interception",
    ]);
  });

  it("reads the yards field as a signed two-digit number", () => {
    expect(yardsValue("8")).toBe(8);
    expect(yardsValue("-5")).toBe(-5);
    expect(yardsValue("")).toBeNull();
    expect(yardsValue("-")).toBeNull();
    expect(yardsValue("1a2")).toBe(12);
    expect(yardsValue("123")).toBe(12);
  });
});

describe("PlaySheet wizard", () => {
  it("records a pass with receiver, yards and thrower", async () => {
    const user = userEvent.setup();
    const { onSubmit, onClose } = renderSheet({ lastQuarterback: 12 });

    await next(user, 2); // type → result → distance
    await setYards(user, "8");
    await next(user, 2); // distance → qb → player
    await user.click(screen.getByRole("button", { name: "Trikot 7, Meier" }));
    await next(user); // player → defender
    await user.click(
      screen.getByRole("button", { name: "Spielzug speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith([
      {
        name: "Pass",
        player: 7,
        input: "8 Yards · QB #12",
        payload: { yards: 8, complete: true, qb: 12 },
      },
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the remembered thrower as a number with ändern", async () => {
    const user = userEvent.setup();
    renderSheet({ lastQuarterback: 12 });

    await next(user, 2);
    await next(user); // distance

    expect(screen.getByText("#12")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ändern" }),
    ).toBeInTheDocument();
  });

  it("refuses to leave the QB step before a quarterback is picked", async () => {
    const user = userEvent.setup();
    renderSheet();

    await next(user, 3); // type → result → distance → qb

    expect(screen.getByText("Bitte den Quarterback wählen.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Weiter" })).toBeDisabled();
  });

  it("records a negative gain for a short pass carried backwards", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({ lastQuarterback: 12 });

    await next(user, 2);
    await setYards(user, "4");
    await user.click(screen.getByRole("button", { name: "Verlust" }));
    await next(user, 2);
    await user.click(screen.getByRole("button", { name: "Trikot 7, Meier" }));
    await next(user);
    await user.click(
      screen.getByRole("button", { name: "Spielzug speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith([
      {
        name: "Pass",
        player: 7,
        input: "4 Yards Verlust · QB #12",
        payload: { yards: -4, complete: true, qb: 12 },
      },
    ]);
  });

  it("records a run without a quarterback or a pass result", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet();

    await user.click(screen.getByRole("button", { name: "Run" }));
    await next(user); // type → result
    await next(user); // result → distance
    await setYards(user, "14");
    await next(user); // distance → player
    await user.click(screen.getByRole("button", { name: "Trikot 23, Schulz" }));
    await next(user); // player → defender
    await user.click(
      screen.getByRole("button", { name: "Spielzug speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith([
      {
        name: "Run",
        player: 23,
        input: "14 Yards",
        payload: { yards: 14 },
      },
    ]);
  });

  it("records an incomplete pass towards a receiver", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({ lastQuarterback: 12 });

    await next(user); // type
    await user.click(screen.getByRole("button", { name: "Incomplete" }));
    await next(user, 2); // result → qb → player
    await user.click(screen.getByRole("button", { name: "Trikot 7, Meier" }));
    await next(user); // player → defender
    await user.click(
      screen.getByRole("button", { name: "Spielzug speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith([
      {
        name: "Pass unvollständig",
        player: 7,
        input: "QB #12",
        payload: { yards: 0, complete: false, qb: 12 },
      },
    ]);
  });

  it("records a sack as a loss", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet();

    await user.click(screen.getByRole("button", { name: "Sack" }));
    await next(user, 2); // type → result → distance
    await setYards(user, "5");
    await next(user); // distance → player (no QB, no defender)
    await user.click(screen.getByRole("button", { name: "Trikot 12, Kern" }));
    await user.click(
      screen.getByRole("button", { name: "Spielzug speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith([
      {
        name: "Sack",
        player: 12,
        input: "5 Yards Verlust",
        payload: { yards: -5 },
      },
    ]);
  });

  it("lists the defender who made the tackle, from the other team", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({ lastQuarterback: 12 });

    await next(user, 2);
    await next(user, 2); // distance → qb → player
    await user.click(
      await screen.findByRole("button", { name: "Trikot 7, Meier" }),
    );
    await next(user); // player → defender
    await user.click(screen.getByRole("button", { name: "Defense 11, Wolf" }));
    await user.click(
      screen.getByRole("button", { name: "Spielzug speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith([
      {
        name: "Pass",
        player: 7,
        input: "0 Yards · QB #12 · Tackle #11",
        payload: {
          yards: 0,
          complete: true,
          qb: 12,
          defense: { player: 11 },
        },
      },
    ]);
  });

  it("records a deflection on an incomplete pass", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({ lastQuarterback: 12 });

    await next(user);
    await user.click(screen.getByRole("button", { name: "Incomplete" }));
    await next(user, 2); // result → qb → player
    await next(user); // player → defender
    await user.click(screen.getByRole("button", { name: "Deflection" }));
    await user.click(
      await screen.findByRole("button", { name: "Defense 11, Wolf" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Spielzug speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith([
      {
        name: "Pass unvollständig",
        input: "QB #12 · Deflection #11",
        payload: {
          yards: 0,
          complete: false,
          qb: 12,
          defense: { player: 11, deflection: true },
        },
      },
    ]);
  });

  it("offers no defender on a sack", async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByRole("button", { name: "Sack" }));
    await next(user, 2); // type → result → distance
    await next(user); // distance → player

    expect(screen.queryByRole("group", { name: "Deflection" })).toBeNull();
    expect(
      screen.queryByRole("group", { name: "Trikotnummer Defense" }),
    ).toBeNull();
  });

  it("previews the next down & distance from the play", async () => {
    const user = userEvent.setup();
    renderSheet({ drive: FIRST_AND_TEN });

    await user.click(screen.getByRole("button", { name: "Run" }));
    await next(user);
    await next(user); // distance
    await setYards(user, "14");

    expect(screen.getByRole("status")).toHaveTextContent("→ 2nd & M · A19");
  });

  it("takes the end spot instead of the yards", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({ drive: FIRST_AND_TEN });

    await user.click(screen.getByRole("button", { name: "Run" }));
    await next(user);
    await next(user); // distance
    await user.click(screen.getByRole("button", { name: "Endpunkt" }));
    await user.click(screen.getByRole("button", { name: "B · gegnerische" }));
    await user.type(screen.getByRole("textbox", { name: /Endpunkt/ }), "20");

    expect(screen.getByRole("status")).toHaveTextContent("→ 1st & G · B20");

    await next(user);
    await user.click(screen.getByRole("button", { name: "Trikot 23, Schulz" }));
    await next(user);
    await user.click(
      screen.getByRole("button", { name: "Spielzug speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "Run",
        player: 23,
        payload: { yards: 25 },
      }),
    ]);
  });

  it("prefills the distance to the end zone on a touchdown", async () => {
    const user = userEvent.setup();
    renderSheet({ drive: seriesAt(45) });

    await user.click(screen.getByRole("button", { name: "Run" }));
    await next(user);
    await user.click(screen.getByRole("button", { name: "Touchdown" }));
    await next(user); // distance

    expect(
      screen.getByRole("textbox", { name: /Raumgewinn/ }),
    ).toHaveValue("5");
    // T4: no loss switch on a touchdown.
    expect(screen.queryByRole("button", { name: "Verlust" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("→ Touchdown");
  });

  it("prefills the run to the own goal line on a safety", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({ drive: seriesAt(5) });

    await user.click(screen.getByRole("button", { name: "Run" }));
    await next(user);
    await user.click(screen.getByRole("button", { name: "Safety" }));
    await next(user); // distance
    expect(screen.getByRole("textbox", { name: /Raumverlust/ })).toHaveValue(
      "5",
    );
    await next(user); // player
    await user.click(screen.getByRole("button", { name: "Trikot 23, Schulz" }));
    await next(user); // player → defender
    await user.click(
      screen.getByRole("button", { name: "Spielzug speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith([
      expect.objectContaining({ name: "Run", payload: { yards: -5 } }),
      { name: "Safety (+2)", payload: { defense: true } },
    ]);
  });

  it("records an interception with the defender, spot and pick six", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({ lastQuarterback: 12 });

    await next(user); // type
    await user.click(screen.getByRole("button", { name: "Interception" }));
    await next(user, 2); // result → qb → interception
    expect(screen.getByText("Trikotnummer Verteidiger (optional)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Defense 11, Wolf" }));
    await user.click(screen.getByRole("button", { name: "B · gegnerische" }));
    await user.type(
      screen.getByRole("textbox", { name: /Yardlinie, wo der Return endete/ }),
      "20",
    );
    await user.click(
      screen.getByRole("button", { name: "Pick six (Touchdown)" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Spielzug speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith([
      expect.objectContaining({ name: "Pass unvollständig" }),
      expect.objectContaining({
        name: "Interception",
        player: 11,
        payload: expect.objectContaining({ deadBall: 30, defense: true }),
      }),
      { name: "Touchdown", player: 11, payload: { defense: true } },
    ]);
  });

  it("keeps the sheet open with the reason when the write fails", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {
      throw new Error("kaputt");
    });
    renderSheet({ lastQuarterback: 12, onSubmit });

    await next(user, 2);
    await next(user, 2); // distance → qb → player
    await user.click(screen.getByRole("button", { name: "Trikot 7, Meier" }));
    await next(user);
    await user.click(
      screen.getByRole("button", { name: "Spielzug speichern" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Der Spielzug konnte nicht gespeichert werden",
    );
  });
});

describe("the touchdown is the play's result", () => {
  it("records the play and its touchdown in one submission", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({ lastQuarterback: 12 });

    await next(user); // type
    await user.click(screen.getByRole("button", { name: "Touchdown" }));
    await next(user); // distance
    await next(user, 2); // qb → player
    await user.click(screen.getByRole("button", { name: "Trikot 7, Meier" }));
    await next(user); // player → defender
    await user.click(
      screen.getByRole("button", { name: "Spielzug speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith([
      expect.objectContaining({ name: "Pass", player: 7 }),
      { name: "Touchdown", player: 7 },
    ]);
  });

  it("keeps the touchdown when no number is picked — a team score", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({ lastQuarterback: 12 });

    await user.click(screen.getByRole("button", { name: "Run" }));
    await next(user); // type
    await user.click(screen.getByRole("button", { name: "Touchdown" }));
    await next(user, 2); // distance → player
    await next(user); // player → defender
    await user.click(
      screen.getByRole("button", { name: "Spielzug speichern" }),
    );

    // IFAF R 8-1-1: the points are the team's, the jersey is detail.
    expect(onSubmit).toHaveBeenCalledWith([
      expect.objectContaining({ name: "Run" }),
      { name: "Touchdown" },
    ]);
  });

  it("takes the touchdown back when the official changes their mind", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({ lastQuarterback: 12 });

    await next(user);
    await user.click(screen.getByRole("button", { name: "Touchdown" }));
    await user.click(screen.getByRole("button", { name: "Complete" }));
    await next(user, 2); // distance → qb
    await next(user); // qb → player
    await user.click(screen.getByRole("button", { name: "Trikot 7, Meier" }));
    await next(user);
    await user.click(
      screen.getByRole("button", { name: "Spielzug speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith([
      expect.objectContaining({ name: "Pass" }),
    ]);
    expect(onSubmit.mock.calls[0][0]).toHaveLength(1);
  });

  it("offers no touchdown for a sack", async () => {
    const user = userEvent.setup();
    renderSheet({});

    await user.click(screen.getByRole("button", { name: "Sack" }));
    await next(user);

    expect(screen.queryByRole("button", { name: "Touchdown" })).toBeNull();
  });
});
