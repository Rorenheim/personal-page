"""Prepare a CDN-ready copy of the static website without changing source files."""

import hashlib
from pathlib import Path
import re
import shutil
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "generated-artifacts" / "site"
TEXT_SUFFIXES = {".html", ".css", ".js", ".json"}
MEDIA_SUFFIXES = {
    ".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".svg", ".ico",
    ".mp4", ".webm", ".mov", ".mp3", ".ogg", ".wav", ".pdf",
    ".woff", ".woff2", ".ttf",
}
# Browsers and crawlers request these by fixed URLs, so they keep their names.
ROOT_FILES = ("robots.txt", "sitemap.xml", "llms.txt", "favicon.ico", "site.webmanifest")
FIXED_DIRECTORIES = ("icons",)


def build(root=ROOT, output=OUTPUT):
    root, output = Path(root).resolve(), Path(output).resolve()
    # Only remove this build's output, never the source tree or arbitrary folders.
    if output != root / "generated-artifacts" / "site":
        raise ValueError("Output must be generated-artifacts/site within the project")
    if not (root / "index.html").is_file():
        raise ValueError("Missing website entry point: index.html")

    text_files = sorted(root.glob("*.html"))
    for directory in ("css", "js", "vendor"):
        text_files.extend(
            path for path in sorted((root / directory).rglob("*"))
            if path.is_file() and path.suffix in TEXT_SUFFIXES
        )
    if any(path.is_symlink() for path in text_files):
        raise ValueError("Refusing to publish symbolic links")

    # Publish media from assets plus root-level media actually used by the site.
    source_text = "\n".join(path.read_text() for path in text_files)
    media = [
        path for path in sorted((root / "assets").rglob("*"))
        if path.is_file() and path.suffix.lower() in MEDIA_SUFFIXES
    ]
    media.extend(
        path for path in sorted(root.iterdir())
        if path.is_file() and path.suffix.lower() in MEDIA_SUFFIXES
        and path.name not in ROOT_FILES
        and (path.name in source_text or quote(path.name) in source_text)
    )

    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    replacements = {}
    for path in media:
        if path.is_symlink():
            raise ValueError("Refusing to publish symbolic links")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()[:16]
        relative = path.relative_to(root)
        parent = relative.parent if relative.parent != Path(".") else Path("assets/media")
        destination = parent / f"{path.stem}.{digest}{path.suffix}"
        target = output / destination
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
        # Preserve both URL-encoded HTML references and plain JS string paths.
        replacements[relative.as_posix()] = destination.as_posix()
        replacements[quote(relative.as_posix())] = quote(destination.as_posix())

    pattern = re.compile("|".join(
        re.escape(key) for key in sorted(replacements, key=len, reverse=True)
    )) if replacements else None
    for path in text_files:
        target = output / path.relative_to(root)
        target.parent.mkdir(parents=True, exist_ok=True)
        text = path.read_text()
        if pattern:
            text = pattern.sub(lambda match: replacements[match.group()], text)
        target.write_text(text)
    fixed = [root / name for name in ROOT_FILES]
    for directory in FIXED_DIRECTORIES:
        fixed.extend(sorted((root / directory).rglob("*")))
    for path in fixed:
        if path.is_symlink():
            raise ValueError("Refusing to publish symbolic links")
        if path.is_file():
            target = output / path.relative_to(root)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)
    print(f"Built {len(text_files)} site files and {len(media)} versioned media files in {output}")
    return replacements


if __name__ == "__main__":
    build()
