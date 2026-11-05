import { useEffect, useMemo, useRef, useState } from "react";

import type { GameRules } from "../../api/rules";
import type { GameLogEventInput, Penalty, RosterPlayer } from "../../api/types";
import type { PenaltyNextDown } from "../../app/drive";
import { cachedGet, snapshotKey } from "../../offline/snapshot";
import type { LogRow } from "../EventLog";
import JerseyPicker, { jerseyOptions } from "../JerseyPicker";
import { errorMessage } from "./errors";
import Sheet from "./Sheet";
import { yardsValue } from "./yards";

/** How many penalties the collapsed list shows — v1's suggestion-box limit. */
export const PENALTY_PAGE = 5;

const PENALTIES_PATH = "/api/config/scorecard/penalties";

/** The most common penalties keep their configured order at the top. */
export function orderPenalties(
  penalties: Penalty[],
  search: string,
): Penalty[] {
  const matches = filterPenalties(penalties, search);
  if (search.trim() !== "") {
    return [...matches].sort(byName);
  }
  const head = matches.slice(0, PENALTY_PAGE);
  const tail = matches.slice(PENALTY_PAGE).sort(byName);
  return [...head, ...tail];
}

function byName(left: Penalty, right: Penalty): number {
  return left.name.localeCompare(right.name, "de", { sensitivity: "base" });
}

/**
 * Case-insensitive substring match on the penalty name.
 *
 * v1 matched character-by-character with `.*` between them, which turned a
 * single letter into "every penalty containing it somewhere" and made the
 * result depend on the order of the characters. A plain substring is what the
 * official means when they type part of the name.
 */
export function filterPenalties(
  penalties: Penalty[],
  search: string,
): Penalty[] {
  const needle = search.trim().toLowerCase();
  if (needle === "") {
    return penalties;
  }
  return penalties.filter((penalty) =>
    penalty.name.toLowerCase().includes(needle),
  );
}

/**
 * The team a penalty is charged to: the opponent when
 * `isPenaltyAgainstOpponent` says the defense committed it, otherwise the
 * possessing team.
 *
 * The flag only supplies the **default**; the official can charge either team
 * afterwards. Nothing re-derives the team from the flag after that.
 */
export function penaltyTeam(
  penalty: Penalty | null,
  teamName: string,
  opponentName: string,
): string | null {
  if (penalty === null) {
    return null;
  }
  return penalty.isPenaltyAgainstOpponent ? opponentName : teamName;
}

/**
 * The yardage the catalogue's `subtext` suggests, signed from the offence's
 * view. A defense penalty gains yards (`BS/1st 10` → +10); an offence penalty
 * loses them (`SF/LoD 5` → -5). No number means no spot change.
 */
export function penaltyYardage(penalty: Penalty): number {
  const magnitude = yardageMagnitude(penalty);
  if (magnitude === 0) {
    return 0;
  }
  return penalty.isPenaltyAgainstOpponent ? magnitude : -magnitude;
}

/**
 * The distance the catalogue suggests, in yards.
 *
 * The definition carries it (`yards`) - including `0` for a foul that only
 * costs a down. An older server has only `subtext`, so the parse stays as the
 * fallback and the sheet behaves exactly as before against it.
 */
function yardageMagnitude(penalty: Penalty): number {
  if (typeof penalty.yards === "number" && Number.isFinite(penalty.yards)) {
    return Math.abs(penalty.yards);
  }
  const match = /(\d+)(?!st)/.exec(penalty.subtext);
  return match === null ? 0 : Number(match[1]);
}

/** The down rule the definition (or, on an older server, `subtext`) gives. */
export function penaltyNextDown(penalty: Penalty): PenaltyNextDown {
  if (penalty.down === "first") {
    return "first_down";
  }
  if (penalty.down === "loss") {
    return "loss_of_down";
  }
  if (penalty.down === "repeat") {
    return "repeat";
  }
  const text = penalty.subtext.toLowerCase();
  if (/\b1st\b/.test(text)) {
    return "first_down";
  }
  if (text.includes("lod")) {
    return "loss_of_down";
  }
  return "repeat";
}

/**
 * What the entry needs beyond the penalty itself.
 *
 * A disqualification (`subtext`/name) must name the player. Unsportsmanlike
 * conduct tracks the numbers as free text because one call can name several
 * people; two UNV against the same number disqualify that person.
 */
export type PenaltyKind = "normal" | "unsportsmanlike" | "disqualification";

