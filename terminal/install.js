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

const ours = (h) => !!h && /bcb-(hook|statusline)\.js/.test(h.command || '');
const hasOurs = (s) => ours(s.statusLine) ||
  Object.values(s.hooks || {}).some((gs) => (gs || []).some((g) => (g.hooks || []).some(ours)));
// the status line we replaced, kept outside settings.json so reinstalls can't overwrite it
const DISPLACED = path.join(DEST, 'displaced-statusline.json');
const ORIGINAL = SETTINGS + '.bcb-original';
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };

let settings = {};
if (fs.existsSync(SETTINGS)) {
  const text = fs.readFileSync(SETTINGS, 'utf8');
  try { settings = JSON.parse(text); } catch (e) { console.error('~/.claude/settings.json is not valid JSON; fix it first.'); process.exit(1); }
  // last-run safety copy; may already contain our changes
  fs.writeFileSync(SETTINGS + '.bcb-backup', text);
  // true pre-install copy: only taken while none of our changes are in settings
  if (!uninstall && !hasOurs(settings)) fs.writeFileSync(ORIGINAL, text);
}
const statusWasOurs = ours(settings.statusLine);
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
  let restored = false;
  // only put the old status line back if ours is still the active one;
  // if you switched to another status line since, that one stays
  if (statusWasOurs) {
    let rec = readJson(DISPLACED);
    if (!rec) { // installs from before this file existed: fall back to the pre-install copies
      const old = [ORIGINAL, SETTINGS + '.bcb-backup'].map(readJson).find((s) => s && s.statusLine && !ours(s.statusLine));
      rec = old ? { statusLine: old.statusLine } : null;
    }
    if (rec && rec.statusLine && !ours(rec.statusLine)) { settings.statusLine = rec.statusLine; restored = true; }
  }
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
  try { fs.unlinkSync(DISPLACED); } catch (e) { /* none */ }
  console.log('Removed the Black Code Bright status line and hooks.' + (restored ? ' Restored your previous status line.' : '') +
    ' Your party data is still in ' + DEST);
  process.exit(0);
}

fs.mkdirSync(DEST, { recursive: true });
// remember a status line we're about to replace; on a reinstall (ours already active) keep the earlier record
if (settings.statusLine) fs.writeFileSync(DISPLACED, JSON.stringify({ statusLine: settings.statusLine }, null, 2) + '\n');
else if (!statusWasOurs) { try { fs.unlinkSync(DISPLACED); } catch (e) { /* none */ } }
for (const f of FILES) fs.copyFileSync(path.join(__dirname, f), path.join(DEST, f));
const cfgFile = path.join(DEST, 'config.json');
const cfg = fs.existsSync(cfgFile) ? JSON.parse(fs.readFileSync(cfgFile, 'utf8')) : {};
if (cls || !cfg.class) cfg.class = cls || 'fighter';
fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + '\n');

const run = (f) => `node "${path.join(DEST, f)}"`;
if (settings.statusLine) console.log('Note: replaced your existing status line; --uninstall puts it back.');
settings.statusLine = { type: 'command', command: run('bcb-statusline.js'), padding: 0 };
for (const ev of EVENTS) {
  const hook = { type: 'command', command: run('bcb-hook.js'), timeout: 5 };
  if (ev === 'PostToolUse') hook.async = true; // runs after every tool: never make Claude wait
  (settings.hooks[ev] = settings.hooks[ev] || []).push({ hooks: [hook] });
}
fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
// a reinstall keeps your level: report the saved one, not LV 1
const hero = (readJson(path.join(DEST, 'state.json')) || {}).hero || {};
console.log(`Installed. You are a LV ${hero.lvl || 1} ${cfg.class}. Restart Claude Code to see the status line.`);
