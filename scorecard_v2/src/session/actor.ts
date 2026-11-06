/**
 * The username of the official signed in to this tab.
 *
 * The outbox is written from `GameSession`, which has no React context: it
 * needs the name at enqueue time to say who *recorded* an entry that may only
 * be sent after someone else logs in. `App` sets it once the session user is
 * known; an offline boot reads the same user from the snapshot.
 *
 * This is a claim, not an authorisation: the server keeps `request.user` as
 * the event's author and only records this name as `offline_recorded_by` when
 * it differs. A client can therefore never attribute a write to someone else.
 */
let username: string | null = null;

export function setActorUsername(name: string | null | undefined): void {
  const trimmed = name?.trim() ?? "";
  username = trimmed === "" ? null : trimmed;
}

export function getActorUsername(): string | null {
  return username;
}
