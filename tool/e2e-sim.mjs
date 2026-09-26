#!/usr/bin/env node
/**
 * End-to-end run of the real app in the iOS Simulator.
 *
 *   npm run e2e:sim                    one full run
 *   npm run e2e:sim -- --runs 3        three runs (each deals different roles and pairs)
 *   npm run e2e:sim -- --keep-open     leave the Simulator open afterwards
 *
 * Needs the app built and installed on the Simulator once (`npx expo run:ios`).
 * Runs the dev build against Metro and drives it through the Hermes debugger:
 * finds components by testID in the live React tree, calls their real
 * handlers, reads the text on screen and screenshots each key screen.
 *
 * Each run starts from empty app storage, plays seven games covering every
 * screen and rule, kills and reopens the app to check what was kept, and puts
 * the Simulator back as it found it. Not covered: real finger taps, the real
 * keyboard, Apple's file picker UI (a file is handed in its place) and vibration.
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, openSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const BUNDLE = 'com.shubham.undercover';
const DEVICE = process.env.E2E_DEVICE ?? 'iPhone 16 Pro';
const arg = (name) => process.argv.includes(name);
const RUNS = Number(process.argv[process.argv.indexOf('--runs') + 1]) || 1;
const OUT = join(tmpdir(), 'undercover-e2e', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(OUT, { recursive: true });

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ keep the Mac awake
// On battery this Mac sleeps after a minute idle, which cuts the app off from
// Metro mid-run. Hold the Mac awake while the run lasts — but never with the lid
// shut: a closed laptop kept awake (in a bag, say) can overheat.
const lidClosed = /"AppleClamshellState" = Yes/.test(sh('ioreg -r -k AppleClamshellState -d 4'));
if (lidClosed) {
  console.error('The lid is closed, so the Mac would sleep mid-run. Open it and run again.');
  process.exit(2);
}
spawn('caffeinate', ['-dim', '-w', String(process.pid)], { detached: true, stdio: 'ignore' }).unref();

// ------------------------------------------------------------------ simulator
const devices = JSON.parse(sh('xcrun simctl list devices available -j')).devices;
const device = Object.values(devices).flat().find((d) => d.name === DEVICE);
if (!device) throw new Error(`No simulator called "${DEVICE}". Set E2E_DEVICE.`);
const UDID = device.udid;
try { sh(`xcrun simctl boot ${UDID}`); } catch { /* already booted */ }
sh('open -a Simulator');
let DATA;
try { DATA = sh(`xcrun simctl get_app_container ${UDID} ${BUNDLE} data`); } catch {
  throw new Error(`The app is not installed on "${DEVICE}". Run \`npx expo run:ios\` once first.`);
}
const DOCS = join(DATA, 'Documents');
const PICKED = join(DATA, 'Library/Caches/DocumentPicker/hindi.txt');
const clearStorage = () => {
  for (const f of ['players.json', 'leaderboard.json', 'settings.json', 'wordlist.json']) rmSync(join(DOCS, f), { force: true });
};
const onDisk = (f) => (existsSync(join(DOCS, f)) ? JSON.parse(readFileSync(join(DOCS, f), 'utf8')) : null);
const quitApp = () => { try { sh(`xcrun simctl terminate ${UDID} ${BUNDLE}`); } catch { /* not running */ } };
const openApp = () => sh(`xcrun simctl openurl ${UDID} "${BUNDLE}://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"`);

// ------------------------------------------------------------------ metro
const metroUp = async () => {
  try { return (await (await fetch('http://localhost:8081/status')).text()).includes('running'); } catch { return false; }
};
let metro = null;
if (!(await metroUp())) {
  const log = openSync(join(OUT, 'metro.log'), 'w');
  metro = spawn('npx', ['expo', 'start', '--port', '8081'], { cwd: ROOT, env: { ...process.env, CI: '1' }, detached: true, stdio: ['ignore', log, log] });
  for (let i = 0; i < 90 && !(await metroUp()); i++) await sleep(1000);
  if (!(await metroUp())) throw new Error('Metro did not start; see metro.log');
}

