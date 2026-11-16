# black-code-agent-dashboard
agent dasbarod with a dnd twist

A terminal-style control room for agents, built on the **Black Code Bright** design system: solid black background, white text, gray borders, Courier New 13px / 1.25 everywhere. Red means critical, orange means something changed.

## What's in it
- `index.html`: the whole dashboard in one self-contained file (no build step)
- `terminal/`: a Claude Code status line that shows your real session as a party (HP, conditions, subagents, xp). Install with `node terminal/install.js`

## Screens
- **agents**: pixel-robot agents, their tasks, notes, token use, and a text box to command them
- **skill checks**: d20 + modifier vs DC, with levels, XP and gear
- **github**: reads branches, issues and PRs from a repo and turns them into agent tasks (live mode)
- **cheat sheet**: every command, rule and design token

## Running it
Open `index.html` in a browser. Opened as a claude.ai artifact, it saves to your account and reads GitHub through your MCP connection. Opened anywhere else, it saves in the browser and the github screen is read-only demo text.
