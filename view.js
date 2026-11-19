/* view.js: what the phone's screens show, worked out from what syntratime.js gives back (SyntraTime, the phone page). No browser, no storage, no sum of hours: the sums and the
   rules are syntratime.js's, and this file only puts what it gives back in the order and the words a screen wants (the jobs last used first, the log by day, the clock with
   seconds). It runs on the phone page and in Node, so each of these is tested without a screen (tests/node/timeview.test.js). */
(function (root, make) {
  const V = make(typeof module === 'object' && module.exports ? require('./syntratime.js') : root.ST);
  if (typeof module === 'object' && module.exports) module.exports = V;
  else root.VIEW = V;
})(typeof self !== 'undefined' ? self : this, function (ST) {
'use strict';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* a clock time with seconds, in the shop's clock: "2:14:05 pm" (showClock says "2:14 pm"; the seconds are the same in every zone) */
function clockSeconds(at, zone) {
  const t = typeof at === 'number' ? at : Date.parse(at), s = String(new Date(t).getUTCSeconds()).padStart(2, '0');
  return ST.showClock(t, zone).replace(/^(\d+:\d\d)/, '$1:' + s);
}
/* a shop day as the screen says it: "Wed 18 Nov" */
function dayName(day) {
  const [y, m, d] = day.split('-').map(Number);
  return DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] + ' ' + d + ' ' + MONTHS[m - 1];
}
/* the lines of "What happened", newest first: today's, and the earlier days each under its own day (screen 7) */
function logDays(log, zone, now) {
  const today = ST.localDay(now, zone), byDay = new Map(), out = { today: [], earlier: [] };
  log.forEach((line, i) => {
    const day = ST.localDay(line.at, zone), item = Object.assign({}, line, { index: i, clock: clockSeconds(line.at, zone) });
    if (day === today) out.today.push(item);
    else { if (!byDay.has(day)) byDay.set(day, []); byDay.get(day).push(item); }
  });
  out.today.reverse();
  out.earlier = [...byDay].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, lines]) => ({ day, label: dayName(day), lines: lines.reverse() }));
  return out;
}

/* ---- the home screen, what is timed, and one operation (screens 1, 2 and 3) ---- */
const key = (s) => String(s == null ? '' : s).trim().toLowerCase();
const cmp = (a, b) => String(a).localeCompare(String(b), 'en', { sensitivity: 'base' });
const jobKey = (job) => (job == null ? '\u0000' : key(job));
/* the timers running now, in the order they started (a cancelled timer is never running) */
const runningNow = (timers) => timers.filter((t) => t.running && !t.cancelled);
const jobWords = (job) => (job == null ? ST.SHOP_NO_JOB : job);
/* a running timer's second line on screen 1: the job, who (or "Machine"), and the vehicle on a trip: "Hillcrest kitchen · Sam · Truck" */
const timerLine = (t) => [jobWords(t.job), t.opKind === 'machine' ? 'Machine' : t.person, t.vehicle].filter(Boolean).join(' \u00b7 ');
/* the jobs to pick from, last used first (screen 1): the jobs SyntraQuote sent and every job named on a timer (a typed one too), each with how many of its timers are running;
   a job never used comes after the used ones, A to Z */
