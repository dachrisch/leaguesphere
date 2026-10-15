#!/usr/bin/env python3
"""Upload rendered tutorial videos to YouTube.

Complements the record-tutorial skill: after ``slideshow.render`` produces a
silent captioned .mp4, this pushes it to the channel.

Auth is an OAuth *installed-app* flow in two manual steps (the agent cannot
click through Google's consent screen for you):

    python yt_upload.py auth  --client-secret <client_secret.json>
    # open the printed URL, grant access, copy the code (or the whole
    # http://localhost/?code=... redirect URL)
    python yt_upload.py upload --client-secret <client_secret.json> \\
        --file ~/leaguesphere-tutorials/share-widget.mp4 \\
        --title "..." --description "..." --tags help,tutorial

The refresh token lives at ``~/.config/leaguesphere/youtube_token.json`` (default;
override with ``--token``). It can be seeded from the ``YOUTUBE_OAUTH_TOKEN_B64``
environment variable, so later uploads need no browser.

Requires: google-api-python-client google-auth-oauthlib google-auth-httplib2
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
]
REDIRECT_URI = "http://localhost"
DEFAULT_TOKEN = Path.home() / ".config" / "leaguesphere" / "youtube_token.json"
LEAGUESPHERE_CATEGORY_ID = "17"  # Sports


def _flow(client_secret: str):
    if not client_secret:
        raise SystemExit("--client-secret is required for the interactive auth flow.")

    from google_auth_oauthlib.flow import InstalledAppFlow

    # PKCE is off: this flow is split across two separate CLI invocations
    # (auth prints the URL, upload exchanges the code), and the code_verifier
    # is not persisted between them. A desktop client with a client_secret and
    # a localhost redirect does not require PKCE.
    flow = InstalledAppFlow.from_client_secrets_file(
        client_secret, SCOPES, autogenerate_code_verifier=False
    )
    # The registered Desktop client redirect is exactly http://localhost.
    flow.redirect_uri = REDIRECT_URI
    return flow


def _extract_code(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("http"):
        parsed = parse_qs(urlparse(raw).query)
        if "code" not in parsed:
            raise SystemExit("Redirect URL contains no 'code' parameter.")
        return parsed["code"][0]
    return raw


def cmd_auth(args) -> int:
    flow = _flow(args.client_secret)
    url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    print(url)
    return 0


def _save_token(token_path: Path, creds) -> None:
    """Write the token JSON with owner-only permissions (0600).

    The file holds a channel refresh token with upload scope, so it must not be
    world-readable (the default umask would otherwise create it 0644).
    """
    token_path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(token_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(creds.to_json())


def _credentials(args):
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request

    token_path = Path(args.token)
    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            _save_token(token_path, creds)
        if creds and creds.valid:
            return creds

    if not args.code:
        raise SystemExit(
            "No valid token and no --code given. Run `auth` first, then pass --code."
        )
    flow = _flow(args.client_secret)
    flow.fetch_token(code=_extract_code(args.code))
    creds = flow.credentials
    _save_token(token_path, creds)
    print(f"Saved token to {token_path}", file=sys.stderr)
    return creds


def _youtube(creds):
    from googleapiclient.discovery import build

    return build("youtube", "v3", credentials=creds)


def cmd_channel(args) -> int:
    yt = _youtube(_credentials(args))
    resp = yt.channels().list(part="snippet", mine=True).execute()
    items = resp.get("items", [])
    if not items:
        print("No channel found for this account.")
        return 1
    for item in items:
        print(f"{item['id']}\t{item['snippet']['title']}")
    return 0


def cmd_upload(args) -> int:
    from googleapiclient.http import MediaFileUpload

    path = Path(args.file).expanduser()
    if not path.is_file():
        raise SystemExit(f"Video not found: {path}")

    yt = _youtube(_credentials(args))
    body = {
        "snippet": {
            "title": args.title,
            "description": args.description,
            "tags": [t for t in (args.tags or "").split(",") if t],
            "categoryId": args.category,
        },
        "status": {
            "privacyStatus": args.privacy,
            "selfDeclaredMadeForKids": False,
            "embeddable": True,
        },
    }
    media = MediaFileUpload(str(path), mimetype="video/mp4", resumable=True)
    request = yt.videos().insert(part="snippet,status", body=body, media_body=media)

    response = None
    while response is None:
        status, response = request.next_chunk()
        if status:
            print(f"  uploaded {int(status.progress() * 100)}%", file=sys.stderr)

    video_id = response["id"]
    print(video_id)
    print(f"https://www.youtube.com/embed/{video_id}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client-secret")
    parser.add_argument("--token", default=str(DEFAULT_TOKEN))
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("auth", help="print the Google consent URL to open")

    p_channel = sub.add_parser("channel", help="print the authenticated channel(s)")
    p_channel.add_argument("--code", help="authorization code (first run only)")

    p_upload = sub.add_parser("upload", help="upload one video")
    p_upload.add_argument("--file", required=True)
    p_upload.add_argument("--title", required=True)
    p_upload.add_argument("--description", default="")
    p_upload.add_argument("--tags", default="")
    p_upload.add_argument("--privacy", default="unlisted", choices=["private", "unlisted", "public"])
    p_upload.add_argument("--category", default=LEAGUESPHERE_CATEGORY_ID)
    p_upload.add_argument("--code", help="authorization code (first run only)")
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    return {"auth": cmd_auth, "channel": cmd_channel, "upload": cmd_upload}[args.command](args)


if __name__ == "__main__":
    raise SystemExit(main())