// ------------------------------------------------------------------ debugger connection
let ws = null;
let nextId = 1;
const pendingMsgs = new Map();
let lost = '';
const evaluate = (expression) => new Promise((ok, fail) => {
  if (lost) return fail(new Error(lost));
  const id = nextId++;
  const timer = setTimeout(async () => {
    pendingMsgs.delete(id);
    if (process.env.E2E_TRACE) {
      let targets = '';
      try { targets = JSON.stringify((await (await fetch('http://localhost:8081/json/list')).json()).map((x) => [x.id, x.title])); } catch (e) { targets = String(e); }
      console.log(`[trace] ${new Date().toISOString()} timeout on: ${expression.replace(/\s+/g, ' ').slice(-160)} | socket state ${ws.readyState} | targets ${targets}`);
    }
    fail(new Error('debugger timeout'));
  }, 8000);
  pendingMsgs.set(id, (m) => { clearTimeout(timer); ok(m); });
  ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
}).then((r) => {
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
});
/** Opens the app and connects to it once setup is on screen. */
const launch = async () => {
  quitApp();
  openApp();
  await sleep(4000);
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const targets = await (await fetch('http://localhost:8081/json/list')).json();
      if (targets.length) {
        if (ws) ws.close();
        ws = new WebSocket(targets[targets.length - 1].webSocketDebuggerUrl);
        await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
        ws.onmessage = (m) => {
          const msg = JSON.parse(m.data);
          if (msg.id && pendingMsgs.has(msg.id)) { pendingMsgs.get(msg.id)(msg); pendingMsgs.delete(msg.id); }
          else if (process.env.E2E_TRACE && msg.method) console.log(`[trace] ${new Date().toISOString()} event ${msg.method} ${JSON.stringify(msg.params ?? {}).slice(0, 200)}`);
        };
        const sock = ws;
        lost = '';
        ws.onclose = (e) => {
          if (process.env.E2E_TRACE) console.log(`[trace] ${new Date().toISOString()} socket closed code=${e.code} reason=${e.reason} current=${sock === ws}`);
          if (sock !== ws) return; //  an old connection we replaced
          lost = `lost the connection to the app (${e.reason || e.code}) — did the Mac sleep?`;
          for (const [id, done] of pendingMsgs) { pendingMsgs.delete(id); done({ result: { exceptionDetails: { text: lost } } }); }
        };
        if (await exists('setup-screen')) return;
      }
    } catch { /* app still starting */ }
    await sleep(1000);
  }
  throw new Error('The app did not reach the setup screen');
};

const PRELUDE = `
  const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  const each = (visit) => {
    for (const rid of hook.renderers.keys()) for (const root of hook.getFiberRoots(rid)) {
      const stack = [root.current];
      while (stack.length) {
        const f = stack.pop();
        if (visit(f) === true) return true;
        if (f.sibling) stack.push(f.sibling);
        if (f.child) stack.push(f.child);
      }
    }
    return false;
  };
  const find = (pred) => { let out = null; each((f) => { if (f.memoizedProps && pred(f.memoizedProps, f)) { out = f.memoizedProps; return true; } }); return out; };
  const flat = (c) => Array.isArray(c) ? c.map(flat).join('') : (c === null || c === undefined || typeof c === 'boolean') ? '' : (typeof c === 'object' ? flat(c.props && c.props.children) : String(c));
`;

// ------------------------------------------------------------------ checks
let results = [];
let runTag = '';
const check = (name, ok, detail = '') => {
  results.push({ run: runTag, name, ok: !!ok, detail: String(detail) });
  if (!ok || process.env.E2E_VERBOSE) console.log(`${ok ? 'PASS' : 'FAIL'}  [${runTag}] ${name}${detail !== '' ? `  — ${detail}` : ''}`);
};

