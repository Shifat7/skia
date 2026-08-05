#!/usr/bin/env python3
"""Validate documentation contracts without executing project code."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]
ISSUE_ROOT = ROOT / ".github" / "ISSUE_TEMPLATE"

ERRORS: list[str] = []
WARNINGS: list[str] = []


def error(message: str) -> None:
    ERRORS.append(message)


def warning(message: str) -> None:
    WARNINGS.append(message)


def repository_files() -> list[Path]:
    result = subprocess.run(
        [
            "git",
            "-C",
            str(ROOT),
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return [ROOT / line for line in result.stdout.splitlines() if line]


def read_utf8(path: Path) -> str | None:
    try:
        raw = path.read_bytes()
        if b"\x00" in raw:
            error(f"{path.relative_to(ROOT)} contains a NUL byte")
            return None
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        error(f"{path.relative_to(ROOT)} is not UTF-8: {exc}")
        return None
    if raw and not raw.endswith(b"\n"):
        error(f"{path.relative_to(ROOT)} has no final newline")
    for line_number, line in enumerate(text.splitlines(), 1):
        if line.endswith((" ", "\t")):
            error(f"{path.relative_to(ROOT)}:{line_number} has trailing whitespace")
    return text


def markdown_links(path: Path, text: str) -> tuple[list[str], list[str]]:
    relative: list[str] = []
    external: list[str] = []
    raw_targets: list[str] = []

    # Parse inline links with balanced parentheses so URLs such as
    # https://example.test/api(v1) are not truncated at the first `)`.
    for match in re.finditer(r"!?\[[^\]]*\]\(", text):
        cursor = match.end()
        depth = 1
        escaped = False
        target_chars: list[str] = []
        while cursor < len(text):
            char = text[cursor]
            cursor += 1
            if escaped:
                target_chars.append(char)
                escaped = False
            elif char == "\\":
                target_chars.append(char)
                escaped = True
            elif char == "(":
                depth += 1
                target_chars.append(char)
            elif char == ")":
                depth -= 1
                if depth == 0:
                    break
                target_chars.append(char)
            else:
                target_chars.append(char)
        if depth:
            error(f"{path.relative_to(ROOT)} has an unclosed inline Markdown link")
            continue
        raw_targets.append("".join(target_chars).strip())

    # Parse reference-style definitions and verify every use resolves.
    definitions: dict[str, str] = {}
    for match in re.finditer(
        r"(?m)^\s{0,3}\[([^\]]+)\]:\s*(<[^>]+>|\S+)", text
    ):
        definitions[match.group(1).strip().casefold()] = match.group(2).strip()
    raw_targets.extend(definitions.values())

    for match in re.finditer(r"(?<!!)\[([^\]\n]+)\]\[([^\]\n]*)\]", text):
        label = match.group(1).strip()
        reference = (match.group(2).strip() or label).casefold()
        if reference not in definitions:
            error(
                f"{path.relative_to(ROOT)} has unresolved Markdown reference "
                f"[{label}][{match.group(2)}]"
            )

    for raw_target in raw_targets:
        target = raw_target.strip()
        if not target:
            continue
        if target.startswith("<") and ">" in target:
            target = target[1 : target.index(">")]
        else:
            # A title may follow a valid destination. Unescaped spaces in the
            # destination itself are invalid; angle brackets are required.
            target = target.split(maxsplit=1)[0]
        if target.startswith(("http://", "https://")):
            external.append(target)
        elif target.startswith(("mailto:", "#")):
            continue
        else:
            relative.append(target)
    return relative, external


def check_relative_link(source: Path, target: str) -> None:
    path_part = target.split("#", 1)[0]
    if not path_part:
        return
    resolved = (source.parent / path_part).resolve()
    try:
        resolved.relative_to(ROOT.resolve())
    except ValueError:
        error(f"{source.relative_to(ROOT)} links outside repository: {target}")
        return
    if not resolved.exists():
        error(f"{source.relative_to(ROOT)} has missing relative link: {target}")


def check_json_fences(path: Path, text: str) -> list[Any]:
    parsed: list[Any] = []
    for index, match in enumerate(
        re.finditer(r"```json\s*\n(.*?)\n```", text, flags=re.DOTALL), 1
    ):
        try:
            parsed.append(json.loads(match.group(1)))
        except json.JSONDecodeError as exc:
            error(f"{path.relative_to(ROOT)} JSON fence {index} is invalid: {exc}")
    return parsed


def check_heading_progression(path: Path, text: str) -> None:
    previous_level = 0
    in_fence = False
    for line_number, line in enumerate(text.splitlines(), 1):
        if line.startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        match = re.match(r"^(#{1,6})\s+\S", line)
        if not match:
            continue
        level = len(match.group(1))
        if previous_level and level > previous_level + 1:
            error(
                f"{path.relative_to(ROOT)}:{line_number} skips heading level "
                f"{previous_level} -> {level}"
            )
        previous_level = level


def check_issue_form(path: Path) -> None:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, yaml.YAMLError) as exc:
        error(f"{path.relative_to(ROOT)} is invalid YAML: {exc}")
        return

    if path.name == "config.yml":
        if not isinstance(data, dict):
            error(f"{path.relative_to(ROOT)} must contain a mapping")
            return
        if data.get("blank_issues_enabled") is not False:
            error(f"{path.relative_to(ROOT)} must disable blank issues")
        return

    if not isinstance(data, dict):
        error(f"{path.relative_to(ROOT)} must contain a mapping")
        return
    for key in ("name", "description", "body"):
        if key not in data:
            error(f"{path.relative_to(ROOT)} is missing top-level {key}")
    body = data.get("body")
    if not isinstance(body, list) or not body:
        error(f"{path.relative_to(ROOT)} body must be a non-empty list")
        return

    ids: list[str] = []
    for index, item in enumerate(body, 1):
        if not isinstance(item, dict):
            error(f"{path.relative_to(ROOT)} body item {index} is not a mapping")
            continue
        item_type = item.get("type")
        if item_type not in {"markdown", "textarea", "input", "dropdown", "checkboxes", "upload"}:
            error(f"{path.relative_to(ROOT)} body item {index} has unsupported type {item_type!r}")
        if item_type != "markdown":
            item_id = item.get("id")
            if not isinstance(item_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", item_id):
                error(f"{path.relative_to(ROOT)} body item {index} has invalid id {item_id!r}")
            else:
                ids.append(item_id)
            attributes = item.get("attributes")
            if not isinstance(attributes, dict) or not attributes.get("label"):
                error(f"{path.relative_to(ROOT)} body item {index} has no label")
            if item_type == "dropdown":
                options = (attributes or {}).get("options")
                if not isinstance(options, list) or len(options) < 2:
                    error(f"{path.relative_to(ROOT)} dropdown {item_id!r} needs at least two options")
    duplicates = [item_id for item_id, count in Counter(ids).items() if count > 1]
    if duplicates:
        error(f"{path.relative_to(ROOT)} has duplicate ids: {duplicates}")


def check_external_url(url: str) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "skia-doc-check/0"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            status = getattr(response, "status", 200)
            if status >= 400:
                error(f"external link returned HTTP {status}: {url}")
    except urllib.error.HTTPError as exc:
        if exc.code in {401, 403, 429}:
            warning(f"external link reachable but access-limited (HTTP {exc.code}): {url}")
        else:
            error(f"external link returned HTTP {exc.code}: {url}")
    except (urllib.error.URLError, TimeoutError) as exc:
        error(f"external link failed: {url}: {exc}")


def require_text(path: str, needle: str) -> None:
    target = ROOT / path
    if not target.exists():
        error(f"required file missing: {path}")
        return
    text = target.read_text(encoding="utf-8")
    if needle not in text:
        error(f"{path} is missing required contract text: {needle!r}")


def forbid_text(path: str, needle: str) -> None:
    target = ROOT / path
    if target.exists() and needle in target.read_text(encoding="utf-8"):
        error(f"{path} contains stale/forbidden text: {needle!r}")


def check_contract_invariants() -> None:
    required_files = [
        "README.md",
        "PRD.md",
        "ARCHITECTURE.md",
        "IMPLEMENTATION_PLAN.md",
        "docs/artifacts/README.md",
        "docs/VALIDATION.md",
        "docs/OPEN_DECISIONS.md",
        "CONTRIBUTING.md",
        "GOVERNANCE.md",
        "SECURITY.md",
        "CODE_OF_CONDUCT.md",
        ".github/PULL_REQUEST_TEMPLATE.md",
        ".github/REPOSITORY_METADATA.md",
        ".github/ISSUE_TEMPLATE/config.yml",
        ".github/ISSUE_TEMPLATE/benchmark-fixture.yml",
        ".github/ISSUE_TEMPLATE/design-feedback.yml",
        ".github/ISSUE_TEMPLATE/implementation-proposal.yml",
        ".github/ISSUE_TEMPLATE/repository-snapshot-fixture.yml",
    ]
    for path in required_files:
        if not (ROOT / path).exists():
            error(f"required file missing: {path}")

    gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    if ".skia/" not in gitignore.splitlines():
        error(".gitignore must contain an exact .skia/ entry")

    shared_requirements = {
        "README.md": [
            "collapsed equivalence evidence",
            "skia repo review",
            "repo-hld-20260805T001500Z.md",
            "model_derived",
        ],
        "PRD.md": [
            "Minimal Behavior Card",
            "TypeScript-first discovery",
            "repo_card_cap",
            "repo-manifest-20260805T001500Z.json",
        ],
        "ARCHITECTURE.md": [
            "GIT_OPTIONAL_LOCKS=0",
            "GIT_NO_LAZY_FETCH=1",
            "Agent adapter",
            "Repository Behavior Cards",
        ],
        "IMPLEMENTATION_PLAN.md": [
            "AC-4: Collapsed equivalence evidence",
            "AC-8: Agent boundary and HLD/LLD",
            "AC-10: Timestamped repository bundle",
        ],
        "docs/artifacts/README.md": [
            "repo-hld-20260805T001500Z.md",
            "unchecked_subsystems",
            "privacy_caveat",
        ],
        "docs/VALIDATION.md": [
            "H1: Reduced reading",
            "Product landscape",
            "Claims the project must not make",
        ],
        "docs/OPEN_DECISIONS.md": [
            "OD-2: Collapsed-equivalence grammar",
            "OD-7: Agent adapters and consent",
            "OD-13: Professional validation design",
        ],
    }
    for path, needles in shared_requirements.items():
        for needle in needles:
            require_text(path, needle)

    forbid_text("PRD.md", "fies them.")
    forbid_text("PRD.md", "stifies them.")
    forbid_text("ARCHITECTURE.md", "`Typescript`")
    forbid_text("ARCHITECTURE.md", "`Tsx`")
    forbid_text("README.md", "generates review artifacts (intent, dependency graphs")
    forbid_text("README.md", "one Behavior Card per entity; therefore")

    for path in ("PRD.md", "ARCHITECTURE.md", "IMPLEMENTATION_PLAN.md", "SECURITY.md"):
        require_text(path, "provider endpoint allowlist")
    require_text("docs/artifacts/README.md", '"claim_counts"')
    require_text("docs/artifacts/README.md", '"subsystems"')
    require_text("docs/artifacts/README.md", "non-manifest artifact hash")

    implementation_text = (ROOT / "IMPLEMENTATION_PLAN.md").read_text(encoding="utf-8")
    acceptance_ids = re.findall(r"(?m)^\|\s*(\d+\.\d+)\s*\|", implementation_text)
    duplicate_acceptance_ids = [
        item for item, count in Counter(acceptance_ids).items() if count > 1
    ]
    if duplicate_acceptance_ids:
        error(
            "IMPLEMENTATION_PLAN.md has duplicate acceptance-criterion IDs: "
            f"{duplicate_acceptance_ids}"
        )

    decisions_text = (ROOT / "docs" / "OPEN_DECISIONS.md").read_text(encoding="utf-8")
    decision_ids = re.findall(r"(?m)^##\s+(OD-\d+):", decisions_text)
    duplicate_decision_ids = [
        item for item, count in Counter(decision_ids).items() if count > 1
    ]
    if duplicate_decision_ids:
        error(
            "docs/OPEN_DECISIONS.md has duplicate decision IDs: "
            f"{duplicate_decision_ids}"
        )

    benchmark = (ISSUE_ROOT / "benchmark-fixture.yml").read_text(encoding="utf-8")
    if "unsupported / no entity" not in benchmark:
        error("benchmark fixture must support an unsupported/no-entity outcome")
    if "Publication safety" not in benchmark:
        error("benchmark fixture must include publication-safety acknowledgement")

    repository_fixture = (ISSUE_ROOT / "repository-snapshot-fixture.yml").read_text(
        encoding="utf-8"
    )
    if "Expected HLD and LLD claims" not in repository_fixture:
        error("repository fixture must collect expected HLD/LLD claims")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--external",
        action="store_true",
        help="also perform network checks for external Markdown links",
    )
    args = parser.parse_args()

    files = repository_files()
    markdown_files = sorted(path for path in files if path.suffix.lower() == ".md")
    issue_forms = sorted(
        path
        for path in files
        if path.parent == ISSUE_ROOT and path.suffix.lower() in {".yml", ".yaml"}
    )

    external_urls: set[str] = set()
    json_fence_count = 0
    for path in markdown_files:
        text = read_utf8(path)
        if text is None:
            continue
        check_heading_progression(path, text)
        relative, external = markdown_links(path, text)
        for target in relative:
            check_relative_link(path, target)
        external_urls.update(external)
        json_fence_count += len(check_json_fences(path, text))

    for path in issue_forms:
        read_utf8(path)
        check_issue_form(path)

    check_contract_invariants()

    if args.external:
        for url in sorted(external_urls):
            check_external_url(url)

    for item in WARNINGS:
        print(f"WARNING: {item}")
    for item in ERRORS:
        print(f"ERROR: {item}")

    print(
        "Checked "
        f"{len(markdown_files)} Markdown files, "
        f"{len(issue_forms)} issue-form YAML files, "
        f"{json_fence_count} JSON fences, and "
        f"{len(external_urls)} external URLs"
        + (" with network validation." if args.external else ".")
    )
    if ERRORS:
        print(f"Documentation checks failed with {len(ERRORS)} error(s).")
        return 1
    print("Documentation checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
