#!/usr/bin/env python
import json, sys, subprocess, os

data = json.load(sys.stdin)
model = data['model']['display_name']
directory = os.path.basename(data['workspace']['current_dir'])
cost = data.get('cost', {}).get('total_cost_usd', 0) or 0
pct = int(data.get('context_window', {}).get('used_percentage', 0) or 0)
duration_ms = data.get('cost', {}).get('total_duration_ms', 0) or 0

CYAN, GREEN, YELLOW, RED, RESET = '\033[36m', '\033[32m', '\033[33m', '\033[31m', '\033[0m'

bar_color = RED if pct >= 90 else YELLOW if pct >= 70 else GREEN
filled = pct // 10
bar = '\u2588' * filled + '\u2591' * (10 - filled)

mins, secs = duration_ms // 60000, (duration_ms % 60000) // 1000

try:
    branch = subprocess.check_output(['git', 'branch', '--show-current'], text=True, stderr=subprocess.DEVNULL).strip()
    branch = f" | \U0001f33f {branch}" if branch else ""
except:
    branch = ""

print(f"{CYAN}[{model}]{RESET} \U0001f4c1 {directory}{branch}")
print(f"{bar_color}{bar}{RESET} {pct}% | {YELLOW}${cost:.2f}{RESET} | \u23f1\ufe0f {mins}m {secs}s")
