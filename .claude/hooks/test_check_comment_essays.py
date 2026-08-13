#!/usr/bin/env python3
"""Tests for the essay-comment hook. Run: python3 .claude/hooks/test_check_comment_essays.py"""
import json
import os
import subprocess
import sys
import tempfile

HOOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "check-comment-essays.py")

failures = []


def check(name, condition):
    print(("PASS " if condition else "FAIL ") + name)
    if not condition:
        failures.append(name)


def run_hook(tool_name, tool_input, file_text):
    """Write file_text to a temp .ts file, run the hook on it, return its block reason."""
    with tempfile.NamedTemporaryFile("w", suffix=".ts", delete=False) as f:
        f.write(file_text)
        path = f.name
    try:
        payload = {"tool_name": tool_name, "tool_input": dict(tool_input, file_path=path)}
        out = subprocess.run([sys.executable, HOOK], input=json.dumps(payload),
                             capture_output=True, text=True).stdout.strip()
        return json.loads(out)["reason"] if out else ""
    finally:
        os.unlink(path)


run5 = "\n".join(f"// note {i}" for i in range(5))
long_comment = "// " + "x" * 200

# A deletion that joins two short runs into an over-length one must block.
after_join = "// a\n// b\n// c\n// d\n// e\n"
check("deletion joining runs blocks",
      "5 consecutive" in run_hook("Edit", {"old_string": "const x = 1;\n", "new_string": ""}, after_join))

# An inserted fragment that also appears earlier in the file must be judged where
# it actually landed, not at the first matching occurrence.
dup = "// note\nconst a = 1;\n// a\n// b\n// c\n// d\n// note\n"
check("duplicated inserted fragment blocks",
      "5 consecutive" in run_hook("Edit", {"old_string": "// TODO", "new_string": "// note"}, dup))

# A later MultiEdit entry rewriting an earlier entry's output must not fall back
# to the whole file and block on legacy comments.
after_multi = run5 + "\nconst final = 2;\n"
check("chained MultiEdit entries excuse legacy comments",
      run_hook("MultiEdit", {"edits": [
          {"old_string": "const keep = 1;", "new_string": "const mid = 2;"},
          {"old_string": "const mid = 2;", "new_string": "const final = 2;"},
      ]}, after_multi) == "")

# Regressions.
check("unrelated edit does not block on legacy comments",
      run_hook("Edit", {"old_string": "const keep = 1;", "new_string": "const keep = 2;"},
               run5 + "\nconst keep = 2;\n") == "")
check("newly written long comment blocks",
      "chars (max" in run_hook("Edit", {"old_string": "const a = 1;", "new_string": long_comment},
                               "const b = 1;\n" + long_comment + "\n"))
check("Write checks the whole file",
      "consecutive" in run_hook("Write", {"content": run5}, run5 + "\n"))
check("moved legacy comment stays excused",
      run_hook("Edit", {"old_string": "const a = 1;", "new_string": "const a = 1;\nconst b = 2;"},
               "const a = 1;\nconst b = 2;\n" + run5 + "\n") == "")

sys.exit(1 if failures else 0)
