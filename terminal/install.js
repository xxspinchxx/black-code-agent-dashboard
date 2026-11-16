#!/usr/bin/env node
// Installs the Black Code Bright status line and hooks into Claude Code.
//   node terminal/install.js                 install (class: fighter)
//   node terminal/install.js --class wizard  pick your class
//   node terminal/install.js --uninstall     remove it all
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = path.join(os.homedir(), '.claude');
const DEST = path.join(HOME, 'bcb');
const SETTINGS = path.join(HOME, 'settings.json');
const FILES = ['bcb-state.js', 'bcb-hook.js', 'bcb-statusline.js'];
const CLASSES = ['wizard', 'fighter', 'rogue', 'cleric', 'paladin', 'ranger'];
const EVENTS = ['SessionStart', 'PreCompact', 'SubagentStart', 'SubagentStop', 'PermissionRequest', 'PostToolUse', 'PostToolUseFailure', 'TaskCreated', 'TaskCompleted', 'Stop'];

const args = process.argv.slice(2);
const uninstall = args.includes('--uninstall');
const ci = args.indexOf('--class');
const cls = ci >= 0 ? String(args[ci + 1] || '').toLowerCase() : null;
if (cls && !CLASSES.includes(cls)) { console.error('class must be one of: ' + CLASSES.join(', ')); process.exit(1); }

let settings = {};
if (fs.existsSync(SETTINGS)) {
  const text = fs.readFileSync(SETTINGS, 'utf8');
  try { settings = JSON.parse(text); } catch (e) { console.error('~/.claude/settings.json is not valid JSON; fix it first.'); process.exit(1); }
  fs.writeFileSync(SETTINGS + '.bcb-backup', text);
}

const ours = (h) => /bcb-(hook|statusline)\.js/.test(h.command || '');
// drop any earlier copy of our hooks, keep everyone else's
settings.hooks = settings.hooks || {};
for (const ev of Object.keys(settings.hooks)) {
  settings.hooks[ev] = settings.hooks[ev]
    .map((g) => Object.assign({}, g, { hooks: (g.hooks || []).filter((h) => !ours(h)) }))
    .filter((g) => g.hooks.length);
  if (!settings.hooks[ev].length) delete settings.hooks[ev];
}
if (settings.statusLine && ours(settings.statusLine)) delete settings.statusLine;

if (uninstall) {
  if (!Object.keys(settings.hooks).length) delete settings.hooks;
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
  console.log('Removed the Black Code Bright status line and hooks. Your party data is still in ' + DEST);
  process.exit(0);
}

fs.mkdirSync(DEST, { recursive: true });
for (const f of FILES) fs.copyFileSync(path.join(__dirname, f), path.join(DEST, f));
const cfgFile = path.join(DEST, 'config.json');
const cfg = fs.existsSync(cfgFile) ? JSON.parse(fs.readFileSync(cfgFile, 'utf8')) : {};
if (cls || !cfg.class) cfg.class = cls || 'fighter';
fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + '\n');

const run = (f) => `node "${path.join(DEST, f)}"`;
if (settings.statusLine) console.log('Note: replaced your existing status line (a copy is in settings.json.bcb-backup).');
settings.statusLine = { type: 'command', command: run('bcb-statusline.js'), padding: 0 };
for (const ev of EVENTS) {
  const hook = { type: 'command', command: run('bcb-hook.js'), timeout: 5 };
  if (ev === 'PostToolUse') hook.async = true; // runs after every tool: never make Claude wait
  (settings.hooks[ev] = settings.hooks[ev] || []).push({ hooks: [hook] });
}
fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
console.log(`Installed. You are a LV 1 ${cfg.class}. Restart Claude Code to see the status line.`);
