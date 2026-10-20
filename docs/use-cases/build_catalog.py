#!/usr/bin/env python3
"""Validate authored use cases and render their documentation; no app execution."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any
from urllib.parse import unquote

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
ACTORS = {"anonymous", "user", "reader", "writer", "project_admin", "company_admin", "author", "reviewer", "mcp_client", "plugin_user", "operator", "worker"}
SURFACES = {"web", "rest", "mcp", "plugin", "background", "operator", "frontend_service"}
KINDS = {"happy_path", "validation", "permission", "failure", "concurrency", "accessibility", "localization", "performance", "lifecycle"}
STATES = {"implemented", "service_only", "external_pending", "not_implemented", "unclear"}
METHODS = {"get", "post", "put", "patch", "delete", "head", "options"}
REQUIRED = {"id", "title", "actor", "preconditions", "steps", "expected", "surfaces", "kind", "implementation", "evidence", "operations", "existingTests", "gapIds", "notes"}


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def checked_path(value: str) -> Path:
    path = (ROOT / value).resolve()
    if not path.is_relative_to(ROOT) or not path.is_file():
        raise ValueError(f"Missing or out-of-repository source: {value}")
    if any(part.startswith(".env") or part in {".local", ".git", "node_modules"} for part in path.relative_to(ROOT).parts):
        raise ValueError(f"Private/generated dependency path is not a catalog source: {value}")
    return path


def strings(value: Any, label: str, nonempty: bool = False) -> list[str]:
    if not isinstance(value, list) or any(not isinstance(v, str) or not v.strip() for v in value):
        raise ValueError(f"{label}: expected a list of nonblank strings")
    if nonempty and not value:
        raise ValueError(f"{label}: at least one item required")
    return value


def load_areas(tool_names: set[str], http_names: set[str], gap_names: set[str]) -> list[dict[str, Any]]:
    areas: list[dict[str, Any]] = []
    ids: set[str] = set()
    titles: set[tuple[str, str]] = set()
    actions: dict[tuple[Any, ...], str] = {}
    for path in sorted((HERE / "areas").glob("*.json")):
        area = read_json(path)
        for field in ("area", "title", "summary"):
            if not isinstance(area.get(field), str) or not area[field].strip():
                raise ValueError(f"{path.name}: missing {field}")
        if area["area"] != path.stem:
            raise ValueError(f"{path}: area must equal filename")
        sources = area.get("sources", {})
        if not sources:
            raise ValueError(f"{path.name}: sources required")
        for key, source in sources.items():
            source_path = checked_path(source["path"])
            line = source["line"]
            if not isinstance(line, int) or line < 1 or line > len(source_path.read_text(encoding="utf-8").splitlines()):
                raise ValueError(f"{path.name}/{key}: invalid source line")
        if not area.get("cases"):
            raise ValueError(f"{path.name}: cases required")
        for case in area["cases"]:
            case_id = case.get("id", "")
            if not re.fullmatch(r"UC-[A-Z]{2,5}-\d{4}", case_id) or case_id in ids:
                raise ValueError(f"Invalid or duplicate ID: {case_id}")
            ids.add(case_id)
            if REQUIRED - case.keys() or case.keys() - REQUIRED - {"httpOperations", "relatedCases"}:
                raise ValueError(f"{case_id}: invalid fields; missing={REQUIRED-case.keys()}")
            for field, choices in (("actor", ACTORS), ("kind", KINDS), ("implementation", STATES)):
                if case[field] not in choices:
                    raise ValueError(f"{case_id}: invalid {field}={case[field]}")
            if not isinstance(case["title"], str) or not case["title"].strip():
                raise ValueError(f"{case_id}: title required")
            title_key = (area["area"], case["title"].casefold())
            if title_key in titles:
                raise ValueError(f"Duplicate title in area: {case_id} {case['title']}")
            titles.add(title_key)
            for field in ("preconditions", "steps", "expected", "surfaces", "evidence", "operations", "existingTests", "gapIds", "notes"):
                strings(case[field], f"{case_id}/{field}", field in {"preconditions", "steps", "expected", "surfaces", "evidence"})
            for field in ("httpOperations", "relatedCases"):
                strings(case.get(field, []), f"{case_id}/{field}")
            for field in ("surfaces", "evidence", "operations", "httpOperations", "existingTests", "gapIds", "relatedCases"):
                values = case.get(field, [])
                if len(values) != len(set(values)):
                    raise ValueError(f"{case_id}: repeated {field} entry")
            action_key = (case["actor"], *(tuple(v.casefold().strip() for v in case[field]) for field in ("preconditions", "steps", "expected")))
            if action_key in actions:
                raise ValueError(f"Exact duplicate action/result: {actions[action_key]} and {case_id}")
            actions[action_key] = case_id
            if set(case["surfaces"]) - SURFACES:
                raise ValueError(f"{case_id}: unknown surface")
            if set(case["evidence"]) - sources.keys():
                raise ValueError(f"{case_id}: unknown evidence reference")
            if set(case["operations"]) - tool_names:
                raise ValueError(f"{case_id}: unknown MCP operation {set(case['operations'])-tool_names}")
            if set(case.get("httpOperations", [])) - http_names:
                raise ValueError(f"{case_id}: unknown HTTP operation")
            if set(case["gapIds"]) - gap_names:
                raise ValueError(f"{case_id}: unknown gaps {set(case['gapIds'])-gap_names}")
            for test in case["existingTests"]:
                checked_path(test)
        areas.append(area)
    for area in areas:
        for case in area["cases"]:
            if set(case.get("relatedCases", [])) - ids:
                raise ValueError(f"{case['id']}: unknown related case")
    return areas


def case_link(case: dict[str, Any], base: str = "") -> str:
    return f"[{case['id']}]({base}features/{case['area']}.md#{case['id'].lower()})"


def source_link(source: dict[str, Any], prefix: str = "../../../") -> str:
    return f"[{source['path']}:{source['line']}]({prefix}{source['path']}#L{source['line']})"


def validate_links(outputs: dict[Path, str]) -> int:
    """Check rendered and hand-authored documentation without opening any URL."""
    documents = {p:p.read_text(encoding="utf-8") for p in HERE.rglob("*.md")}
    documents.update({p:t for p,t in outputs.items() if p.suffix == ".md"})
    count = 0
    for path, text in documents.items():
        for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", text):
            if target.startswith(("https://", "http://", "mailto:")):
                continue
            name, _, fragment = unquote(target).partition("#")
            destination = (path.parent / name).resolve() if name else path
            count += 1
            if destination not in outputs and not destination.is_file():
                raise ValueError(f"{path.name}: missing local link {target}")
            destination_text = outputs.get(destination)
            if destination_text is None:
                destination_text = destination.read_text(encoding="utf-8")
            if re.fullmatch(r"L\d+", fragment):
                if int(fragment[1:]) < 1 or int(fragment[1:]) > len(destination_text.splitlines()):
                    raise ValueError(f"{path.name}: invalid source line link {target}")
            elif fragment and destination.suffix == ".md":
                if fragment not in set(re.findall(r'<a id="([^"]+)"', destination_text)):
                    raise ValueError(f"{path.name}: missing local anchor {target}")
    return count


def route_area(path: Path, route: str) -> str:
    if "features/projects" in str(path):
        if route.endswith("workflows"): return "workflows"
        if route.endswith(("fields", "settings")): return "configuration"
        if route.endswith(("planning", "reports")): return "planning"
        if route.endswith("import-export"): return "transfer"
        if route.endswith("automation"): return "integrations"
        return "projects"
    if "features/boards" in str(path): return "boards"
    if "features/issues" in str(path): return "issues"
    if "features/notifications" in str(path): return "notifications"
    if route.startswith("account/"): return "mcp"
    if route == "sign-in": return "access"
    if "memberships" in route: return "projects"
    if route == "admin/users": return "access"
    if route == "admin/activity": return "activity"
    return {"projects":"projects", "notifications":"notifications", "issues":"issues", "boards":"boards", "backlog/:projectId":"backlog", "":"workspace", "**":"workspace"}[route]


def owner_areas(path: str) -> list[str]:
    if "/api/generated/" in path: return []
    if "/features/" not in path:
        return ["workspace", "platform"]
    feature = path.split("/features/", 1)[1].split("/", 1)[0]
    if feature == "issues":
        if "/backlog/" in path: return ["backlog"]
        if "/custom-fields/" in path: return ["fields-review-labels"]
        if "/dependencies/" in path or "/subtasks/" in path: return ["relationships"]
        if "/description-editor/" in path: return ["collaboration"]
        if "/date-label-fields/" in path: return ["fields-review-labels"]
        return ["issues"]
    if feature == "projects":
        if "project-workflows" in path or "transition-policy" in path: return ["workflows"]
        if "project-fields" in path or "project-configuration" in path or "project-activation" in path: return ["configuration"]
        return ["projects"]
    if feature == "administration":
        if "/activity/" in path: return ["activity"]
        if "/memberships/" in path: return ["projects"]
        return ["access"]
    return {"account":["mcp"], "notifications":["notifications"], "comments":["collaboration"], "integrations":["integrations"], "pictures":["assets"], "planning":["planning"], "attachments":["assets"], "import-export":["transfer"], "boards":["boards"]}.get(feature, [])


def make_inventory(areas: list[dict[str, Any]], cases: list[dict[str, Any]], tools: dict[str, Any], api: dict[str, Any]) -> dict[str, Any]:
    area_names = {area["area"] for area in areas}
    by_op: dict[str, list[str]] = {}
    for case in cases:
        if case["implementation"] == "not_implemented": continue
        for op in set(case["operations"] + case.get("httpOperations", [])):
            by_op.setdefault(op, []).append(case["id"])
    operations = []
    for path, methods in api["paths"].items():
        for method, value in methods.items():
            if method not in METHODS: continue
            op = value["operationId"]
            operations.append({"operationId":op, "method":method.upper(), "path":path, "caseIds":sorted(by_op.get(op, [])), "mcpTool":op if op in tools else None})
    missing_http = [item["operationId"] for item in operations if not item["caseIds"]]
    missing_tools = sorted(set(tools) - by_op.keys())
    if missing_tools or missing_http:
        raise ValueError(f"Unmapped operations: MCP={missing_tools}; REST={missing_http}")
    routes = []
    for path in sorted((ROOT / "frontend/src/app").rglob("*routes.ts")):
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            match = re.search(r"\bpath:\s*'([^']*)'", line)
            if not match: continue
            area = route_area(path.relative_to(ROOT), match.group(1))
            if area not in area_names: raise ValueError(f"Route owner area missing: {area}")
            routes.append({"source":str(path.relative_to(ROOT)), "line":number, "pathFragment":match.group(1), "area":area, "note":"Route declarations include lazy parents and fallback; this is not a screen count."})
    handlers = []
    for path in sorted((ROOT / "frontend/src/app").rglob("*")):
        if path.suffix not in {".html", ".ts"} or path.name.endswith(".spec.ts") or "/api/generated/" in str(path): continue
        text = path.read_text(encoding="utf-8")
        for match in re.finditer(r'\(([\w.:-]+)\)\s*=\s*"([^"]+)"', text):
            relative = str(path.relative_to(ROOT))
            owners = owner_areas(relative)
            if not owners or set(owners)-area_names: raise ValueError(f"Unowned UI handler: {relative}:{match.group(1)}")
            handlers.append({"source":relative, "line":text[:match.start()].count("\n")+1, "event":match.group(1), "expression":match.group(2), "ownerAreas":owners, "mapping":"area ownership; not an assertion-level test mapping"})
    return {"basis":"Static source inventory. A mapped surface is documented, not runtime verified.", "routes":routes, "httpOperations":operations, "mcpTools":[{"name":name, "description":tools[name].get("description", ""), "caseIds":sorted(by_op.get(name, []))} for name in sorted(tools)], "uiHandlers":handlers, "uiHandlerLimit":"Heuristic inventory of Angular event bindings; not a complete DOM or generated-control inventory. Ownership is area-level; later testing must reconcile actual controls and assertions."}


def feature_markdown(area: dict[str, Any], lookup: dict[str, dict[str, Any]]) -> str:
    out = [f"# {area['title']}", "", area["summary"], "", "[Catalog index](../README.md) · [Roles](../roles.md) · [Known gaps](../gaps.md)", "", "Source-inspected use cases. Runtime verification in this documentation run: **not run**. Related test files are pointers, not assertions of coverage or success.", "", "## Source map", ""]
    for key, source in area["sources"].items(): out.append(f"- `{key}`: {source_link(source)}")
    out.extend(["", "## Cases", ""])
    for case in area["cases"]:
        out.extend([f"<a id=\"{case['id'].lower()}\"></a>", f"### {case['id']} — {case['title']}", "", f"Actor: `{case['actor']}` · Kind: `{case['kind']}` · Implementation: `{case['implementation']}` · Surfaces: {', '.join('`'+v+'`' for v in case['surfaces'])}", "", "**Preconditions**", ""])
        out.extend(f"- {value}" for value in case["preconditions"])
        out.extend(["", "**Steps**", ""])
        out.extend(f"{i}. {value}" for i, value in enumerate(case["steps"], 1))
        out.extend(["", "**Expected results**", ""])
        out.extend(f"- {value}" for value in case["expected"])
        out.extend(["", "Sources: " + ", ".join(source_link(area["sources"][key]) for key in case["evidence"]) + "."])
        if case["operations"]: out.extend(["", "Shared business operations: " + ", ".join(f"`{op}`" for op in case["operations"]) + "."])
        if case.get("httpOperations"): out.extend(["", "Browser-only HTTP operations: " + ", ".join(f"`{op}`" for op in case["httpOperations"]) + "."])
        if case["existingTests"]: out.extend(["", "Related test files: " + ", ".join(f"[{Path(p).name}](../../../{p})" for p in case["existingTests"]) + "."])
        if case["gapIds"]: out.extend(["", "Gaps: " + ", ".join(f"[{gap}](../gaps.md#{gap.lower()})" for gap in case["gapIds"]) + "."])
        if case.get("relatedCases"): out.extend(["", "Related cases: " + ", ".join(case_link(lookup[value], "../") for value in case["relatedCases"]) + "."])
        for note in case["notes"]: out.extend(["", f"Note: {note}"])
        out.append("")
    return "\n".join(out).rstrip()+"\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Validate and compare rendered artifacts without writing files")
    args = parser.parse_args()
    tools = read_json(ROOT / "backend/api/mcp-tools.json")["tools"]
    api = read_json(ROOT / "backend/api/openapi.json")
    http_names = {v["operationId"] for p in api["paths"].values() for m,v in p.items() if m in METHODS}
    gaps = read_json(HERE / "gaps.json")
    gap_names = {g["id"] for g in gaps}
    if len(gap_names) != len(gaps): raise ValueError("Duplicate gap IDs")
    for gap in gaps:
        for source in gap["sources"]:
            path = checked_path(source["path"])
            if source["line"] < 1 or source["line"] > len(path.read_text(encoding="utf-8").splitlines()): raise ValueError(f"Invalid gap source: {gap['id']}")
    areas = load_areas(set(tools), http_names, gap_names)
    cases = [{**case, "area":area["area"], "runtimeVerification":"not_run", "sourceReferences":[area["sources"][key] for key in case["evidence"]]} for area in areas for case in area["cases"]]
    lookup = {case["id"]:case for case in cases}
    inventory = make_inventory(areas, cases, tools, api)
    sources = {"backend/api/mcp-tools.json", "backend/api/openapi.json"}
    sources.update(r["source"] for r in inventory["routes"])
    sources.update(h["source"] for h in inventory["uiHandlers"])
    sources.update(s["path"] for a in areas for s in a["sources"].values())
    sources.update(t for c in cases for t in c["existingTests"])
    sources.update(s["path"] for g in gaps for s in g["sources"])
    fingerprints = [{"path":p, "sha256":hashlib.sha256(checked_path(p).read_bytes()).hexdigest()} for p in sorted(sources)]
    summary = {"cases":len(cases), "areas":len(areas), "implementation":dict(sorted(Counter(c["implementation"] for c in cases).items())), "kinds":dict(sorted(Counter(c["kind"] for c in cases).items())), "surfaces":{s:sum(s in c["surfaces"] for c in cases) for s in sorted(SURFACES)}, "routeDeclarations":len(inventory["routes"]), "httpOperations":len(inventory["httpOperations"]), "mcpTools":len(tools), "uiEventBindings":len(inventory["uiHandlers"]), "gaps":len(gaps)}
    catalog = {"$schema":"./catalog.schema.json", "version":1, "catalogDate":"2026-10-20", "timeZone":"Africa/Cairo", "scope":"Current GateGoldJira implementation; future feature recommendations excluded.", "runtimeVerification":"not_run", "testReferences":"Related files only. No scenario/assertion coverage or current passing result is inferred.", "summary":summary, "areas":[{"area":a["area"], "title":a["title"], "summary":a["summary"], "caseIds":[c["id"] for c in a["cases"]]} for a in areas], "sourceFingerprint":fingerprints, "cases":cases}
    outputs: dict[Path,str] = {HERE/"catalog.json":json.dumps(catalog,ensure_ascii=False,indent=2)+"\n", HERE/"surface-inventory.json":json.dumps(inventory,ensure_ascii=False,indent=2)+"\n"}
    for area in areas: outputs[HERE/"features"/(area["area"]+".md")] = feature_markdown(area, lookup)
    gaps_md = ["# Gaps, discrepancies and external boundaries", "", "[Catalog index](README.md)", "", "These records distinguish source findings, resolved local defects and unavailable external acceptance. Source references alone do not establish a passing outcome; runtime verification is recorded separately by the source-stamped test reports.", ""]
    for gap in gaps:
        linked = [c for c in cases if gap["id"] in c["gapIds"]]
        gaps_md.extend([f"<a id=\"{gap['id'].lower()}\"></a>", f"## {gap['id']} — {gap['title']}", "", f"Classification: `{gap['classification']}`", "", gap["detail"], "", "Documentation treatment: " + gap["treatment"], "", "Sources: " + ", ".join(source_link(s,"../../") for s in gap["sources"]) + ".", ""])
        if linked: gaps_md.extend(["Related cases: " + ", ".join(case_link(c) for c in linked) + ".", ""])
    outputs[HERE/"gaps.md"] = "\n".join(gaps_md).rstrip()+"\n"
    index = ["# GateGoldJira use-case catalog", "", "Catalog date: **2026-10-20**, Africa/Cairo. Scope: **current application**. Three parallel source audits supplied the feature inventories; the final catalog was consolidated and checked against current source and generated contracts.", "", "This catalog defines the current expectations. Its `runtimeVerification: not_run` fields describe source-only catalog evidence; actual execution is recorded separately by the source-stamped coverage reports. Existing test links and source references never count as a passing test. The [test strategy](test-strategy.json) describes execution, coverage gates and external boundaries.", "", f"**{len(cases)} individually identified cases** across **{len(areas)} areas**, with **{len(inventory['routes'])} route declarations**, **{len(inventory['httpOperations'])} OpenAPI operations** and **{len(tools)} published MCP tools** reconciled to catalog ownership/references. Counts include explicitly unavailable and externally pending cases; they are not counts of passing tests. Route declarations include lazy parents and fallback routes, not just screens.", "", "## Read the catalog", "", "| Area | Cases | Detailed document |", "|---|---:|---|"]
    for area in areas: index.append(f"| {area['title']} | {len(area['cases'])} | [{area['area']}](features/{area['area']}.md) |")
    index.extend(["", "## Status and terminology", "", "- `implemented`: the documented path exists in source; a separate runtime report determines whether its exact outcome passes.", "- `service_only`: a service/API/MCP behavior has no equivalent discovered native web action.", "- `external_pending`: a candidate integration needs its actual identity provider, host, SMTP, cloud or storage target.", "- `not_implemented`: the action is deliberately recorded as unavailable; do not write a positive acceptance test assuming it exists.", "- `unclear`: source exposes a mismatch or incomplete evidence; resolve the linked gap before freezing an acceptance expectation.", "", "Actor meanings and role boundaries are in [roles.md](roles.md). A board column groups workflow stages; it does not define those stages. Approval votes do not themselves move an issue. Creation defaults apply to omitted custom values; explicit null is a different input. Draft recovery is in memory for the signed-in tab unless a case says otherwise.", "", "## Supporting records", "", "- [Structured case catalog](catalog.json) and [JSON Schema](catalog.schema.json).", "- [Route, API, MCP and UI-handler inventory](surface-inventory.json) and [human-readable inventory](surface-inventory.md).", "- [Gaps and unavailable/external flows](gaps.md).", "- [Actors and role boundaries](roles.md).", "- [Documentation validation and its limits](validation.md).", "", "`sourceFingerprint` records SHA-256 of referenced source, route definitions, observed UI-event bindings, contract manifests and related test files. It identifies this source baseline, not a clean commit or a successful build. Generated documentation is excluded from that baseline to avoid self-referential hashes.", "", "## Case structure", "", "Each case records actor, preconditions, steps, observable expected results, applicable surfaces, behavioral kind, implementation status, source evidence, operation references and known gaps. Materially different outcomes are separate case IDs; shared role/transport invariants also have standalone cases with their applicability stated. Reusing an implementation does not establish cross-surface test coverage.", "", "IDs stay stable after publication. Add new cases with unused numbers, retain removed cases as unavailable with an explanation, and avoid renumbering unrelated cases. Semantic duplicates should reference a canonical case rather than inflate the count. The area JSON files are authored sources; aggregate JSON, feature Markdown, gap Markdown, index and inventories are rendered by the local documentation tool.", "", "## Maintain and validate", "", "```sh", "python3 docs/use-cases/build_catalog.py", "python3 docs/use-cases/build_catalog.py --check", "```", "", "The check validates IDs, required fields, actors/statuses, source paths/line bounds, test-file references, gap links, operation names, complete current HTTP/MCP operation mapping, route/UI-handler ownership and deterministic generated artifacts. It does not evaluate app behavior, prove line-level semantics or claim every dynamically generated UI control has been discovered. The UI binding inventory is heuristic and ownership is area-level; later browser inspection must reconcile actual controls and assertions.", "", "Templates/recurrence, automatic Git sync, general automation, roadmap, worklogs and sprints are excluded as future recommendations. Ordinary comment deletion, nested subtasks, direct parent reassignment, label rename/delete and approval withdrawal are recorded only as current boundaries where relevant. Production acceptance remains distinct from local test adapters.", "", "Executable tests now map stable IDs to assertion-bearing Playwright steps. See [test-strategy.json](test-strategy.json) for measurement definitions, commands, the strict100% target and external boundaries. Runtime evidence remains separate from this source-inspected catalog; existing-test links alone never count as passing coverage.", ""])
    outputs[HERE/"README.md"] = "\n".join(index)
    inv_md = ["# Public surface inventory", "", "[Catalog index](README.md)", "", "Static ownership and use-case mapping, not executed coverage. Angular event bindings are in the JSON inventory and require later runtime reconciliation for dynamic controls.", "", "## Route declarations", "", "| Source | Path fragment | Area |", "|---|---|---|"]
    for route in inventory["routes"]: inv_md.append(f"| {source_link({'path':route['source'],'line':route['line']},'../../')} | `{route['pathFragment'] or '(root)'}` | [{route['area']}](features/{route['area']}.md) |")
    inv_md.extend(["", "## OpenAPI operations", "", "| Method and path | Operation | Cases |", "|---|---|---|"])
    for op in inventory["httpOperations"]: inv_md.append(f"| `{op['method']} {op['path']}` | `{op['operationId']}` | "+", ".join(case_link(lookup[i]) for i in op["caseIds"])+" |")
    inv_md.extend(["", "## Published MCP tools", "", "Descriptions are preserved verbatim in the JSON inventory for comparison with source; known stale permission text is recorded in gaps. Credential-management HTTP endpoints are intentionally absent from this business-tool registry.", "", "| Tool | Cases |", "|---|---|"])
    for tool in inventory["mcpTools"]: inv_md.append(f"| `{tool['name']}` | "+", ".join(case_link(lookup[i]) for i in tool["caseIds"])+" |")
    outputs[HERE/"surface-inventory.md"] = "\n".join(inv_md)+"\n"
    link_count = validate_links(outputs)
    stale = []
    for path, text in outputs.items():
        if args.check:
            if not path.is_file() or path.read_text(encoding="utf-8") != text: stale.append(str(path.relative_to(ROOT)))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
    if stale:
        raise ValueError("Generated documentation is missing or stale: " + ", ".join(stale))
    print(json.dumps({"result":"checked" if args.check else "rendered", "localLinks":link_count, **summary},ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, KeyError, TypeError, OSError) as error:
        print(f"Catalog validation failed: {error}", file=sys.stderr)
        raise SystemExit(1)
