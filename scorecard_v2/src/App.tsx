import type { Gameday } from "./api/types";
import GamedayList from "./screens/GamedayList";

/**
 * Task 21 wires the gameday data and routes to the game list; until then the
 * shell renders the (empty) gameday screen so the build and layout are real.
 */
function handleSelect(gameday: Gameday): void {
  void gameday;
}

export default function App() {
  return <GamedayList gamedays={[]} onSelect={handleSelect} />;
}