// ------------------------------------------------------------------ driving
const call = async (testID, handler, arg) => {
  const r = await evaluate(`(() => { ${PRELUDE}
    const p = find((p) => p.testID === ${JSON.stringify(testID)} && typeof p.${handler} === 'function');
    if (!p) return 'MISSING';
    if (p.disabled) return 'DISABLED';
    p.${handler}(${arg === undefined ? '{nativeEvent:{}}' : JSON.stringify(arg)});
    return 'ok';
  })()`);
  if (r !== 'ok') throw new Error(`${handler} ${testID}: ${r}`);
  await sleep(480); // past every dead zone, and time to render
};
const press = (id) => call(id, 'onPress');
const type = (id, value) => call(id, 'onChangeText', value);
const exists = (id) => evaluate(`(() => { ${PRELUDE} return !!find((p) => p.testID === ${JSON.stringify(id)}); })()`);
const text = (id) => evaluate(`(() => { ${PRELUDE} const p = find((p) => p.testID === ${JSON.stringify(id)}); return p ? flat(p.children) : null; })()`);
const props = (id) => evaluate(`(() => { ${PRELUDE} const p = find((p) => p.testID === ${JSON.stringify(id)}); return p && { disabled: !!p.disabled, value: p.value, selected: !!(p.accessibilityState && p.accessibilityState.selected) }; })()`);
const ids = (re) => evaluate(`(() => { ${PRELUDE} const out = []; const re = new RegExp(${JSON.stringify(re.source)}); each((f) => { const p = f.memoizedProps; if (typeof f.type === 'string' && p && typeof p.testID === 'string' && re.test(p.testID)) out.push(p.testID); }); return [...new Set(out)].sort(); })()`);
const texts = () => evaluate(`(() => { ${PRELUDE} const out = []; each((f) => { if (f.type === 'RCTText' && f.memoizedProps) { const t = flat(f.memoizedProps.children); if (t) out.push(t); } }); return out; })()`);
const screenText = async () => (await texts()).join(' | ');
/** The text cells inside one row, in reading order. */
const cells = (id) => evaluate(`(() => { ${PRELUDE}
  let row = null; each((f) => { if (typeof f.type === 'string' && f.memoizedProps && f.memoizedProps.testID === ${JSON.stringify(id)}) { row = f; return true; } });
  if (!row) return null;
  const out = []; const stack = [row.child];
  while (stack.length) { const f = stack.pop(); if (!f) continue; if (f.sibling) stack.push(f.sibling); if (f.type === 'RCTText') { out.push(flat(f.memoizedProps.children)); } else if (f.child) stack.push(f.child); }
  return out;
})()`);
const selectedIds = (re) => evaluate(`(() => { ${PRELUDE} const out = []; const re = new RegExp(${JSON.stringify(re.source)}); each((f) => { const p = f.memoizedProps; if (p && typeof p.testID === 'string' && re.test(p.testID) && p.accessibilityState && p.accessibilityState.selected) out.push(p.testID); }); return [...new Set(out)]; })()`);
/** The game's own state, read from the Game component's reducer hook. */
const st = () => evaluate(`(() => { ${PRELUDE}
  let s = null;
  each((f) => { const p = f.memoizedProps; if (p && typeof p.nextPair === 'function' && p.initial) {
    for (let h = f.memoizedState; h; h = h.next) { const v = h.memoizedState; if (v && Array.isArray(v.players) && v.phase) { s = v; return true; } } } });
  if (!s) return null;
  return { phase: s.phase, round: s.round, winner: s.winner, civilianWord: s.civilianWord, undercoverWord: s.undercoverWord,
    votingMode: s.settings.votingMode, allowSelfVote: s.settings.allowSelfVote, speakingOrder: s.speakingOrder,
    players: s.players.map((x) => ({ id: x.id, name: x.name, seat: x.seat, role: x.role, status: x.status, cause: x.eliminationCause, order: x.eliminationOrder })) };
})()`);
const shot = (name) => sh(`xcrun simctl io ${UDID} screenshot "${join(OUT, `${runTag}-${name}.png`)}"`);
const waitFor = async (id, ms = 8000) => {
  for (let t = 0; t < ms; t += 250) { if (await exists(id)) return true; await sleep(250); }
  return false;
};

// Is a secret word on screen? Letters either side mean it is part of a longer
// word ("Tea" in "Team"), which is not a leak.
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordHits = async (words) => {
  const all = await screenText();
  return words.filter((w) => w && new RegExp(`(^|[^\\p{L}\\p{M}])${esc(w)}($|[^\\p{L}\\p{M}])`, 'iu').test(all));
};
const noLeak = async (label, words) => {
  const hits = await wordHits(words);
  check(`no secret word on screen: ${label}`, hits.length === 0, hits.join(', '));
};

// ------------------------------------------------------------------ game pieces
const bySeat = (s) => [...s.players].sort((a, b) => a.seat - b.seat);
const wordsOf = (s) => [s.civilianWord, s.undercoverWord];

/** Every player sees their own card; `detailed` checks each card on the way. */
const dealAll = async (label, detailed) => {
  const s = await st();
  const seats = bySeat(s);
  let i = 0;
  let shotCiv = false;
  while (await exists('reveal-handoff')) {
    const p = seats[i];
    if (detailed) check(`${label}: card ${i + 1} goes to ${p.name} (seat order)`, (await screenText()).includes(p.name));
    await press('reveal-open');
    if (detailed) await noLeak(`${label}: ${p.name}'s card before holding`, wordsOf(s));
    await call('reveal-hold', 'onPressIn');
    const w = await text('reveal-word');
    if (p.role === 'civilian') check(`${label}: ${p.name} (civilian) sees the civilian word`, w === s.civilianWord, w);
    else if (p.role === 'undercover') check(`${label}: ${p.name} (undercover) sees the undercover word`, w === s.undercoverWord, w);
    else check(`${label}: ${p.name} (Mr White) sees no word`, w === null && (await screenText()).includes('No word.') && (await wordHits(wordsOf(s))).length === 0);
    if (detailed && p.role === 'civilian' && !shotCiv) { shot(`${label}-reveal`); shotCiv = true; }
    await call('reveal-hold', 'onPressOut');
    if (detailed) check(`${label}: ${p.name}'s card hides on release`, await exists('reveal-card-covered'));
    await press('reveal-confirm');
    i++;
  }
  check(`${label}: every player saw a card`, i === s.players.length, `${i} of ${s.players.length}`);
  return s;
};

