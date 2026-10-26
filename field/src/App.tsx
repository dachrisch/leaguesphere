import { useEffect, useMemo, useState } from "react";

import { fetchPhotoUrl, fetchRoster } from "./api/passcheck";
import type {
  RosterEntry,
  RosterResponse,
  RosterWriteEntry,
} from "./api/types";
import { useVerificationSave } from "./hooks/useVerificationSave";
import { pendingCount as readPendingCount } from "./offline/outbox";
import GamesScreen from "./screens/GamesScreen";
import RosterScreen from "./screens/RosterScreen";
import DoneSheet from "./sheets/DoneSheet";
import PlayerSheet from "./sheets/PlayerSheet";
import VerificationSheet from "./sheets/VerificationSheet";

type Route =
  | { name: "games" }
  | { name: "roster"; teamId: number; gamedayId: number };

function allPlayers(roster: RosterResponse): RosterEntry[] {
  return [
    ...roster.team.roster,
    ...roster.additionalTeams.flatMap((team) => team.roster),
  ];
}

function initialGamedayId(): number | undefined {
  const value = Number(
    new URLSearchParams(window.location.search).get("gameday")
  );
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function App() {
  const [route, setRoute] = useState<Route>({ name: "games" });
  const [roster, setRoster] = useState<RosterResponse | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [numbers, setNumbers] = useState<Record<number, number>>({});
  const [player, setPlayer] = useState<RosterEntry | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);
  const [entries, setEntries] = useState<RosterWriteEntry[]>([]);
  const [showVerification, setShowVerification] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(0);

  const save = useVerificationSave(
    route.name === "roster" ? route.teamId : 0,
    route.name === "roster" ? route.gamedayId : 0
  );

  useEffect(() => {
    void readPendingCount().then(setPending);
  }, []);

  useEffect(() => {
    if (route.name !== "roster") return;
    let cancelled = false;
    setRoster(null);
    setRosterError(null);
    fetchRoster(route.teamId, route.gamedayId)
      .then((data) => {
        if (cancelled) return;
        setRoster(data);
        setCheckedIds(
          new Set(
            allPlayers(data)
              .filter((entry) => entry.isSelected)
              .map((entry) => entry.id)
          )
        );
      })
      .catch((error: { message?: string }) => {
        if (!cancelled) {
          setRosterError(error?.message ?? "Kader konnte nicht geladen werden.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [route]);

  useEffect(() => {
    if (!player || route.name !== "roster") {
      setPhotoUrl(undefined);
      setPhotoWarning(null);
      return;
    }
    let cancelled = false;
    let created: string | undefined;
    setPhotoUrl(undefined);
    setPhotoWarning(null);
    fetchPhotoUrl(player.id, route.gamedayId)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        created = url;
        setPhotoUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          setPhotoWarning("Kein Passfoto hinterlegt.");
        }
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [player, route]);

  useEffect(() => {
    if (save.state.status === "done") {
      setDone(true);
    }
    if (save.state.status === "queued") {
      setPending(1);
      setDone(true);
    }
  }, [save.state]);

  const players = useMemo(
    () => (roster ? allPlayers(roster) : []),
    [roster]
  );

  const checkedNumbers = useMemo(
    () =>
      players
        .filter((entry) => checkedIds.has(entry.id) && entry.id !== player?.id)
        .map((entry) => numbers[entry.id] ?? entry.jersey_number),
    [players, checkedIds, numbers, player]
  );

  const openRoster = (teamId: number, gamedayId: number) => {
    setRoute({ name: "roster", teamId, gamedayId });
  };

  const backToGames = () => {
    save.reset();
    setDone(false);
    setShowVerification(false);
    setPlayer(null);
    setRoster(null);
    setRosterError(null);
    setCheckedIds(new Set());
    setNumbers({});
    setEntries([]);
    setRoute({ name: "games" });
  };

  const toggle = (entry: RosterEntry) => {
    setCheckedIds((previous) => {
      const next = new Set(previous);
      if (next.has(entry.id)) {
        next.delete(entry.id);
      } else {
        next.add(entry.id);
      }
      return next;
    });
  };

  const confirmPlayer = (jersey: number) => {
    if (!player) return;
    setNumbers((previous) => ({ ...previous, [player.id]: jersey }));
    setCheckedIds((previous) => new Set(previous).add(player.id));
    setPlayer(null);
  };

  if (done && roster) {
    return (
      <main className="field-app">
        <DoneSheet
          teamName={roster.team.name}
          checkedCount={entries.length || checkedIds.size}
          pendingCount={pending}
          onBackToGames={backToGames}
        />
      </main>
    );
  }

  if (route.name === "games") {
    return (
      <main className="field-app">
        <GamesScreen onOpen={openRoster} gamedayId={initialGamedayId()} />
      </main>
    );
  }

  if (rosterError) {
    return (
      <main className="field-app">
        <p role="alert">{rosterError}</p>
        <button type="button" className="sheet-secondary" onClick={backToGames}>
          Zurück zu den Spielen
        </button>
      </main>
    );
  }

  if (!roster) {
    return (
      <main className="field-app">
        <p>loading...</p>
      </main>
    );
  }

  return (
    <main className="field-app">
      <RosterScreen
        roster={roster}
        checkedIds={checkedIds}
        onToggle={toggle}
        onOpenPlayer={setPlayer}
        jerseyOverrides={numbers}
        pendingCount={pending}
        onBack={backToGames}
        onFinalize={(nextEntries) => {
          setEntries(nextEntries);
          setShowVerification(true);
        }}
      />

      {player && (
        <PlayerSheet
          player={player}
          teamName={roster.team.name}
          checkedNumbers={checkedNumbers}
          initialJersey={numbers[player.id] ?? player.jersey_number}
          warnings={photoWarning ? [photoWarning] : []}
          photoUrl={photoUrl}
          onConfirm={confirmPlayer}
          onClose={() => setPlayer(null)}
        />
      )}

      {showVerification && (
        <VerificationSheet
          teamName={roster.team.name}
          checkedCount={entries.length}
          minimumStrength={
            roster.team.validator.minimum_player_strength ?? 0
          }
          initialOfficialName={roster.official_name}
          initialNote={roster.note ?? ""}
          errors={
            save.state.status === "error" ? save.state.errors : undefined
          }
          conflict={
            save.state.status === "error" ? save.state.conflict : null
          }
          saving={save.state.status === "saving"}
          pendingCount={pending}
          onSave={(officialName, note) => {
            void save.save({ officialName, note, entries });
          }}
          onClose={() => setShowVerification(false)}
        />
      )}
    </main>
  );
}

export default App;
