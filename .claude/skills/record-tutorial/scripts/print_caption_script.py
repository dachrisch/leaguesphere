#!/usr/bin/env python3
"""CLI: print the caption-overlay JS snippet for a given caption, or --clear."""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from caption_overlay import build_caption_script, build_clear_script  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--caption", help="Caption text to show")
    group.add_argument("--clear", action="store_true", help="Print the script that removes the overlay")
    args = parser.parse_args()
    print(build_clear_script() if args.clear else build_caption_script(args.caption))


if __name__ == "__main__":
    main()
