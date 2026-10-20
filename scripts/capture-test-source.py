#!/usr/bin/env python3
"""Capture source and tests together; share installed tools, never local identities."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tempfile

FOLDERS = ("backend", "frontend/src", "frontend/e2e", "frontend/tooling", "frontend/public", "scripts", "specs", "infra/sql", "infra/compute", "docs/use-cases", "integrations/antigravity/src", "integrations/antigravity/tests", "integrations/antigravity/plugin")
IGNORED = {".cache", ".local", "node_modules", "vendor", "__pycache__", "dist"}
BACKEND_SUFFIXES = {".go", ".mod", ".sum", ".sql", ".json", ".yaml", ".yml", ".txt", ".csv"}
REQUIRED = {
    "frontend/src/app/api/generated/zod.gen.ts",
    "frontend/src/app/api/generated/types.gen.ts",
    "frontend/src/app/api/generated/sdk.gen.ts",
    "backend/go.mod",
}


def source_files(root: Path) -> list[Path]:
    files = set()
    for folder in FOLDERS:
        for path in (root / folder).rglob("*"):
            if not path.is_file() or any(part in IGNORED for part in path.relative_to(root).parts):
                continue
            if folder == "backend" and path.suffix not in BACKEND_SUFFIXES:
                continue
            files.add(path.relative_to(root))
    for name in ("Makefile", "compose.dev.yaml", ".node-version", ".github/workflows/ci.yml", "integrations/antigravity/build.mjs", "integrations/antigravity/README.md"):
        if (root / name).is_file():
            files.add(Path(name))
    for pattern in ("*.json", "*.ts"):
        files.update(path.relative_to(root) for path in (root / "frontend").glob(pattern))
        files.update(path.relative_to(root) for path in (root / "integrations/antigravity").glob(pattern))
    return sorted(files)


def capture(root: Path, destination: Path) -> None:
    if destination.exists():
        raise ValueError("Choose a new destination; existing source copies are never replaced.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    for _ in range(3):
        staging = Path(tempfile.mkdtemp(prefix=".source-", dir=destination.parent))
        try:
            paths = source_files(root)
            if not REQUIRED.issubset({str(path) for path in paths}):
                continue
            manifest = {}
            for relative in paths:
                data = (root / relative).read_bytes()
                target = staging / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                manifest[str(relative)] = hashlib.sha256(data).hexdigest()
            if paths != source_files(root) or any(
                hashlib.sha256((root / relative).read_bytes()).hexdigest() != manifest[str(relative)]
                for relative in paths
            ):
                continue
            (staging / "source-manifest.json").write_text(json.dumps(manifest, sort_keys=True))
            # Installed dependencies and compiler caches are immutable inputs or
            # concurrency-safe caches. Application source remains a private copy.
            for relative in ("frontend/node_modules", "integrations/antigravity/node_modules", ".tools", ".cache"):
                if (root / relative).exists():
                    target = staging / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.symlink_to(root / relative, target_is_directory=True)
            staging.rename(destination)
            print(f"Captured {len(paths)} source files for isolated verification.")
            return
        except FileNotFoundError:
            # A generator can replace its output directory during capture.
            continue
        finally:
            if staging.exists():
                shutil.rmtree(staging)
    raise RuntimeError("Source changed repeatedly during capture. Finish regeneration and retry.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    capture(args.root.resolve(), args.output.resolve())
