#!/usr/bin/env python3
"""SSE load test for the liveticker stream.

Opens N concurrent ``EventSource``-equivalent connections (plain HTTP with
``Accept: text/event-stream``), measures how long the first snapshot takes, and
-- if you give it a command that writes an event -- the end-to-end latency from
"the writer finished" to "the snapshot reached every client".

Run it against stage only, never against anything production-like:

    pip install httpx            # or: uv run --with httpx sse_stream_load.py ...
    python tests/load/sse_stream_load.py \
        --url https://stage.leaguesphere.app/api/liveticker/stream/?results=all \
        --clients 200 \
        --duration 60 \
        --change-command "docker exec leaguesphere_stage.staging-app python manage.py shell -c '...'"

The change command runs once, ``--change-at`` seconds after the first client
received its snapshot. Without it the script only reports connect/first-snapshot stats and
connection stability.

No server is started or modified by this file. It exists so the owner can
measure the deployment; CI never runs it.
"""

import argparse
import asyncio
import time

import httpx

SNAPSHOT_EVENT = "snapshot"


def percentile(values, fraction):
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round(fraction * (len(ordered) - 1))))
    return ordered[index]


def summarise(name, values, unit="s"):
    if not values:
        print(f"{name}: no samples")
        return
    print(
        f"{name}: n={len(values)} "
        f"p50={percentile(values, 0.5):.3f}{unit} "
        f"p95={percentile(values, 0.95):.3f}{unit} "
        f"max={max(values):.3f}{unit} "
        f"mean={sum(values) / len(values):.3f}{unit}"
    )


async def read_snapshot(lines):
    """Next snapshot frame: ``(event_id, arrived_at)``; heartbeats skipped."""
    event_id = None
    saw_data = False
    while True:
        line = await lines.__anext__()
        if line.startswith("id: "):
            event_id = line[4:]
        elif line.startswith("data: "):
            saw_data = True
        elif line == "" and saw_data:
            return event_id, time.monotonic()


async def client(client_id, url, ready, change_done, timeout, keepalive):
    record = {
        "id": client_id,
        "connected": False,
        "first_snapshot": None,
        "change_latency": None,
        "error": None,
        "disconnected": False,
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, read=None)) as http:
            started = time.monotonic()
            async with http.stream(
                "GET", url, headers={"Accept": "text/event-stream"}
            ) as response:
                if response.status_code != 200:
                    record["error"] = f"HTTP {response.status_code}"
                    return record
                record["connected"] = True
                lines = response.aiter_lines()
                event_id, arrived = await read_snapshot(lines)
                record["first_snapshot"] = arrived - started
                ready.set()

                baseline = event_id
                deadline = time.monotonic() + keepalive
                while time.monotonic() < deadline:
                    event_id, arrived = await read_snapshot(lines)
                    if event_id != baseline and change_done.is_set():
                        record["change_latency"] = arrived - change_done.time
                        return record
                    baseline = event_id
                return record
    except asyncio.TimeoutError:
        record["error"] = "timeout"
    except Exception as error:  # noqa: BLE001 - load tool: report, never crash
        record["error"] = f"{type(error).__name__}: {error}"
    finally:
        if record["connected"] and record["change_latency"] is None:
            record["disconnected"] = True
    return record


class ChangeSignal:
    """Event with a timestamp of when the writer command returned."""

    def __init__(self):
        self._event = asyncio.Event()
        self.time = None

    def is_set(self):
        return self._event.is_set()

    async def wait(self):
        await self._event.wait()

    def set(self):
        self.time = time.monotonic()
        self._event.set()


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--clients", type=int, default=50)
    parser.add_argument("--duration", type=float, default=60.0)
    parser.add_argument("--connect-timeout", type=float, default=15.0)
    parser.add_argument("--change-command", default=None)
    parser.add_argument("--change-at", type=float, default=10.0)
    args = parser.parse_args()

    ready = asyncio.Event()
    change_done = ChangeSignal()
    waiting_for_change = bool(args.change_command)

    clients = [
        asyncio.create_task(
            client(
                index, args.url, ready, change_done, args.connect_timeout, args.duration
            )
        )
        for index in range(args.clients)
    ]

    if waiting_for_change:
        await asyncio.wait_for(ready.wait(), args.connect_timeout)
        await asyncio.sleep(args.change_at)
        print(f"running change command {args.change_at:.0f}s after the first snapshot")
        process = await asyncio.create_subprocess_shell(args.change_command)
        await process.wait()
        change_done.set()
        print(f"change command exited with {process.returncode}")

    records = await asyncio.gather(*clients)

    connected = [record for record in records if record["connected"]]
    failed = [record for record in records if not record["connected"]]
    first = [
        record["first_snapshot"] for record in connected if record["first_snapshot"]
    ]
    change = [
        record["change_latency"]
        for record in connected
        if record["change_latency"] is not None
    ]

    print()
    print(f"clients: {len(records)} requested, {len(connected)} connected")
    if failed:
        print(f"connect failures: {len(failed)} (first: {failed[0]['error']})")
    summarise("time to first snapshot", first)
    if waiting_for_change:
        summarise("latency after change", change)
    early = [record for record in connected if record["disconnected"]]
    if early:
        print(f"streams that ended without a change snapshot: {len(early)}")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
