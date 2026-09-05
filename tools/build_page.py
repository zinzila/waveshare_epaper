"""Build a single-file, self-contained HTML simulator.

Usage::

    uv run build-page
    # or:
    python3 tools/build_page.py [-o simulator.html] [--open]
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"


def build_dist_if_needed(force: bool = False) -> None:
    """Run `npm run build` if dist/ is missing or force is True."""
    has_dist = (DIST / "index.html").is_file()
    if has_dist and not force:
        return

    npm = shutil.which("npm")
    if not npm:
        if not has_dist:
            sys.exit(
                "Error: 'npm' was not found on your system and 'dist/' does not exist yet.\n"
                "Please install Node.js/npm once to build the simulator, or provide a pre-built dist/ folder."
            )
        print("Note: 'npm' not found; using existing dist/ assets.")
        return

    print("Building web assets with npm run build...")
    try:
        subprocess.run([npm, "run", "build"], cwd=str(ROOT), check=True)
    except subprocess.CalledProcessError as e:
        sys.exit(f"npm build failed with code {e.returncode}")


def bundle_single_file(output_path: Path) -> int:
    """Read dist/index.html, inline CSS and JS, and write to output_path."""
    index_html = DIST / "index.html"
    if not index_html.is_file():
        sys.exit("Error: dist/index.html not found.")

    html_content = index_html.read_text(encoding="utf-8")

    # 1. Inline stylesheet links: <link rel="stylesheet" crossorigin href="...">
    def replace_css_link(match: re.Match) -> str:
        href = match.group(1).lstrip("./")
        css_file = DIST / href
        if css_file.is_file():
            css_text = css_file.read_text(encoding="utf-8")
            return f"<style>\n{css_text}\n</style>"
        return match.group(0)

    html_content = re.sub(
        r'<link\s+[^>]*?href=["\']([^"\']+\.css)["\'][^>]*?>',
        replace_css_link,
        html_content,
        flags=re.IGNORECASE,
    )

    # 2. Inline script tags: <script type="module" crossorigin src="..."></script>
    def replace_js_script(match: re.Match) -> str:
        src = match.group(1).lstrip("./")
        js_file = DIST / src
        if js_file.is_file():
            js_text = js_file.read_text(encoding="utf-8")
            # Escape </script> within JS code to prevent premature HTML script tag closing
            safe_js = js_text.replace("</script", "<\\/script")
            return f'<script type="module">\n{safe_js}\n</script>'
        return match.group(0)

    html_content = re.sub(
        r'<script\s+[^>]*?src=["\']([^"\']+\.js)["\'][^>]*?>\s*</script>',
        replace_js_script,
        html_content,
        flags=re.IGNORECASE,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html_content, encoding="utf-8")
    return output_path.stat().st_size


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build a single-file, self-contained HTML simulator for the Waveshare e-Paper library."
    )
    parser.add_argument(
        "-o",
        "--output",
        default="simulator.html",
        help="Target output file path (default: simulator.html in repository root)",
    )
    parser.add_argument(
        "--rebuild",
        action="store_true",
        help="Force rebuilding with npm even if dist/ exists",
    )
    parser.add_argument(
        "--open",
        action="store_true",
        help="Open the generated single-file HTML in default browser",
    )
    args = parser.parse_args()

    build_dist_if_needed(force=args.rebuild)

    out_file = Path(args.output)
    if not out_file.is_absolute():
        out_file = ROOT / out_file

    size_bytes = bundle_single_file(out_file)
    size_kb = size_bytes / 1024

    print("=" * 60)
    print("  Single-File Self-Contained Simulator Built Successfully!")
    print(f"  Output: {out_file}")
    print(f"  Size:   {size_kb:.1f} KB ({size_bytes:,} bytes)")
    print("  Features:")
    print("   • 100% self-contained: Inlined HTML + CSS + JS")
    print("   • Zero npm / server required at runtime")
    print("   • Can be double-clicked or opened via file:// in any browser")
    print("=" * 60)

    if args.open:
        try:
            webbrowser.open(out_file.as_uri())
        except Exception as e:
            print(f"Could not open browser automatically: {e}")


if __name__ == "__main__":
    main()