const talk = async (label, words) => {
  await noLeak(`${label} starter`, words);
  await press('starter-go');
  let spoke = 0;
  while (await exists('describe-next')) {
    if (spoke === 0) await noLeak(`${label} describe`, words);
    spoke++;
    await press('describe-next');
  }
  await noLeak(`${label} discuss`, words);
  await press('discuss-vote');
  return spoke;
};

/** Out loud: the table names `targetId`. */
const outLoudRound = async (label, words, targetId) => {
  const spoke = await talk(label, words);
  await noLeak(`${label} vote`, words);
  await press(`vote-${targetId}`);
  await press('vote-confirm');
  await noLeak(`${label} elimination`, words);
  return spoke;
};

/** Secret ballot: everyone votes `target` out; `target` votes the first name offered. */
const secretRoundOut = async (label, words, target) => {
  await talk(label, words);
  while (await exists('ballot-handoff')) {
    const voter = (await text('ballot-voter')).replace('Pass the phone to ', '');
    await press('ballot-open');
    await press(voter === target.name ? (await ids(/^ballot-p\d+$/))[0] : `ballot-${target.id}`);
    await press('ballot-confirm');
  }
  await press('ballot-count');
  check(`${label}: ${target.name} is voted out`, (await text('elimination-name')) === target.name);
};

/** Secret ballot, seats 3 and 4 tie 2–2 and seat 4 skips. Returns the tied pair. */
const secretTie = async (label, words, s) => {
  const seats = bySeat(s);
  const [A, B] = [seats[3], seats[4]];
  const plan = { [seats[0].name]: A.id, [seats[1].name]: B.id, [seats[2].name]: A.id, [A.name]: B.id, [B.name]: 'skip' };
  await talk(label, words);
  const order = [];
  while (await exists('ballot-handoff')) {
    const voter = (await text('ballot-voter')).replace('Pass the phone to ', '');
    order.push(voter);
    await press('ballot-open');
    const me = seats.find((p) => p.name === voter);
    const offered = await ids(/^ballot-p\d+$/);
    check(`${label}: ${voter} is not on their own ballot`, !offered.includes(`ballot-${me.id}`) && offered.length === 4, offered.join());
    check(`${label}: ${voter} sees no earlier vote`, (await selectedIds(/^ballot-p\d+$/)).length === 0);
    if ((await wordHits(words)).length) check(`no secret word on screen: ${label} ballot`, false);
    if (plan[voter] === 'skip') await press('ballot-skip');
    else { await press(`ballot-${plan[voter]}`); await press('ballot-confirm'); }
  }
  check(`${label}: the phone goes round in seat order`, order.join() === seats.map((p) => p.name).join(), order.join());
  check(`${label}: count screen says 4 votes, 1 skip`, (await screenText()).includes('4 votes, 1 skip'));
  await press('ballot-count');
  check(`${label}: a 2–2 tie goes to the tie screen`, (await exists('tie-screen')) && (await screenText()).includes(`${A.name} and ${B.name} — 2 votes each`));
  return [A, B];
};

/** Plays on with simple choices until game over, checking for leaks at every screen. */
const playToEnd = async (label, words) => {
  for (let step = 0; step < 400; step++) {
    if (await exists('gameover-screen')) return true;
    const hits = await wordHits(words);
    if (hits.length) check(`no secret word on screen: ${label} mid-game`, false, `${hits.join(', ')} on: ${(await screenText()).slice(0, 100)}`);
    if (await exists('starter-go')) await press('starter-go');
    else if (await exists('describe-next')) await press('describe-next');
    else if (await exists('discuss-vote')) await press('discuss-vote');
    else if (await exists('vote-confirm')) { await press((await ids(/^vote-p\d+$/))[0]); await press('vote-confirm'); }
    else if (await exists('ballot-confirm')) { await press((await ids(/^ballot-p\d+$/))[0]); await press('ballot-confirm'); }
    else if (await exists('ballot-pass')) await press('ballot-pass');
    else if (await exists('ballot-open')) await press('ballot-open');
    else if (await exists('ballot-count')) await press('ballot-count');
    else if (await exists('tie-random')) await press('tie-random');
    else if (await exists('elimination-continue')) await press('elimination-continue');
    else if (await exists('guess-submit')) { await type('guess-input', 'nope'); await press('guess-submit'); }
    else if (await exists('guess-continue')) await press('guess-continue');
    else { check(`${label}: reached a screen the run can't handle`, false, (await screenText()).slice(0, 120)); return false; }
  }
  return false;
};

