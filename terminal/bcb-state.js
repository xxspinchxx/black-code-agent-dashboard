// Shared state for the Black Code Bright terminal party.
// One small JSON file in ~/.claude/bcb/state.json, written atomically and
// changed under a lock so hooks that fire together never lose updates.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

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
// update() holds a lock around the whole thing.
//
// How the lock works:
// - Each process writes its own ticket file (pid + time), then hard-links it
//   to the lock name. link() is atomic and fails if the name exists, so only
//   one process wins. The lock and the winner's ticket are the same inode.
// - A lock is only taken over when its owner process has exited (or it is far
//   older than any hook can live). Age alone never steals a live hook's lock.
// - Takeovers happen one at a time under a second "reclaim" lock, and the
//   stale lock is re-checked (same inode, owner still gone) right before it is
//   removed, so a fresh lock someone just took can't be deleted by mistake.
// - unlock() removes the lock only if it is still our inode.
const LOCK = FILE + '.lk';
const RECLAIM = FILE + '.lk-reclaim';
const LOCK_WAIT = 2500;   // give up (drop the change) after this long
const MAX_AGE = 30000;    // hooks are killed at 5s; older than this can't be a live hook
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
// What a lock name points at right now: its inode, and whether its owner is gone.
function probe(name) {
  let ino, info;
  try {
    ino = fs.statSync(name).ino;
    info = JSON.parse(fs.readFileSync(name, 'utf8'));
  } catch (e) { return ino === undefined ? null : { ino, dead: false }; } // mid-read: assume live
  if (!info || !info.pid || !info.t) return { ino, dead: false };
  return { ino, dead: !alive(info.pid) || Date.now() - info.t > MAX_AGE };
}
function link(ticket, name) {
  try { fs.linkSync(ticket, name); return true; } catch (e) { if (e.code === 'EEXIST') return false; throw e; }
}
// Remove name only if it is still the inode we checked.
function unlinkIf(name, ino) {
  try { if (fs.statSync(name).ino === ino) fs.unlinkSync(name); } catch (e) { /* already gone */ }
}

function reclaim(ticket, mine) {
  if (!link(ticket, RECLAIM)) {
    // someone else is reclaiming; only clear their reclaim lock if they died holding it
    const r = probe(RECLAIM);
    if (r && r.dead) unlinkIf(RECLAIM, r.ino);
    return;
  }
  try {
    // re-check under the reclaim lock: only this process can remove a stale LOCK now,
    // and a live owner only ever removes its own inode
    const p = probe(LOCK);
    if (p && p.dead) unlinkIf(LOCK, p.ino);
  } finally { unlinkIf(RECLAIM, mine); }
}

function lock(ticket, mine) {
  const until = Date.now() + LOCK_WAIT;
  for (;;) {
    if (link(ticket, LOCK)) return true;
    const p = probe(LOCK);
    if (p && p.dead) reclaim(ticket, mine);
    if (Date.now() > until) return false;
    sleep(5 + Math.floor(Math.random() * 10));
  }
}

// Run fn(state) under the lock and save the result. Returns false if the
// lock never came free; the change is then dropped rather than clobbering.
function update(fn) {
  fs.mkdirSync(DIR, { recursive: true });
  const ticket = FILE + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.ticket';
  fs.writeFileSync(ticket, JSON.stringify({ pid: process.pid, t: Date.now() }));
  const mine = fs.statSync(ticket).ino;
  try {
    if (!lock(ticket, mine)) return false;
    try { const s = load(); fn(s); save(s); return true; }
    finally { unlinkIf(LOCK, mine); } // release only our own lock
  } finally { try { fs.unlinkSync(ticket); } catch (e) { /* gone */ } }
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
