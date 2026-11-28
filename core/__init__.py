"""Shared kernel: framework helpers every app may use.

Rule: ``core`` imports nothing from the project's apps (no ``gamedays``,
no ``league_manager``). Apps import ``core``; ``league_manager`` is the
composition root (settings, root URLs, sitemaps, seed commands) and is
imported by no app. Enforced by import-linter (architecture scan
2026-11-28, B1).
"""
