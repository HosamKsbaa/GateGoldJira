"""Check actual Go imports against the feature/platform ownership rules."""
import json
import os
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent.parent
env = os.environ.copy()
tools_go = root / ".tools" / "go" / "bin"
if tools_go.is_dir():
    env["PATH"] = f"{tools_go}{os.pathsep}{env.get('PATH', '')}"
text = subprocess.check_output(["go", "list", "-json", "./..."], cwd=root / "backend", env=env, text=True)
decoder = json.JSONDecoder()
failures = []
prefix = "gategoldjira/backend/internal/"
while text.strip():
    item, length = decoder.raw_decode(text.lstrip())
    text = text.lstrip()[length:]
    source = item["ImportPath"]
    for imported in item.get("Imports", []):
        if not imported.startswith(prefix):
            continue
        if source.startswith(prefix + "platform/") and not imported.startswith(prefix + "platform/"):
            failures.append(f"{source} cannot import {imported}")
        if source.startswith(prefix + "features/"):
            feature = source.removeprefix(prefix + "features/").split("/")[0]
            if imported.startswith(prefix + "app"):
                failures.append(f"{source} cannot import wiring {imported}")
            if imported.startswith(prefix + "features/"):
                target = imported.removeprefix(prefix + "features/").split("/")[0]
                allowed = {feature, "activity", "notifications"}
                if feature in {"pictures", "issues"}:
                    allowed.add("attachments")
                if feature == "comments":
                    allowed.add("pictures")
                    allowed.add("attachments")
                if target not in allowed:
                    failures.append(f"{source} cannot import feature {imported}")
if failures:
    raise SystemExit("\n".join(failures))
print("Go feature/platform import boundaries passed")
