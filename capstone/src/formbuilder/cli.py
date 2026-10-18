"""Command-line entry point. Real commands arrive in m6-l06."""

import sys

from formbuilder import __version__

USAGE = "usage: formbuilder [--help] [--version]  (stub: commands arrive in m6-l06)"


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if args in ([], ["--help"]):
        print(USAGE)
        return 0
    if args == ["--version"]:
        print(f"formbuilder {__version__}")
        return 0
    print(f"formbuilder: unknown arguments: {' '.join(args)}", file=sys.stderr)
    print(USAGE, file=sys.stderr)
    return 2
