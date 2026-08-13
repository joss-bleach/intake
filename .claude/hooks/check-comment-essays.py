#!/usr/bin/env python3
"""PostToolUse hook: flag essay-style comments after Write/Edit/MultiEdit.

Enforces CLAUDE.md's comment rules ("one line per comment where possible,
no restating code in prose") by scanning the edited file for long comment
blocks or over-length single-line comments, then blocking with a reason so
the agent fixes it immediately instead of drifting back into prose.
"""
import json
import re
import sys

# Extensions we care about (the project's TS/JS stack, plus common scripting langs).
SLASH_EXTS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".go", ".rs", ".java", ".c", ".cpp", ".h"}
HASH_EXTS = {".py", ".sh", ".rb", ".yml", ".yaml"}

MAX_BLOCK_LINES = 4       # consecutive // or # comment lines before it reads as an essay
MAX_JSDOC_LINES = 8       # /** ... */ blocks get more room for @param/@returns
MAX_LINE_CHARS = 150      # a single comment line longer than this is prose, not a note


def ext_of(path):
    m = re.search(r"(\.[a-zA-Z0-9]+)$", path or "")
    return m.group(1).lower() if m else ""


def find_violations(text, ext):
    lines = text.split("\n")
    violations = []

    if ext in SLASH_EXTS:
        # /** ... */ JSDoc-style blocks
        in_jsdoc = False
        jsdoc_start = 0
        jsdoc_len = 0
        run_start = None
        run_len = 0

        for i, line in enumerate(lines, 1):
            stripped = line.strip()

            if in_jsdoc:
                jsdoc_len += 1
                if "*/" in stripped:
                    if jsdoc_len > MAX_JSDOC_LINES:
                        violations.append(f"line {jsdoc_start}: /** */ block runs {jsdoc_len} lines (max {MAX_JSDOC_LINES})")
                    in_jsdoc = False
                continue

            if stripped.startswith("/**"):
                in_jsdoc = True
                jsdoc_start = i
                jsdoc_len = 1
                if "*/" in stripped[3:]:
                    in_jsdoc = False
                continue

            is_line_comment = stripped.startswith("//")
            if is_line_comment:
                text_only = stripped.lstrip("/").strip()
                if len(text_only) > MAX_LINE_CHARS:
                    violations.append(f"line {i}: comment is {len(text_only)} chars (max {MAX_LINE_CHARS}) — restate as prose or trim")
                if run_start is None:
                    run_start = i
                run_len += 1
            else:
                if run_len > MAX_BLOCK_LINES:
                    violations.append(f"line {run_start}: {run_len} consecutive // comment lines (max {MAX_BLOCK_LINES})")
                run_start = None
                run_len = 0

        if run_len > MAX_BLOCK_LINES:
            violations.append(f"line {run_start}: {run_len} consecutive // comment lines (max {MAX_BLOCK_LINES})")

    elif ext in HASH_EXTS:
        run_start = None
        run_len = 0
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            is_comment = stripped.startswith("#") and not stripped.startswith("#!")
            if is_comment:
                text_only = stripped.lstrip("#").strip()
                if len(text_only) > MAX_LINE_CHARS:
                    violations.append(f"line {i}: comment is {len(text_only)} chars (max {MAX_LINE_CHARS}) — restate as prose or trim")
                if run_start is None:
                    run_start = i
                run_len += 1
            else:
                if run_len > MAX_BLOCK_LINES:
                    violations.append(f"line {run_start}: {run_len} consecutive # comment lines (max {MAX_BLOCK_LINES})")
                run_start = None
                run_len = 0
        if run_len > MAX_BLOCK_LINES:
            violations.append(f"line {run_start}: {run_len} consecutive # comment lines (max {MAX_BLOCK_LINES})")

    return violations


def contents_for(tool_name, tool_input):
    """Yield (file_path, full_text_after_edit) pairs to check.

    We only have the new_string fragment for Edit/MultiEdit, not the whole
    file, but scanning the fragment alone still catches essay-style blocks.
    """
    if tool_name == "Write":
        return [(tool_input.get("file_path", ""), tool_input.get("content", ""))]
    if tool_name == "Edit":
        return [(tool_input.get("file_path", ""), tool_input.get("new_string", ""))]
    if tool_name == "MultiEdit":
        path = tool_input.get("file_path", "")
        edits = tool_input.get("edits", [])
        return [(path, e.get("new_string", "")) for e in edits]
    return []


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    tool_name = payload.get("tool_name", "")
    tool_input = payload.get("tool_input", {}) or {}

    all_violations = []
    for path, text in contents_for(tool_name, tool_input):
        ext = ext_of(path)
        if not ext or (ext not in SLASH_EXTS and ext not in HASH_EXTS):
            continue
        for v in find_violations(text or "", ext):
            all_violations.append(f"{path} — {v}")

    if not all_violations:
        return 0

    reason = (
        "Essay-style comment(s) detected (CLAUDE.md: \"one line per comment where possible, "
        "no restating code in prose\"). Trim these to one line or delete if the code is "
        "self-explanatory:\n" + "\n".join(f"- {v}" for v in all_violations)
    )
    print(json.dumps({
        "decision": "block",
        "reason": reason,
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": reason,
        },
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
