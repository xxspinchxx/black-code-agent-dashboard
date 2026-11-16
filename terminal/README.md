# terminal: the party in your Claude Code status line

A status line in Black Code Bright colours that shows your real session as a D&D party:

```
⚔ LV 3 fighter 120/300xp  HP ██████░░░░ 54%  slots ◆◆◆◇  ! poisoned  party ranger▸ cleric✓  tasks 2/5
```

| shows | comes from |
|---|---|
| LV and xp | finished tasks (+40), finished subagents (+40), finished turns (+5); level L needs 100 × L xp, kept across sessions |
| HP | context window left; yellow under 25%, red under 10% |
| slots | five-hour rate limit left, one slot per 25% |
| charmed | Claude is waiting for you to approve something |
| poisoned | a test or CI command failed (fades after 90 s) |
| restrained | another tool failed (fades after 90 s) |
| exhausted | HP under 15% or slots nearly gone |
| long rest | the context was just compacted |
| party | subagents: running ▸, done ✓ (shown for a minute) |
| tasks | tasks done / made this session |

Subagent classes: Plan is a wizard, Explore a ranger, reviewers clerics, testers rogues, deploy and security paladins, everything else a fighter.

## Install

Needs Node, which Claude Code already uses.

```
node terminal/install.js                  # you start as a fighter
node terminal/install.js --class wizard   # or wizard, rogue, cleric, paladin, ranger
node terminal/install.js --uninstall
```

It copies three scripts to `~/.claude/bcb/`, adds the status line and hooks to `~/.claude/settings.json` (keeping your other hooks; a backup goes to `settings.json.bcb-backup`), then you restart Claude Code. The hooks never block Claude and print nothing.