/** Game-over points follow the rules; returns {name: points earned}. */
const checkGameOver = async (label) => {
  const s = await st();
  const earned = {};
  for (const p of s.players) {
    const m = /\+(\d+) pts/.exec(((await cells(`gameover-${p.id}`)) ?? []).join(' '));
    earned[p.name] = m ? Number(m[1]) : NaN;
  }
  const lastOut = s.players.filter((p) => p.order !== null).sort((a, b) => b.order - a.order)[0];
  const walkout = lastOut?.cause === 'removed';
  const expected = {};
  for (const p of s.players) {
    let pts = 0;
    if (s.winner === 'civilians' && p.role === 'civilian') pts = 2;
    if (s.winner === 'infiltrators' && p.role === 'undercover') pts = 10;
    if (s.winner === 'infiltrators' && p.role === 'mrwhite') pts = 6;
    if (s.winner === 'mrWhiteGuess' && p.role === 'mrwhite' && p.status !== 'alive' && p.cause !== 'removed') pts = 6;
    expected[p.name] = walkout ? 0 : pts;
  }
  check(`${label}: points follow the rules (${walkout ? 'walkout' : s.winner})`, JSON.stringify(earned) === JSON.stringify(expected), JSON.stringify(earned));
  check(`${label}: game over shows both words`, (await text('gameover-civilian-word')) === s.civilianWord && (await text('gameover-undercover-word')) === s.undercoverWord);
  const hits = await wordHits(wordsOf(s));
  check(`${label}: control — the word check does see words where they are shown`, hits.length === 2, hits.join(', '));
  return earned;
};

const boardRows = async () => {
  const rows = [];
  for (const id of await ids(/^leaderboard-row-\d+$/)) rows.push((await cells(id)).join(' '));
  return rows.sort((a, b) => Number(a.split(' ')[0]) - Number(b.split(' ')[0]));
};

// ================================================================== one run
const NAMES = ['Asha', 'Bilal', 'Chen', 'Dara', 'Eli'];