export function penaltyKind(penalty: Penalty): PenaltyKind {
  const text = `${penalty.name} ${penalty.subtext}`.toLowerCase();
  if (text.includes("disqualif")) {
    return "disqualification";
  }
  if (text.includes("unsportliches verhalten") && !text.includes("grob")) {
    return "unsportsmanlike";
  }
  return "normal";
}

/** One recorded UNV, as the sheet shows it before the next call. */
export interface UnsportsmanlikeRecord {
  team: string | null;
  half: number;
  /** The free text exactly as entered, or the old single jersey. */
  text: string;
  numbers: number[];
}

/** Every two-digit number in a free-text UNV note, unique and in order. */
export function numbersFromText(text: string): number[] {
  const numbers: number[] = [];
  for (const match of text.matchAll(/\d+/g)) {
    const number = Number(match[0]);
    if (number >= 0 && number <= 99 && !numbers.includes(number)) {
      numbers.push(number);
    }
  }
  return numbers;
}

function isUnsportsmanlikeName(name: string | null): boolean {
  if (name === null) {
    return false;
  }
  const text = name.toLowerCase();
  return text.includes("unsportliches verhalten") && !text.includes("grob");
}

/**
 * A `Strafe` row as one UNV record, or `null` for every other row.
 *
 * The old app stored a single `player`; newer rows carry the free text in
 * `payload.unsportsmanlike`. Reading both keeps a game that was started on the
 * previous build usable after the update.
 */
export function unsportsmanlikeRecord(row: LogRow): UnsportsmanlikeRecord | null {
  if (row.isDeleted || row.event !== "Strafe" || !isUnsportsmanlikeName(row.input)) {
    return null;
  }
  const raw = row.payload?.unsportsmanlike;
  const text =
    typeof raw === "string"
      ? raw.trim()
      : row.player === null
        ? ""
        : String(row.player);
  return {
    team: row.team,
    half: row.half,
    text,
    numbers: numbersFromText(text),
  };
}

/**
 * Payload of one penalty: the event name is always `Strafe`, the picked
 * penalty travels as `input`, and the jersey is optional ("ganzes Team").
 *
 * `yardage` is signed from the offence's view and `nextDown` is one of
 * `repeat`, `first_down` or `loss_of_down`; the drive engine reads both.
 * `unsportsmanlike` is the optional free-text number list of one UNV entry.
 */
export function penaltyEvent(
  name: string,
  jersey: number | null,
  yardage: number,
  nextDown: PenaltyNextDown,
  unsportsmanlike = "",
): GameLogEventInput {
  const event: GameLogEventInput = {
    name: "Strafe",
    input: name,
    payload: { yardage, nextDown },
  };
  const note = unsportsmanlike.trim();
  if (note !== "") {
    (event.payload as Record<string, unknown>).unsportsmanlike = note;
  }
  if (jersey !== null) {
    event.player = jersey;
  }
  return event;
}

interface PenaltySheetProps {
  /** Possession team — the write's team unless the official overrides it. */
  teamName: string;
  /** The other team; the default for a defense penalty. */
  opponentName: string;
  /** Side of the possession team. */
  side: RosterPlayer["side"];
  /**
   * Both sides as loaded from `GET /api/game/<id>/roster`, `null` while the
   * request is still running. The jersey chips follow the **picked** team.
   */
  roster: RosterPlayer[] | null;
  /**
   * Every UNV already on the board, both teams. The sheet filters it to the
   * team the new penalty is charged to and warns when that call is the second
   * UNV for a number.
   */
  history?: UnsportsmanlikeRecord[];
  /**
   * The sport definition, so the catalogue's yardages and down rules come
   * from the rulebook rather than from parsing `subtext`. Optional: the sheet
   * still works while it is loading or missing.
   */
  rules?: GameRules | null;
  /**
   * Writes the event for the picked team and resolves once the server
   * answered. Rejects on failure — the sheet stays open and shows the message.
   */
  onSubmit: (events: GameLogEventInput[], team: string) => Promise<void>;
  onClose: () => void;
}

const NEXT_DOWN_LABELS: Record<PenaltyNextDown, string> = {
  repeat: "Wiederholung",
  first_down: "First Down",
  loss_of_down: "Loss of Down",
};

