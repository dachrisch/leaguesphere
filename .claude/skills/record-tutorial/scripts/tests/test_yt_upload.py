import base64
import json

import pytest

from yt_upload import (
    TOKEN_ENV_VAR,
    _extract_code,
    _flow,
    _seed_token_from_env,
    build_parser,
)


def test_extract_code_from_full_redirect_url():
    url = (
        "http://localhost/?state=abc&iss=https://accounts.google.com"
        "&code=4/0AXabc-_123&scope=https://www.googleapis.com/auth/youtube.upload"
    )
    assert _extract_code(url) == "4/0AXabc-_123"


def test_extract_code_accepts_a_bare_code():
    assert _extract_code("  4/0AXabc-_123  ") == "4/0AXabc-_123"


def test_extract_code_rejects_url_without_code():
    with pytest.raises(SystemExit):
        _extract_code("http://localhost/?state=abc")


def test_client_secret_is_optional_for_upload():
    args = build_parser().parse_args(["upload", "--file", "x.mp4", "--title", "t"])
    assert args.client_secret is None


def test_flow_requires_client_secret():
    with pytest.raises(SystemExit, match="client-secret"):
        _flow("")


def test_client_secret_parses_when_supplied():
    args = build_parser().parse_args(
        ["--client-secret", "s.json", "upload", "--file", "x.mp4", "--title", "t"]
    )
    assert args.client_secret == "s.json"


def _b64(value) -> str:
    return base64.b64encode(json.dumps(value).encode()).decode()


def _env_token(refresh="rt-1"):
    payload = {
        "refresh_token": refresh,
        "client_id": "cid",
        "client_secret": "sec",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
    return _b64(payload)


def test_seed_ignores_absent_env(tmp_path, monkeypatch):
    monkeypatch.delenv(TOKEN_ENV_VAR, raising=False)
    token = tmp_path / "youtube_token.json"
    _seed_token_from_env(token)
    assert not token.exists()


def test_seed_ignores_empty_env(tmp_path, monkeypatch):
    monkeypatch.setenv(TOKEN_ENV_VAR, "   ")
    token = tmp_path / "youtube_token.json"
    _seed_token_from_env(token)
    assert not token.exists()


def test_seed_writes_absent_token(tmp_path, monkeypatch):
    monkeypatch.setenv(TOKEN_ENV_VAR, _env_token())
    token = tmp_path / "youtube_token.json"
    _seed_token_from_env(token)
    assert json.loads(token.read_text())["refresh_token"] == "rt-1"
    assert (token.stat().st_mode & 0o777) == 0o600


def test_seed_preserves_refreshed_token(tmp_path, monkeypatch):
    token = tmp_path / "youtube_token.json"
    token.write_text(json.dumps({"refresh_token": "rt-1", "token": "fresh-access"}))
    monkeypatch.setenv(TOKEN_ENV_VAR, _env_token(refresh="rt-1"))
    _seed_token_from_env(token)
    assert json.loads(token.read_text())["token"] == "fresh-access"


def test_seed_overwrites_rotated_token(tmp_path, monkeypatch):
    token = tmp_path / "youtube_token.json"
    token.write_text(json.dumps({"refresh_token": "old"}))
    monkeypatch.setenv(TOKEN_ENV_VAR, _env_token(refresh="new"))
    _seed_token_from_env(token)
    assert json.loads(token.read_text())["refresh_token"] == "new"


def test_seed_overwrites_malformed_on_disk(tmp_path, monkeypatch):
    token = tmp_path / "youtube_token.json"
    token.write_text("{not valid json")
    monkeypatch.setenv(TOKEN_ENV_VAR, _env_token())
    _seed_token_from_env(token)
    assert json.loads(token.read_text())["refresh_token"] == "rt-1"


def test_seed_rejects_bad_base64(tmp_path, monkeypatch):
    monkeypatch.setenv(TOKEN_ENV_VAR, "!!!not-base64!!!")
    with pytest.raises(SystemExit):
        _seed_token_from_env(tmp_path / "youtube_token.json")


def test_seed_rejects_non_object_json(tmp_path, monkeypatch):
    monkeypatch.setenv(TOKEN_ENV_VAR, _b64([1, 2]))
    with pytest.raises(SystemExit):
        _seed_token_from_env(tmp_path / "youtube_token.json")


def test_seed_rejects_non_object_json_when_file_exists(tmp_path, monkeypatch):
    token = tmp_path / "youtube_token.json"
    token.write_text(json.dumps({"refresh_token": "rt-1"}))
    monkeypatch.setenv(TOKEN_ENV_VAR, _b64("str"))
    with pytest.raises(SystemExit):
        _seed_token_from_env(token)