const play = async () => {
  const expectBoard = {};
  const addToBoard = (earned) => {
    for (const [name, pts] of Object.entries(earned)) {
      const k = name.toLowerCase();
      const e = expectBoard[k] ?? { name, points: 0, wins: 0, games: 0 };
      expectBoard[k] = { name, points: e.points + pts, wins: e.wins + (pts > 0 ? 1 : 0), games: e.games + 1 };
    }
  };

  // ---------------------------------------------------------------- the guess rules, inside Hermes
  const rules = await evaluate(`(() => { const mods = __r.getModules(); const list = mods instanceof Map ? [...mods.values()] : Object.values(mods);
    for (const m of list) { const e = m && m.publicModule && m.publicModule.exports;
      if (e && typeof e.guessMatches === 'function' && typeof e.tidyGuess === 'function') return {
        vowelSign: e.guessMatches('दाल', 'दिल'), nukta: e.guessMatches('कॉफी', 'कॉफ़ी'), accent: e.guessMatches('café', 'cafe'),
        nearMiss: e.guessMatches('coffe', 'Coffee'), tidy: e.tidyGuess('  “nope!”  ') }; }
    return null; })()`);
  check('guess rules on the phone engine: vowel signs count, the nukta dot and accents do not',
    rules && !rules.vowelSign && rules.nukta && rules.accent && !rules.nearMiss && rules.tidy === 'nope', JSON.stringify(rules));

  // ---------------------------------------------------------------- setup
  check('fresh install: nothing saved yet', ['players.json', 'leaderboard.json', 'settings.json', 'wordlist.json'].every((f) => onDisk(f) === null));
  if ((await text('setup-player-count')) !== 'Players: 5') await call('setup-slider', 'onValueChange', 5);
  check('5 players → 3 civilians, 1 undercover, 1 Mr White',
    (await text('setup-civilians')) === '3 Civilians' && (await text('setup-undercover-count')) === '1 Undercover' && (await text('setup-mrwhite-count')) === '1 Mr White');
  for (let i = 0; i < 5; i++) await type(`setup-name-${i}`, NAMES[i]);
  await type('setup-name-1', ' asha ');
  check('a duplicate name is caught and blocks Start', /Two players are called/.test((await text('setup-name-problem')) ?? '') && (await props('setup-start')).disabled);
  shot('01-duplicate-name');
  await type('setup-name-1', 'Bilal');
  check('fixing the name unblocks Start', !(await exists('setup-name-problem')) && !(await props('setup-start')).disabled);
  await press('setup-start');
  check('names are remembered', JSON.stringify(onDisk('players.json')?.slice(0, 5)) === JSON.stringify(NAMES));

  // ---------------------------------------------------------------- G1: out loud, full loop
  const g1 = await dealAll('G1', true);
  const w1 = wordsOf(g1);
  check('G1: the two words differ', g1.civilianWord !== g1.undercoverWord, w1.join(' / '));
  const seats1 = bySeat(g1);
  const civ = seats1.filter((p) => p.role === 'civilian');
  const mrW = seats1.find((p) => p.role === 'mrwhite');
  const und = seats1.find((p) => p.role === 'undercover');
  check('G1: Mr White does not start round 1', (await st()).speakingOrder[0] !== mrW.id);
  check('G1 R1: all 5 describe', (await outLoudRound('G1 R1', w1, civ[0].id)) === 5);
  check('G1 R1: elimination shows name and role, not word', (await text('elimination-name')) === civ[0].name && (await text('elimination-role')) === 'was a Civilian');
  await press('elimination-continue');
  check('G1 R2: the voted-out player no longer speaks', (await outLoudRound('G1 R2', w1, mrW.id)) === 4);
  await press('elimination-continue');
  check('G1: Mr White gets a guess', await exists('guess-screen'));
  await noLeak('G1 guess screen', w1);
  await type('guess-input', ' nope! ');
  await press('guess-submit');
  check('G1: a wrong guess is shown tidied, as wrong', (await text('guess-result-text')) === '“nope”', await text('guess-result-text'));
  await noLeak('G1 wrong-guess screen (the real word stays secret)', w1);
  shot('02-guess-wrong');
  await press('guess-continue');
  await outLoudRound('G1 R3', w1, und.id);
  await press('elimination-continue');
  check('G1: civilians win', (await text('gameover-winner')) === 'Civilians win');
  addToBoard(await checkGameOver('G1'));
  shot('03-gameover');
  await press('gameover-leaderboard');
  await sleep(600);
  const rows1 = await boardRows();
  check('G1: leaderboard shows all 5, civilians on top with 2 pts', rows1.length === 5 && rows1.slice(0, 3).every((r) => / 1 1 2$/.test(r)), rows1.join(' ; '));
  check('G1: leaderboard saved', JSON.stringify(onDisk('leaderboard.json')) === JSON.stringify(expectBoard));
  await press('leaderboard-done');
  await sleep(600);

  // ---------------------------------------------------------------- G2: play again, someone leaves
  await press('gameover-again');
  const g2 = await dealAll('G2', false);
  const w2 = wordsOf(g2);
  check('G2: a different word pair', w2.slice().sort().join('/') !== w1.slice().sort().join('/'), `${w1.join('/')} → ${w2.join('/')}`);
  await press('someone-left');
  await sleep(600);
  await press('leave-cancel');
  await sleep(600);
  check('G2: "someone left" → cancel changes nothing', (await st()).players.every((p) => p.status === 'alive'));
  await press('someone-left');
  await sleep(600);
  const leaver = bySeat(g2).find((p) => p.role === 'civilian');
  await press(`leave-${leaver.id}`);
  shot('04-someone-left');
  await press('leave-confirm');
  await sleep(600);
  const after = await st();
  check(`G2: ${leaver.name} is out as "left", role kept secret`, after.players.find((p) => p.id === leaver.id).cause === 'removed' && !(await screenText()).includes('Civilian'));
  check('G2: the game carries on with 4', after.players.filter((p) => p.status === 'alive').length === 4 && after.phase !== 'gameOver');
  check('G2: played to the end', await playToEnd('G2', w2));
  addToBoard(await checkGameOver('G2'));

  // ---------------------------------------------------------------- G3: secret ballot, tie, revote
  await press('gameover-setup');
  check('back to setup keeps the names', (await props('setup-name-0')).value === 'Asha' && (await props('setup-name-4')).value === 'Eli');
  await press('setup-settings');
  await press('settings-vote-secret');
  await call('settings-abstain', 'onValueChange', true);
  check('settings saved: secret ballot + skipping', JSON.stringify(onDisk('settings.json')) === JSON.stringify({ votingMode: 'secretBallot', allowAbstain: true }));
  shot('05-settings');
  await press('settings-done');
  await press('setup-start');
  const g3 = await dealAll('G3', false);
  const w3 = wordsOf(g3);
  check('G3: secret ballot, and nobody may vote for themselves', g3.votingMode === 'secretBallot' && g3.allowSelfVote === false);
  const [A, B] = await secretTie('G3 R1', w3, g3);
  shot('06-tie');
  await press('tie-revote');
  while (await exists('ballot-handoff')) {
    const voter = (await text('ballot-voter')).replace('Pass the phone to ', '');
    await press('ballot-open');
    const offered = await ids(/^ballot-p\d+$/);
    const want = [A, B].filter((p) => p.name !== voter).map((p) => `ballot-${p.id}`).sort();
    check(`G3 revote: ${voter} is offered only the tied players`, JSON.stringify(offered) === JSON.stringify(want), offered.join());
    await press(`ballot-${voter === A.name ? B.id : A.id}`);
    await press('ballot-confirm');
  }
  await press('ballot-count');
  check(`G3: the revote puts ${A.name} out`, (await text('elimination-name')) === A.name);
  check('G3: played to the end', await playToEnd('G3', w3));
  addToBoard(await checkGameOver('G3'));

  // ---------------------------------------------------------------- G4, G5: a Hindi word list
  await press('gameover-setup');
  await press('setup-settings');
  const patched = await evaluate(`(() => { const mods = __r.getModules(); const list = mods instanceof Map ? [...mods.values()] : Object.values(mods); let n = 0;
    for (const m of list) { const e = m && m.publicModule && m.publicModule.exports;
      if (e && typeof e.getDocumentAsync === 'function') { e.getDocumentAsync = () => Promise.resolve({ canceled: false, assets: [{ uri: ${JSON.stringify(`file://${PICKED}`)}, name: 'hindi.txt', mimeType: 'text/plain', lastModified: Date.now() }] }); n++; } }
    return n; })()`);
  check('file picker stood in for', patched > 0);
  await press('settings-upload');
  await sleep(1500);
  const msg = await screenText();
  check('upload: 1 pair loaded, the bad line reported by number', msg.includes('Loaded 1 pair') && msg.includes('Line 3'), msg.slice(0, 160));
  check('upload: settings names the list, never its words', (await text('settings-current'))?.includes('hindi') && (await wordHits(['दिल', 'दाल'])).length === 0);
  check('upload: saved', onDisk('wordlist.json')?.pairs?.length === 1);
  shot('07-upload');
  await press('settings-done');
  await press('setup-start');
  const g4 = await dealAll('G4', true);
  const w4 = wordsOf(g4);
  check('G4: the Hindi pair is dealt', w4.slice().sort().join('/') === ['दाल', 'दिल'].sort().join('/'));
  await secretRoundOut('G4 R1', w4, bySeat(g4).find((p) => p.role === 'mrwhite'));
  await press('elimination-continue');
  await type('guess-input', g4.undercoverWord); //  one vowel sign off
  await press('guess-submit');
  check(`G4: guessing ${g4.undercoverWord} for ${g4.civilianWord} is wrong (the vowel sign matters)`, await exists('guess-result-screen'));
  shot('08-hindi-wrong');
  await press('guess-continue');
  check('G4: played to the end', await playToEnd('G4', w4));
  addToBoard(await checkGameOver('G4'));

  await press('gameover-again');
  const g5 = await dealAll('G5', false);
  const mrW5 = bySeat(g5).find((p) => p.role === 'mrwhite');
  await secretRoundOut('G5 R1', wordsOf(g5), mrW5);
  await press('elimination-continue');
  await type('guess-input', `  ${g5.civilianWord}! `);
  await press('guess-submit');
  check('G5: the right Hindi word, typed with spaces and "!", wins for Mr White', (await st())?.winner === 'mrWhiteGuess');
  check('G5: game over shows the guess tidied', (await screenText()).includes(`${mrW5.name} guessed “${g5.civilianWord}”.`));
  addToBoard(await checkGameOver('G5'));
  shot('09-mrwhite-wins');

  // ---------------------------------------------------------------- G6: "Actually, that's right"
  await press('gameover-again');
  const g6 = await dealAll('G6', false);
  const mrW6 = bySeat(g6).find((p) => p.role === 'mrwhite');
  await secretRoundOut('G6 R1', wordsOf(g6), mrW6);
  await press('elimination-continue');
  await type('guess-input', 'dill');
  await press('guess-submit');
  await press('guess-override');
  check('G6: counting a wrong guess asks first', (await exists('guess-result-screen')) && (await screenText()).includes('Tap again: Mr White wins'));
  await press('guess-override');
  check('G6: …and the second tap gives Mr White the win', (await st())?.winner === 'mrWhiteGuess');
  addToBoard(await checkGameOver('G6'));

  // ---------------------------------------------------------------- G7: "no one goes out", then a walkout
  await press('gameover-again');
  const g7 = await dealAll('G7', false);
  const w7 = wordsOf(g7);
  await secretTie('G7 R1', w7, g7);
  await press('tie-none');
  const r2 = await st();
  check('G7: "no one goes out" starts round 2 with everyone in', r2.round === 2 && r2.players.every((p) => p.status === 'alive') && (await exists('starter-screen')));
  for (const p of bySeat(g7).filter((x) => x.role !== 'civilian')) {
    await press('someone-left');
    await sleep(600);
    await press(`leave-${p.id}`);
    await press('leave-confirm');
    await sleep(600);
  }
  check('G7: when the last infiltrator walks out, the game ends with no points and no winner',
    (await exists('gameover-screen')) && (await text('gameover-winner')) === 'No winner' && /Ended when .+ left\. No points this game\./.test(await screenText()));
  shot('10-walkout');
  addToBoard(await checkGameOver('G7'));

  // ---------------------------------------------------------------- leaderboard after 7 games
  await press('gameover-leaderboard');
  await sleep(600);
  const rows = await boardRows();
  check('leaderboard file matches every game played', JSON.stringify(onDisk('leaderboard.json')) === JSON.stringify(expectBoard), JSON.stringify(onDisk('leaderboard.json')));
  check('everyone shows 7 games', rows.length === 5 && rows.every((r) => r.split(' ')[3] === '7'), rows.join(' ; '));
  shot('11-leaderboard');
  await press('leaderboard-reset');
  await press('leaderboard-reset');
  check('reset wipes the saved scores', JSON.stringify(onDisk('leaderboard.json')) === '{}');
  await press('leaderboard-undo');
  check('undo brings every score back', JSON.stringify(onDisk('leaderboard.json')) === JSON.stringify(expectBoard));
  check('…and the same rows show', JSON.stringify(await boardRows()) === JSON.stringify(rows));
  await press('leaderboard-done');
  return rows;
};

const afterRestart = async (rows) => {
  const names = [];
  for (let i = 0; i < 5; i++) names.push((await props(`setup-name-${i}`)).value);
  check('after restart: names kept', names.join() === NAMES.join(), names.join());
  await press('setup-leaderboard');
  await sleep(600);
  check('after restart: leaderboard kept', JSON.stringify(await boardRows()) === JSON.stringify(rows));
  check('after restart: undo is gone (it lasts until the app closes)', !(await exists('leaderboard-undo')));
  await press('leaderboard-done');
  await sleep(600);
  await press('setup-settings');
  check('after restart: secret ballot and skipping kept', (await props('settings-vote-secret')).selected && (await props('settings-abstain')).value === true);
  check('after restart: the Hindi list kept', (await text('settings-current'))?.includes('hindi'));
  shot('12-after-restart');
  await press('settings-builtin');
  check('"use built-in words" drops the uploaded list', onDisk('wordlist.json') === null && (await text('settings-current')) === 'Built-in words');
  await press('settings-done');
};

// ================================================================== runs
const summary = [];
try {
  for (let run = 1; run <= RUNS; run++) {
    runTag = `run${run}`;
    const before = results.length;
    quitApp();
    clearStorage();
    mkdirSync(join(DATA, 'Library/Caches/DocumentPicker'), { recursive: true });
    writeFileSync(PICKED, '# Hindi test list\nदिल / दाल\nbad-line\n');
    try {
      await launch();
      const rows = await play();
      await launch(); //  kill and reopen
      await afterRestart(rows);
    } catch (err) {
      check('run stopped early', false, err.message);
      try { shot('stopped'); } catch { /* no screen */ }
    }
    const mine = results.slice(before);
    const failed = mine.filter((r) => !r.ok).length;
    summary.push(`${runTag}: ${mine.length - failed} passed, ${failed} failed`);
    console.log(summary[summary.length - 1]);
  }
} finally {
  quitApp();
  clearStorage();
  rmSync(PICKED, { force: true });
  if (ws) ws.close();
  if (metro) { try { process.kill(-metro.pid); } catch { /* already gone */ } }
  if (!arg('--keep-open')) { try { sh(`xcrun simctl shutdown ${UDID}`); } catch { /* already off */ } }
  writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 1));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed (${RUNS} run${RUNS > 1 ? 's' : ''})`);
console.log(`Screenshots and results: ${OUT}`);
process.exit(failed.length ? 1 : 0);
