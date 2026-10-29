/**
 * Client-generated ids for queued writes.
 *
 * The id becomes the `client_id` the server dedupes a log write on, so it has
 * to be a real UUID and it has to exist *before* the first attempt (a write
 * whose answer was lost must be replayed with the same id).
 *
 * `crypto.randomUUID()` needs a secure context; a field device on a plain-HTTP
 * staging host would otherwise fail to record anything. The fallback is
 * UUID-shaped but not cryptographic — it only has to be unique.
 */

function randomHex(length: number): string {
  let value = "";
  while (value.length < length) {
    value += Math.floor(Math.random() * 16).toString(16);
  }
  return value.slice(0, length);
}

export function newOpId(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto !== undefined && typeof webCrypto.randomUUID === "function") {
    return webCrypto.randomUUID();
  }
  const stamp = Date.now().toString(16).padStart(8, "0").slice(-8);
  return [
    stamp,
    randomHex(4),
    `4${randomHex(3)}`,
    `a${randomHex(3)}`,
    randomHex(12),
  ].join("-");
}
