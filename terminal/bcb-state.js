// Shared state for the Black Code Bright terminal party.
// One small JSON file in ~/.claude/bcb/state.json, written atomically.
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

module.exports = { DIR, FILE, CONFIG, load, save, session, config, classFor, gainXp, need };