function jobChoices(timers, L) {
  const by = new Map(), note = (name) => { const k = key(name); if (!by.has(k)) by.set(k, { job: name, used: null, running: 0 }); return by.get(k); };
  for (const j of L.jobs) note(j);
  for (const t of timers) { if (t.cancelled || t.job == null) continue; const c = note(t.job); if (!c.used || t.start > c.used) c.used = t.start; if (t.running) c.running++; }
  return [...by.values()].sort((a, b) => (a.used && b.used ? (a.used < b.used ? 1 : a.used > b.used ? -1 : cmp(a.job, b.job)) : a.used ? -1 : b.used ? 1 : cmp(a.job, b.job)));
}
const filterJobs = (choices, q) => (key(q) ? choices.filter((c) => key(c.job).includes(key(q))) : choices);
/* what he typed, when it is a job not yet known: offered as a new job (screen 1) */
const newJob = (choices, q) => { const t = String(q == null ? '' : q).trim(); return t && !choices.some((c) => key(c.job) === key(t)) ? t : null; };
/* the operations in three groups, each in the order of the list (so each keeps its place on screen 2): people in the shop, machines in the shop, out of the shop */
const operationGroups = (L) => ({ people: L.operations.filter((o) => o.kind === 'person' && !o.out), machines: L.operations.filter((o) => o.kind === 'machine'), out: L.operations.filter((o) => o.out) });
/* the running timers of one job and one operation: their count and who (screen 2's green edge) */
function opStatus(timers, job, op) {
  const here = runningNow(timers).filter((t) => jobKey(t.job) === jobKey(job) && key(t.op) === key(op));
  return { running: here.length, names: here.map((t) => t.person).filter(Boolean), timers: here };
}
/* the names to pick from on screen 3, each free, here (already on a timer of this job and operation: dimmed) or busy (on another timer: it says where, and picking it asks first) */
function nameStates(names, timers, job, op) {
  const live = runningNow(timers);
  return names.map((name) => {
    const t = live.find((x) => x.person && key(x.person) === key(name));
    if (!t) return { name, state: 'free', where: '' };
    if (jobKey(t.job) === jobKey(job) && key(t.op) === key(op)) return { name, state: 'here', where: 'on a timer here' };
    return { name, state: 'busy', where: t.out ? 'out on ' + t.op : 'on ' + t.op };
  });
}
/* a length of time as typed: "2 h 30", "2h30min", "2:30", "90 min", "1.5 h", "150" (minutes). Gives minutes, or null when it cannot be read. Reading what was typed is all it does: the stop is worked out by syntratime.js. */
function parseLength(text) {
  const t = String(text == null ? '' : text).trim().toLowerCase().replace(/,/g, '.');
  let m;
  if ((m = /^(\d+):(\d{1,2})$/.exec(t))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = /^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\s*(?:(\d+)\s*(?:m|min|mins|minute|minutes)?)?$/.exec(t))) return Math.round(Number(m[1]) * 60 + Number(m[2] || 0));
  if ((m = /^(\d+)\s*(?:m|min|mins|minute|minutes)?$/.exec(t))) return Number(m[1]);
  return null;
}
/* a number of kilometres as the screens say it: 184 326 (the space between the thousands does not break the line) */
const showKm = (n) => String(Math.round(n * 10) / 10).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
/* the end-of-day box (screen 4): the timers in the shop that the check stopped because nobody answered "still going?", and that he has not yet answered or confirmed.
   The engine has already stopped them at the check's time; the box asks him to let each run on (still going) or to keep the stop (stop at that time). */
function waiting(timers, zone, today) {
  const rows = timers.filter((t) => !t.cancelled && !t.out && t.stopHow === 'check' && t.toCheck && t.why.some((w) => w.why === 'check')).map((t) => {
    const midnight = ST.localClock(t.stop, zone) === '00:00', day = ST.localDay(t.stop, zone), clock = midnight ? 'midnight' : ST.showClock(t.stop, zone);
    return { id: t.id, op: t.op, person: t.person, job: t.job, minutes: t.minutes, stop: t.stop, clock, day, late: day !== today, midnight };
  });
  const kinds = [...new Set(rows.map((r) => r.stop))];
  const heading = !rows.length ? '' : kinds.length === 1 ? (rows[0].midnight ? 'Midnight' : rows[0].clock) + ': still going?' : 'Still going?';
  return { rows, heading };
}
/* the end-of-day check line under the running timers (screen 1): on (with the time and the button), off for today only, or switched off */
function endOfDay(events, L, now) {
  const zone = L.settings.zone, day = ST.localDay(now, zone), c = ST.checksOn(L, day).shop;
  if (!c.on || !c.at) return { state: 'off', text: 'The end-of-day check is switched off.' };
  if (events.some((e) => e.type === 'checkOff' && e.side === 'shop' && e.day === day)) return { state: 'today', text: 'The end-of-day check is off for today. It is back on tomorrow.' };
  return { state: 'on', text: 'End-of-day check at ' + ST.showClock(ST.atLocal(day, c.at, zone), zone) };
}

return { clockSeconds, dayName, logDays, runningNow, jobWords, timerLine, jobChoices, filterJobs, newJob, operationGroups, opStatus, nameStates, endOfDay, waiting, showKm, parseLength };
});
