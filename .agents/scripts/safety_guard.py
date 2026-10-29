#!/usr/bin/env python3
"""
Workspace PreToolUse Safety Guard for PiYT.
Deterministically intercepts and blocks commands that attempt to install packages,
modify global environments, or execute non-dev git push operations.
"""
import sys
import json
import re

BLOCKED_COMMAND_PATTERNS = [
    # Python package managers
    r"(?i)\b(python(\.exe)?|py(\.exe)?)\s+(-m\s+)?pip\s+(install|uninstall|download)\b",
    r"(?i)\bpip(3)?(\.exe)?\s+(install|uninstall|download)\b",
    r"(?i)\bpoetry\s+(add|install|remove)\b",
    r"(?i)\bpipenv\s+(install|uninstall)\b",
    r"(?i)\bconda\s+(install|remove|uninstall)\b",
    r"(?i)\bmamba\s+(install|remove|uninstall)\b",
    # JavaScript / Node package managers
    r"(?i)\bnpm\s+(i|install|add|uninstall|remove|update)\b",
    r"(?i)\byarn\s+(add|install|remove)\b",
    r"(?i)\bpnpm\s+(add|i|install|remove)\b",
    r"(?i)\bbun\s+(add|install|remove)\b",
    # System package managers
    r"(?i)\bwinget\s+(install|uninstall|upgrade)\b",
    r"(?i)\bchoco\s+(install|uninstall|upgrade)\b",
    r"(?i)\bscoop\s+(install|uninstall|update)\b",
]

def check_command(cmd: str):
    # 1. Package manager block
    for pattern in BLOCKED_COMMAND_PATTERNS:
        match = re.search(pattern, cmd)
        if match:
            return False, (
                f"HARD-GATE REJECTED: Command '{cmd.strip()}' matches blocked pattern "
                f"'{match.group(0)}'. Package installations and global environment modifications "
                "are strictly prohibited in this workspace."
            )

    # 2. Git push hard gate: All pushes MUST be explicitly scoped to dev
    # Matches: git push, git -C <path> push, git --git-dir=... push, etc.
    if re.search(r"\bgit(\.exe)?\s+(?:-[^\s]+\s+|--[^\s]+\s+|-[^\s]+\s+[^\s]+\s+)*push\b", cmd):
        # Strictly forbid push to main / master
        if re.search(r"\b(main|master)\b", cmd):
            return False, (
                f"HARD-GATE REJECTED: Command '{cmd.strip()}' attempts to push to 'main' or 'master'. "
                "Direct pushes to production branches are strictly forbidden. Git pushes must always be scoped to 'dev' by default."
            )
        # Must explicitly target dev branch
        if not re.search(r"\bdev\b", cmd):
            return False, (
                f"HARD-GATE REJECTED: Command '{cmd.strip()}' does not explicitly specify 'dev'. "
                "Git pushes must explicitly target the 'dev' branch (e.g. 'git push origin dev'). Bare or non-dev pushes are blocked."
            )

    return True, "Allowed"

def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input.strip():
            print(json.dumps({"decision": "allow"}))
            return

        data = json.loads(raw_input)
        tool_call = data.get("toolCall", {})
        tool_name = tool_call.get("name", "")
        args = tool_call.get("args", {})

        if tool_name == "run_command":
            cmd = args.get("CommandLine", "")
            allowed, reason = check_command(cmd)
            if not allowed:
                print(json.dumps({
                    "decision": "deny",
                    "reason": reason
                }))
                return

        print(json.dumps({"decision": "allow"}))
    except Exception:
        print(json.dumps({"decision": "allow"}))

if __name__ == "__main__":
    main()
