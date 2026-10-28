#!/usr/bin/env python3
"""
Workspace PreToolUse Safety Guard for PiYT.
Deterministically intercepts and blocks commands that attempt to install packages,
modify global environments, or execute unauthorized operations.
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
            for pattern in BLOCKED_COMMAND_PATTERNS:
                match = re.search(pattern, cmd)
                if match:
                    print(json.dumps({
                        "decision": "deny",
                        "reason": (
                            f"HARD-GATE REJECTED: Command '{cmd.strip()}' matches blocked pattern "
                            f"'{match.group(0)}'. Package installations and global environment modifications "
                            "are strictly prohibited in this workspace."
                        )
                    }))
                    return

        print(json.dumps({"decision": "allow"}))
    except Exception:
        print(json.dumps({"decision": "allow"}))

if __name__ == "__main__":
    main()