/**
 * Penalty entry: which penalty, against whom, how many yards, which down
 * follows, optionally which player.
 *
 * The catalogue is configuration, not game data, so the sheet loads it itself
 * when it opens — the tracking screen stays about one game. Until it settles
 * the list shows a loading note instead of an empty "no penalties" list that
 * would read as a server without penalties.
 *
 * The team picker starts empty and is filled from the selected penalty's
 * `isPenaltyAgainstOpponent` flag. Once the official picks a team by hand the
 * flag no longer moves it: the flag is a default, not a mapping. A jersey of
 * the previously picked team is dropped when the team changes, so a Ravens
 * number can never be sent with Wolves.
 *
 * Yardage and the next-down rule are prefilled from the catalogue's `subtext`
 * (`1st 10` → first down, `LoD 5` → loss of down, otherwise repeat), and both
 * stay editable: the official knows whether the spot really moves.
 */
export default function PenaltySheet({
  teamName,
  opponentName,
  side,
  roster,
  history = [],
  rules = null,
  onSubmit,
  onClose,
}: PenaltySheetProps) {
  const [penalties, setPenalties] = useState<Penalty[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Penalty | null>(null);
  const [team, setTeam] = useState<string | null>(null);
  // Set by a manual team choice: from then on a new penalty no longer
  // re-defaults the team.
  const [teamPicked, setTeamPicked] = useState(false);
  const [yardageText, setYardageText] = useState("0");
  const [yardageLoss, setYardageLoss] = useState(false);
  const [nextDown, setNextDown] = useState<PenaltyNextDown>("repeat");
  const [jersey, setJersey] = useState<number | null>(null);
  const [unsportsmanlike, setUnsportsmanlike] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // See TouchdownSheet: two synchronous taps must not both reach onSubmit.
  const saving = useRef(false);

  useEffect(() => {
    let active = true;
    // Preloaded: the penalty catalogue is the one list the sheet needs with no
    // network, and it rarely changes.
    cachedGet<Penalty[]>(snapshotKey.penalties(), PENALTIES_PATH)
      .then((list) => {
        if (active) {
          setPenalties(list ?? []);
        }
      })
      .catch((failure: unknown) => {
        if (!active) {
          return;
        }
        setPenalties([]);
        setLoadError(
          errorMessage(
            failure,
            "Die Strafen konnten nicht geladen werden. Bitte erneut versuchen.",
          ),
        );
      });
    return () => {
      active = false;
    };
  }, []);

  /**
   * The list the sheet offers: the definition's rows when the screen has
   * them, the legacy `/penalties` answer otherwise. Same names and order, so
   * a game started on either build is corrected with the same words.
   */
  const catalogue = useMemo<Penalty[] | null>(() => {
    if (rules === null) {
      return penalties;
    }
    return rules.penalties.map((row) => ({
      name: row.name,
      subtext: row.subtext,
      isPenaltyAgainstOpponent: row.side === "defense",
      yards: row.yards,
      down: row.down,
      enforcement: row.enforcement,
      rule: row.rule,
    }));
  }, [penalties, rules]);
  const loading = catalogue === null;
  const matches = orderPenalties(catalogue ?? [], search);
  const visible = expanded ? matches : matches.slice(0, PENALTY_PAGE);
  const hidden = matches.length - visible.length;

  const yardageMagnitude = yardsValue(yardageText);
  const yardage =
    yardageMagnitude === null
      ? null
      : yardageLoss
        ? -Math.abs(yardageMagnitude)
        : yardageMagnitude;

  const otherSide: RosterPlayer["side"] = side === "home" ? "away" : "home";
  const jerseySide = team === opponentName ? otherSide : side;
  const players =
    roster === null
      ? []
      : roster.filter((player) => player.side === jerseySide);
  const options = jerseyOptions(players);

  const kind = selected === null ? "normal" : penaltyKind(selected);
  const missingJersey = kind === "disqualification" && jersey === null;
  const teamHistory =
    team === null ? [] : history.filter((entry) => entry.team === team);
  const currentNumbers = numbersFromText(unsportsmanlike);
  const repeatedUnsportsmanlike = currentNumbers
    .map((number) => ({
      number,
      prior: teamHistory.filter((entry) => entry.numbers.includes(number))
        .length,
    }))
    .filter((entry) => entry.prior > 0);

  const ready =
    team !== null &&
    selected !== null &&
    yardage !== null &&
    !missingJersey &&
    !posting;

  const pickTeam = (name: string): void => {
    setTeam(name);
    setTeamPicked(true);
    const nextSide = name === opponentName ? otherSide : side;
    setJersey((current) =>
      current === null
        ? null
        : (roster ?? []).some(
              (player) =>
                player.side === nextSide && player.jersey === current,
            )
          ? current
          : null,
    );
  };

  const pickPenalty = (penalty: Penalty): void => {
    setSelected(penalty);
    if (!teamPicked) {
      setTeam(penaltyTeam(penalty, teamName, opponentName));
    }
    // The roster changed with the team the flag implies; a number meant for
    // the other side must not survive.
    setJersey(null);
    setUnsportsmanlike("");
    const suggested = penaltyYardage(penalty);
    setYardageText(String(Math.abs(suggested)));
    setYardageLoss(suggested < 0);
    setNextDown(penaltyNextDown(penalty));
  };

  /** A typed minus marks a loss; the touch switch sets the same flag. */
  const changeYardage = (raw: string): void => {
    if (raw.includes("-")) {
      setYardageLoss(true);
    }
    setYardageText(raw.replace(/-/g, ""));
  };

  const save = async (): Promise<void> => {
    if (saving.current || !ready || selected === null || team === null) {
      return;
    }
    if (yardage === null) {
      return;
    }
    saving.current = true;
    setPosting(true);
    setError(null);
    try {
      await onSubmit(
        [
          penaltyEvent(
            selected.name,
            jersey,
            yardage,
            nextDown,
            kind === "unsportsmanlike" ? unsportsmanlike : "",
          ),
        ],
        team,
      );
      onClose();
    } catch (failure) {
      saving.current = false;
      setPosting(false);
      setError(
        errorMessage(
          failure,
          "Die Strafe konnte nicht gespeichert werden. Bitte erneut versuchen.",
        ),
      );
    }
  };

  return (
    <Sheet
      busy={posting}
      error={error}
      footer={
        <button
          className="startbtn"
          disabled={!ready}
          onClick={() => void save()}
          type="button"
        >
          {posting
            ? "Speichern …"
            : selected === null
              ? "Strafe wählen"
              : team === null
                ? "Team wählen"
                : missingJersey
                  ? "Nummer wählen"
                  : "Speichern"}
        </button>
      }
      onClose={onClose}
      title="Strafe"
    >
      <h3 className="sheetsection">Strafe suchen</h3>
      <input
        aria-label="Strafe suchen"
        autoComplete="off"
        className="sheetinput"
        disabled={posting}
        onChange={(event) => {
          setSearch(event.target.value);
          setExpanded(false);
        }}
        placeholder="Strafe eingeben …"
        type="search"
        value={search}
      />
      {loading ? (
        <p className="sheetnote" role="status">
          Strafen laden …
        </p>
      ) : loadError !== null ? (
        <p className="sheetwarn" role="alert">
          {loadError}
        </p>
      ) : matches.length === 0 ? (
        <p className="sheetnote" role="status">
          Keine Strafe gefunden.
        </p>
      ) : (
        <div aria-label="Strafen" className="penaltylist" role="group">
          {visible.map((penalty) => {
            const chosen = selected !== null && selected.name === penalty.name;
            return (
              <button
                aria-pressed={chosen}
                className={chosen ? "penalty sel" : "penalty"}
                disabled={posting}
                key={penalty.name}
                onClick={() => pickPenalty(penalty)}
                type="button"
              >
                <span className="penaltyname">{penalty.name}</span>
                <span className="penaltysub">{penalty.subtext}</span>
              </button>
            );
          })}
          {hidden > 0 ? (
            <button
              className="penaltymore"
              disabled={posting}
              onClick={() => setExpanded(true)}
              type="button"
            >
              Alle {matches.length} Strafen anzeigen
            </button>
          ) : null}
        </div>
      )}

      <h3 className="sheetsection">Gegen wen?</h3>
      <div aria-label="Gegen wen?" className="teampick" role="group">
        <button
          aria-pressed={team === teamName}
          className={team === teamName ? "teampickbtn sel" : "teampickbtn"}
          disabled={posting}
          onClick={() => pickTeam(teamName)}
          type="button"
        >
          {teamName}
        </button>
        <button
          aria-pressed={team === opponentName}
          className={team === opponentName ? "teampickbtn sel" : "teampickbtn"}
          disabled={posting}
          onClick={() => pickTeam(opponentName)}
          type="button"
        >
          {opponentName}
        </button>
      </div>

      <h3 className="sheetsection">Raumgewinn der Strafe (Yards)</h3>
      <div aria-label="Raumrichtung" className="seg" role="group">
        <button
          aria-pressed={!yardageLoss}
          className={!yardageLoss ? "sel" : undefined}
          disabled={posting}
          onClick={() => setYardageLoss(false)}
          type="button"
        >
          Gewinn
        </button>
        <button
          aria-pressed={yardageLoss}
          className={yardageLoss ? "sel" : undefined}
          disabled={posting}
          onClick={() => setYardageLoss(true)}
          type="button"
        >
          Verlust
        </button>
      </div>
      <div className="sheetfield">
        <label className="sheetlabel" htmlFor="penalty-yards">
          Yardage (0–99)
        </label>
        <input
          autoComplete="off"
          className="sheetinput sheetinput-num"
          disabled={posting}
          id="penalty-yards"
          inputMode="numeric"
          onChange={(event) => changeYardage(event.target.value)}
          pattern="[0-9]*"
          type="text"
          value={yardageText}
        />
      </div>

      <h3 className="sheetsection">Nächster Versuch</h3>
      <div aria-label="Nächster Versuch" className="seg seg-three" role="group">
        {(Object.keys(NEXT_DOWN_LABELS) as PenaltyNextDown[]).map((value) => (
          <button
            aria-pressed={nextDown === value}
            className={nextDown === value ? "sel" : undefined}
            disabled={posting}
            key={value}
            onClick={() => setNextDown(value)}
            type="button"
          >
            {NEXT_DOWN_LABELS[value]}
          </button>
        ))}
      </div>

      {kind === "unsportsmanlike" ? (
        <>
          <h3 className="sheetsection">Trikotnummer(n) (optional)</h3>
          <div className="sheetfield">
            <label className="sheetlabel" htmlFor="penalty-unsportsmanlike">
              Nummern als Freitext
            </label>
            <input
              autoComplete="off"
              className="sheetinput"
              disabled={posting}
              id="penalty-unsportsmanlike"
              onChange={(event) => setUnsportsmanlike(event.target.value)}
              placeholder="z. B. 12, 7 oder 12 7"
              type="text"
              value={unsportsmanlike}
            />
          </div>
          <p className="sheetnote">
            Mehrere Nummern mit Komma oder Leerzeichen. Zwei UNV derselben
            Nummer bedeuten automatisch Disqualifikation.
          </p>
          {team === null ? null : teamHistory.length === 0 ? (
            <p className="sheetnote">
              Noch kein Unsportliches Verhalten für {team} erfasst.
            </p>
          ) : (
            <div className="unsportlist">
              <h4 className="unsportlist-title">Bisher für {team}</h4>
              <ul>
                {teamHistory.map((entry, index) => (
                  <li key={`${entry.half}-${index}`}>
                    Halbzeit {entry.half}:{" "}
                    {entry.text === "" ? "ohne Nummer" : `Nr. ${entry.text}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {repeatedUnsportsmanlike.length === 0 ? null : (
            <p className="sheetwarn" role="alert">
              {repeatedUnsportsmanlike
                .map(
                  (entry) =>
                    `Nr. ${entry.number} hat bereits ${entry.prior} UNV – dieser Eintrag wäre der ${entry.prior + 1}.`,
                )
                .join(" ")}{" "}
              Damit ist die Person automatisch disqualifiziert.
            </p>
          )}
        </>
      ) : (
        <>
          <h3 className="sheetsection">
            {kind === "disqualification"
              ? "Trikotnummer (Pflicht)"
              : "Trikotnummer (optional)"}
          </h3>
          {missingJersey ? (
            <p className="sheetwarn" role="alert">
              Bei einer Disqualifikation ist die Trikotnummer Pflicht.
            </p>
          ) : null}
          {roster === null && kind !== "disqualification" ? (
            <p className="sheetnote" role="status">
              Kader lädt …
            </p>
          ) : roster !== null &&
            options.length === 0 &&
            kind !== "disqualification" ? (
            <p className="sheetnote">
              Kein Kader geladen – die Strafe wird für das ganze Team
              gespeichert.
            </p>
          ) : (
            <JerseyPicker
              disabled={posting}
              groupLabel={
                kind === "disqualification"
                  ? "Trikotnummer (Pflicht)"
                  : "Trikotnummer (optional)"
              }
              label="Trikot"
              onChange={setJersey}
              optionalLabel={
                kind === "disqualification" ? undefined : "Ganzes Team"
              }
              players={players}
              value={jersey}
            />
          )}
        </>
      )}

      <p className="sheetnote">
        {selected === null
          ? "Strafe auswählen."
          : `${selected.name} · gegen ${team ?? "–"} · ${yardage ?? 0} Yards · ${
              NEXT_DOWN_LABELS[nextDown]
            }${
              kind === "unsportsmanlike" && unsportsmanlike.trim() !== ""
                ? ` · Nr. ${unsportsmanlike.trim()}`
                : ""
            }`}
      </p>
    </Sheet>
  );
}
