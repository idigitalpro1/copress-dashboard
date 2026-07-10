#!/usr/bin/env bash
# Ingest wildfire coverage cards into Hermes kanban (conewspress-dev).
# Usage: bash scripts/ingest-wildfire-kanban.sh [--dry-run]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/data/conews-wildfire-coverage-kanban.json"
HERMES="/Users/Ace/.hermes/hermes-agent/venv/bin/hermes"
BOARD="conewspress-dev"
DRY_RUN=0

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

export HOME=/Users/Ace
export HERMES_BASE_HOME=/Users/Ace/.hermes
export HERMES_HOME=/Users/Ace/.hermes/profiles/qwen

python3 - "$DATA" "$DRY_RUN" <<'PY'
import json, os, subprocess, sys

data = json.load(open(sys.argv[1]))
dry_run = sys.argv[2] == "1"
hermes = "/Users/Ace/.hermes/hermes-agent/venv/bin/hermes"
board = "conewspress-dev"
priority_map = {"high": 3, "medium": 2, "low": 1}
env = {
    **os.environ,
    "HOME": "/Users/Ace",
    "HERMES_BASE_HOME": "/Users/Ace/.hermes",
    "HERMES_HOME": "/Users/Ace/.hermes/profiles/qwen",
}

for card in data["cards"]:
    body_parts = [
        f"Type: {card['type']} | Owner: {card['owner']} | Deadline: {card['deadline']}",
        "",
        card["description"],
        "",
        "Checklist:",
        *[f"- {item}" for item in card.get("checklist", [])],
    ]
    if card.get("tags"):
        body_parts += ["", "Tags: " + ", ".join(card["tags"])]
    if card.get("escalation"):
        body_parts += ["", "Escalation: " + ", ".join(card["escalation"])]
    body = "\n".join(body_parts)
    idem = "wildfire-" + card["title"].lower().replace(" ", "-").replace("/", "-")[:80]
    priority = priority_map.get(card["priority"], 2)
    args = [
        hermes, "--profile", "qwen", "kanban", "--board", board, "create",
        card["title"], "--body", body, "--created-by", card["owner"],
        "--priority", str(priority), "--idempotency-key", idem, "--json",
    ]
    if card["status"] in ("in_progress", "active"):
        args += ["--initial-status", "running"]
    if dry_run:
        print(f"[dry-run] {card['title']} ({card['owner']})")
        continue
    subprocess.run(args, env=env, check=True, capture_output=True)
    print(f"created: {card['title']}")
PY

echo "Done. List with:"
echo "  hermes --profile qwen kanban --board $BOARD list"