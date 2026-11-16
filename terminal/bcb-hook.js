#!/usr/bin/env node
// Claude Code hook: turns session events into party state for the status line.
// Never blocks Claude: always exits 0 and prints nothing.
'use strict';
const st = require('./bcb-state');

const TESTS = /\b(test|tests|jest|vitest|pytest|mocha|spec|ci)\b/i;

// load -> change -> save happens inside st.update, under a lock, so hooks
// that fire at the same time can't overwrite each other's changes.
function handle(ev) { st.update((s) => apply(s, ev)); }

function apply(s, ev) {
  const name = ev.hook_event_name;
  const ses = st.session(s, ev.session_id);
  const now = Date.now();
  ses.t = now;

  switch (name) {
    case 'SessionStart':
      // only a fresh start or /clear wipes the party; resume and compact keep it
      if (ev.source === 'startup' || ev.source === 'clear') { ses.party = {}; ses.conds = {}; ses.tasks = { made: 0, done: 0 }; }
      if (ev.source === 'compact') ses.rest = now; // compacting = a long rest
      break;
    case 'PreCompact':
      ses.rest = now;
      break;
    case 'SubagentStart': {
      const id = ev.agent_id || ('a' + now);
      ses.party[id] = { type: ev.agent_type || 'agent', cls: st.classFor(ev.agent_type), state: 'running', t: now };
      break;
    }
    case 'SubagentStop': {
      const id = ev.agent_id;
      const a = id && ses.party[id];
      if (a) { a.state = 'done'; a.t = now; }
      else {
        // older payloads have no agent_id: finish the oldest running member of that type
        const r = Object.values(ses.party).find((x) => x.state === 'running' && (!ev.agent_type || x.type === ev.agent_type));
        if (r) { r.state = 'done'; r.t = now; }
      }
      st.gainXp(s, 40);
      break;
    }
    case 'PermissionRequest':
      ses.conds.charmed = now; // waiting on you
      break;
    case 'PostToolUse':
      delete ses.conds.charmed;
      break;
    case 'PostToolUseFailure': {
      const what = JSON.stringify(ev.tool_input || {}) + ' ' + String(ev.error || '');
      ses.conds[ev.tool_name === 'Bash' && TESTS.test(what) ? 'poisoned' : 'restrained'] = now;
      delete ses.conds.charmed;
      break;
    }
    case 'TaskCreated':
      ses.tasks.made++;
      break;
    case 'TaskCompleted':
      ses.tasks.done++;
      ses.tasks.made = Math.max(ses.tasks.made, ses.tasks.done);
      st.gainXp(s, 40);
      break;
    case 'Stop':
      delete ses.conds.charmed;
      st.gainXp(s, 5);
      break;
    default:
      return;
  }
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  try { handle(JSON.parse(raw || '{}')); } catch (e) { /* never break Claude */ }
  process.exit(0);
});
