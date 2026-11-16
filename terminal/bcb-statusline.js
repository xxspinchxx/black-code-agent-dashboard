#!/usr/bin/env node
// Claude Code status line in Black Code Bright colours.
// ⚔ LV 3 fighter 120/300xp  HP ██████░░░░ 54%  slots ◆◆◆◇  poisoned  party fighter▸ ranger✓  tasks 2/5
'use strict';
const st = require('./bcb-state');

const plain = !!process.env.NO_COLOR;
const rgb = (hex) => (t) => plain ? t : `\x1b[38;2;${parseInt(hex.slice(1, 3), 16)};${parseInt(hex.slice(3, 5), 16)};${parseInt(hex.slice(5, 7), 16)}m${t}\x1b[0m`;
const C = {
  white: rgb('#FFFFFF'), muted: rgb('#979797'), gray: rgb('#515151'), keyword: rgb('#AA66FF'),
  number: rgb('#FFAE00'), blu: rgb('#00A9FF'), red: rgb('#D40000'), err: rgb('#E56666'), changed: rgb('#F9480C'),
};
const bold = (t) => plain ? t : `\x1b[1m${t}\x1b[22m`;

const FADE = 90 * 1000;      // failures fade after 90 s
const SHOW_DONE = 60 * 1000; // finished party members linger a minute

function line(input) {
  const s = st.load();
  const cfg = st.config();
  const ses = st.session(s, input.session_id);
  const now = Date.now();
  const out = [];

  // hero
  const h = s.hero;
  if (now - (h.flash || 0) < 30000) out.push(C.changed(bold('~ LEVEL UP')));
  out.push(C.keyword(bold(`⚔ LV ${h.lvl} ${cfg.class}`)) + ' ' + C.muted(`${h.xp}/${st.need(h.lvl)}xp`));

  // hp = context left
  const cw = input.context_window || {};
  let left = cw.remaining_percentage;
  if (left == null && cw.used_percentage != null) left = 100 - cw.used_percentage;
  if (left != null) {
    left = Math.max(0, Math.min(100, Math.round(left)));
    const n = Math.round(left / 10);
    const col = left < 10 ? C.red : left < 25 ? C.number : C.white;
    out.push(C.muted('HP ') + col('█'.repeat(n)) + C.gray('░'.repeat(10 - n)) + ' ' + C.number(left + '%'));
  }

  // spell slots = five-hour rate limit left, one slot per 25%
  const five = input.rate_limits && input.rate_limits.five_hour;
  let exhausted = left != null && left < 15;
  if (five && five.used_percentage != null) {
    const free = Math.max(0, 100 - five.used_percentage);
    const k = Math.ceil(free / 25);
    out.push(C.muted('slots ') + C.keyword('◆'.repeat(k)) + C.gray('◇'.repeat(4 - k)));
    if (free < 10) exhausted = true;
  }

  // conditions
  const conds = [];
  if (ses.conds.charmed) conds.push(C.number('charmed'));
  for (const c of ['poisoned', 'restrained']) if (ses.conds[c] && now - ses.conds[c] < FADE) conds.push(C.err('! ' + c));
  if (exhausted) conds.push(C.err('! exhausted'));
  if (ses.rest && now - ses.rest < 30000) conds.push(C.changed('~ long rest'));
  if (conds.length) out.push(conds.join(' '));

  // party = subagents
  const party = Object.values(ses.party).filter((a) => a.state === 'running' || now - a.t < SHOW_DONE);
  if (party.length) {
    const shown = party.slice(-4).map((a) => a.state === 'running' ? C.blu(a.cls + '▸') : C.white(a.cls + '✓'));
    const more = party.length > 4 ? C.muted(` +${party.length - 4}`) : '';
    out.push(C.muted('party ') + shown.join(' ') + more);
  }

  // tasks
  if (ses.tasks.made) out.push(C.muted('tasks ') + C.number(`${ses.tasks.done}/${ses.tasks.made}`));

  return out.join(C.gray('  '));
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch (e) { /* show what we can */ }
  try { process.stdout.write(line(input) + '\n'); } catch (e) { process.stdout.write('⚔ black code bright\n'); }
});
