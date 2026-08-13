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
from collections import Counter

# Extensions we care about (the project's TS/JS stack, plus common scripting langs).
SLASH_EXTS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".go", ".rs", ".java", ".c", ".cpp", ".h"}
HASH_EXTS = {".py", ".sh", ".rb", ".yml", ".yaml"}

MAX_BLOCK_LINES = 4       # consecutive // or # comment lines before it reads as an essay
MAX_JSDOC_LINES = 8       # /** ... */ blocks get more room for @param/@returns
MAX_LINE_CHARS = 150      # a single comment line longer than this is prose, not a note


def ext_of(path):
    m = re.search(r"(\.[a-zA-Z0-9]+)$", path or "")
    return m.group(1).lower() if m else ""


def run_key(lines, run_start, run_len):
    """Identity of a comment run: its own comment lines, stripped."""
    return ("run", tuple(l.strip() for l in lines[run_start - 1:run_start + run_len - 1]))


def find_violations(text, ext):
    """Return (key, message) for each essay-style comment in the file.

    The key is the offending comment's own text, so the same comment matches
    itself across two versions of a file even when its line numbers move.
    """
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
                        key = ("jsdoc", tuple(l.strip() for l in lines[jsdoc_start - 1:i]))
                        violations.append((key, f"line {jsdoc_start}: /** */ block runs {jsdoc_len} lines (max {MAX_JSDOC_LINES})"))
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
                    violations.append((("long", text_only), f"line {i}: comment is {len(text_only)} chars (max {MAX_LINE_CHARS}) — restate as prose or trim"))
                if run_start is None:
                    run_start = i
                run_len += 1
            else:
                if run_len > MAX_BLOCK_LINES:
                    violations.append((run_key(lines, run_start, run_len), f"line {run_start}: {run_len} consecutive // comment lines (max {MAX_BLOCK_LINES})"))
                run_start = None
                run_len = 0

        if run_len > MAX_BLOCK_LINES:
            violations.append((run_key(lines, run_start, run_len), f"line {run_start}: {run_len} consecutive // comment lines (max {MAX_BLOCK_LINES})"))

    elif ext in HASH_EXTS:
        run_start = None
        run_len = 0
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            is_comment = stripped.startswith("#") and not stripped.startswith("#!")
            if is_comment:
                text_only = stripped.lstrip("#").strip()
                if len(text_only) > MAX_LINE_CHARS:
                    violations.append((("long", text_only), f"line {i}: comment is {len(text_only)} chars (max {MAX_LINE_CHARS}) — restate as prose or trim"))
                if run_start is None:
                    run_start = i
                run_len += 1
            else:
                if run_len > MAX_BLOCK_LINES:
                    violations.append((run_key(lines, run_start, run_len), f"line {run_start}: {run_len} consecutive # comment lines (max {MAX_BLOCK_LINES})"))
                run_start = None
                run_len = 0
        if run_len > MAX_BLOCK_LINES:
            violations.append((run_key(lines, run_start, run_len), f"line {run_start}: {run_len} consecutive # comment lines (max {MAX_BLOCK_LINES})"))

    return violations


def text_before(tool_name, tool_input, text):
    """The file as it was before this call, or None when it cannot be rebuilt.

    Write authors the whole file, so nothing pre-existed it. Edit/MultiEdit are
    undone in reverse order (a later edit may have rewritten an earlier one's
    output), turning each new_string back into its old_string. Returns None when
    an edit cannot be undone, so the hook falls back to checking the whole file
    rather than skipping a real violation.
    """
    if tool_name == "Write":
        return None

    edits = tool_input.get("edits") if tool_name == "MultiEdit" else [tool_input]
    if not isinstance(edits, list):
        return None

    before = text
    for edit in reversed(edits):
        if not isinstance(edit, dict):
            return None
        new = edit.get("new_string") or ""
        old = edit.get("old_string") or ""
        if new == old:
            continue
        if not new:
            return None  # a deletion leaves no anchor to re-insert old_string at
        occurrences = before.count(new)
        if occurrences == 0:
            return None
        if occurrences > 1:
            return None  # even with replace_all, pre-existing copies of new_string are indistinguishable from this edit's
        before = before.replace(new, old, 1)
    return before


def new_violations(text, before, ext):
    """Violations in `text` that are not already in `before`.

    Matching is by comment content, so an untouched comment stays excused when an
    edit elsewhere shifts its line numbers, while a comment run that only breaches
    the limit once this edit joined it to its neighbours counts as new.
    """
    found = find_violations(text, ext)
    if before is None:
        return found
    excused = Counter(key for key, _ in find_violations(before, ext))
    fresh = []
    for key, message in found:
        if excused[key] > 0:
            excused[key] -= 1
            continue
        fresh.append((key, message))
    return fresh


def contents_for(tool_name, tool_input, tool_response):
    """Yield (file_path, full_text, text_before) for the file this call changed.

    PostToolUse runs after the edit lands, so we read the whole file from disk
    rather than the new_string fragment. A fragment misses blocks that only
    breach the limits once joined to the comments already around them; the prior
    text then excuses the comments this call did not create.

    The tool reports the pre-edit file as `originalFile`; only when it is absent
    do we rebuild the prior text from the edit itself.
    """
    if tool_name not in ("Write", "Edit", "MultiEdit"):
        return []
    path = tool_input.get("file_path", "")
    if not path:
        return []
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    except OSError:
        return []
    original = tool_response.get("originalFile") if isinstance(tool_response, dict) else None
    if not isinstance(original, str):
        original = text_before(tool_name, tool_input, text)
    return [(path, text, original)]


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    tool_name = payload.get("tool_name", "")
    tool_input = payload.get("tool_input", {}) or {}
    tool_response = payload.get("tool_response", {}) or {}

    all_violations = []
    for path, text, before in contents_for(tool_name, tool_input, tool_response):
        ext = ext_of(path)
        if not ext or (ext not in SLASH_EXTS and ext not in HASH_EXTS):
            continue
        for _, message in new_violations(text or "", before, ext):
            all_violations.append(f"{path} — {message}")

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
