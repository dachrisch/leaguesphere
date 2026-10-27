import { apiGet, apiGetBlobUrl, apiPut } from "./client";
import type {
  GamesResponse,
  RosterResponse,
  SaveRosterPayload,
} from "./types";

export const fetchGames = (gamedayId?: number): Promise<GamesResponse> =>
  apiGet<GamesResponse>(
    gamedayId ? `/api/passcheck/games/${gamedayId}` : "/api/passcheck/games"
  );

export const fetchRoster = (
  teamId: number,
  gamedayId: number
): Promise<RosterResponse> =>
  apiGet<RosterResponse>(
    `/api/passcheck/roster/${teamId}/gameday/${gamedayId}`
  );

export const saveRoster = (
  teamId: number,
  gamedayId: number,
  payload: SaveRosterPayload
): Promise<void> =>
  apiPut<void>(
    `/api/passcheck/roster/${teamId}/gameday/${gamedayId}`,
    payload
  );

/** The photo endpoint is Knox-protected; the caller gets an object URL. */
export const fetchPhotoUrl = (
  playerlistId: number,
  gamedayId: number
): Promise<string> =>
  apiGetBlobUrl(
    `/api/passcheck/photos/${playerlistId}/gameday/${gamedayId}`
  );
