// Shared state for the Black Code Bright terminal party.
// One small JSON file in ~/.claude/bcb/state.json, written atomically and
// changed under a lock so hooks that fire together never lose updates.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const DIR = process.env.BCB_DIR || path.join(os.homedir(), '.claude', 'bcb');
const FILE = path.join(DIR, 'state.json');
const CONFIG = path.join(DIR, 'config.json');
const DAY = 24 * 60 * 60 * 1000;

const CLASSES = {
  // subagent type -> class; anything unknown is a fighter
  plan: 'wizard', planner: 'wizard', architect: 'wizard',
  'general-purpose': 'fighter', builder: 'fighter', claude: 'fighter',
  test: 'rogue', tester: 'rogue', debug: 'rogue',
  review: 'cleric', reviewer: 'cleric', 'code-reviewer': 'cleric',
  deploy: 'paladin', deployer: 'paladin', security: 'paladin',
  explore: 'ranger', scout: 'ranger', research: 'ranger', search: 'ranger',
};

function classFor(type) {
  const t = String(type || '').toLowerCase();
  if (CLASSES[t]) return CLASSES[t];
  for (const k of Object.keys(CLASSES)) if (t.includes(k)) return CLASSES[k];
  return 'fighter';
}

function empty() { return { hero: { xp: 0, lvl: 1, flash: 0 }, sessions: {} }; }

function load() {
  try {
    const s = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!s.hero) s.hero = empty().hero;
    if (!s.sessions) s.sessions = {};
    return s;
  } catch (e) { return empty(); }
}

function save(s) {
  const now = Date.now();
  for (const [id, x] of Object.entries(s.sessions)) if (now - (x.t || 0) > DAY) delete s.sessions[id];
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = FILE + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(s));
  fs.renameSync(tmp, FILE);
}

// Hooks can fire at the same time (PostToolUse is async), so a plain
// load -> change -> save from two processes loses one of the changes.
// update() holds a lock directory around the whole thing; mkdir is atomic
// on every platform, so only one process can own it at a time.
const LOCK = FILE + '.lock';
const LOCK_STALE = 3000; // a hook is killed at 5s; anything older than this is a dead owner
const LOCK_WAIT = 2500;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function lock() {
  const until = Date.now() + LOCK_WAIT;
  for (;;) {
    try { fs.mkdirSync(LOCK); return true; } catch (e) { if (e.code !== 'EEXIST') throw e; }
    try { if (Date.now() - fs.statSync(LOCK).mtimeMs > LOCK_STALE) fs.rmdirSync(LOCK); } catch (e) { /* gone already */ }
    if (Date.now() > until) return false;
    sleep(5 + Math.floor(Math.random() * 10));
  }
}
function unlock() { try { fs.rmdirSync(LOCK); } catch (e) { /* already gone */ } }

// Run fn(state) under the lock and save the result. Returns false if the
// lock never came free; the change is then dropped rather than clobbering.
function update(fn) {
  fs.mkdirSync(DIR, { recursive: true });
  if (!lock()) return false;
  try { const s = load(); fn(s); save(s); return true; }
  finally { unlock(); }
}

function session(s, id) {
  const k = id || 'default';
  if (!s.sessions[k]) s.sessions[k] = { party: {}, conds: {}, tasks: { made: 0, done: 0 }, t: Date.now() };
  return s.sessions[k];
}

function config() {
  try { return Object.assign({ class: 'fighter' }, JSON.parse(fs.readFileSync(CONFIG, 'utf8'))); }
  catch (e) { return { class: 'fighter' }; }
}

const need = (lvl) => 100 * lvl;
function gainXp(s, n) {
  const h = s.hero;
  h.xp += n;
  while (h.xp >= need(h.lvl)) { h.xp -= need(h.lvl); h.lvl++; h.flash = Date.now(); }
}

module.exports = { DIR, FILE, CONFIG, load, save, update, session, config, classFor, gainXp, need };
