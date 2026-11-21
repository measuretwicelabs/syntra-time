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
/* a running timer's second line on screen 1: the job, who is working, and the vehicle on a trip: "Lubicon Lake Band · Pat, Sam", "Hillcrest kitchen · Sam · Truck" */
const timerLine = (t) => [jobWords(t.job), ST.whoOf(t), t.vehicle].filter(Boolean).join(' \u00b7 ');
/* names as a sentence says them: "Pat", "Pat and Sam", "Dave, Pat and Sam" (the Start button: "Start: Pat and Sam") */
const namesWords = (list) => (list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1] : list[0] || '');
/* the jobs to pick from, last used first (screen 1): the jobs SyntraQuote sent and every job named on a timer (a typed one too), each with how many of its timers are running;
   a job never used comes after the used ones, A to Z */
function jobChoices(timers, L) {
  const by = new Map(), note = (name) => { const k = key(name); if (!by.has(k)) by.set(k, { job: name, used: null, running: 0, listed: false }); return by.get(k); };
  for (const j of L.jobs) note(j).listed = true;      /* listed: it is one of the job folders SyntraQuote read; a name only typed before is not, and is used as a typed name again */
  for (const t of timers) { if (t.cancelled || t.job == null) continue; const c = note(t.job); if (!c.used || t.start > c.used) c.used = t.start; if (t.running) c.running++; }
  return [...by.values()].sort((a, b) => (a.used && b.used ? (a.used < b.used ? 1 : a.used > b.used ? -1 : cmp(a.job, b.job)) : a.used ? -1 : b.used ? 1 : cmp(a.job, b.job)));
}
const filterJobs = (choices, q) => (key(q) ? choices.filter((c) => key(c.job).includes(key(q))) : choices);
/* what he typed, when it is a job not yet known: offered as a new job (screen 1) */
const newJob = (choices, q) => { const t = String(q == null ? '' : q).trim(); return t && !choices.some((c) => key(c.job) === key(t)) ? t : null; };
/* the operations in three groups, each in the order of the list (so each keeps its place on screen 2): people in the shop, machines in the shop, out of the shop */
const operationGroups = (L) => ({ people: L.operations.filter((o) => o.kind === 'person' && !o.out), machines: L.operations.filter((o) => o.kind === 'machine'), out: L.operations.filter((o) => o.out) });
/* the open timers of one job and one operation: their count and who is on them (screen 2's green edge, and the cards on screen 3). A paused timer is still open. */
function opStatus(timers, job, op) {
  const here = runningNow(timers).filter((t) => jobKey(t.job) === jobKey(job) && key(t.op) === key(op));
  return { running: here.length, names: [...new Set(here.flatMap((t) => t.workers.map((w) => w.name)))], timers: here };
}
/* the names to pick from when a trip leaves (screen 5): free, or busy (on an open timer, and not paused on it: it says where, and picking the name asks first). In the shop
   nothing is asked: timers ignore each other (owner, 20 Nov 2026). */
function nameStates(names, timers) {
  const live = runningNow(timers);
  return names.map((name) => {
    const t = live.find((x) => x.workers.some((w) => key(w.name) === key(name) && !w.paused));
    return t ? { name, state: 'busy', where: t.out ? 'out on ' + t.op : 'on ' + t.op } : { name, state: 'free', where: '' };
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
/* the end-of-day box (screen 4): the timers in the shop that a check stopped because nobody answered "still going?", and that he has not yet answered or confirmed.
   The engine has already stopped them, at the check's time or at the moment they were paused; the box asks him to let each run on (still going) or to keep the stop. */
function waiting(timers, zone, today) {
  const rows = timers.filter((t) => !t.cancelled && !t.out && t.stopHow === 'check' && t.toCheck && t.why.some((w) => w.why === 'check')).map((t) => {
    const midnight = ST.localClock(t.checkAt, zone) === '00:00', day = ST.localDay(t.stop, zone), clock = midnight ? 'midnight' : ST.showClock(t.checkAt, zone), paused = t.stop !== t.checkAt;
    return { id: t.id, op: t.op, who: ST.whoOf(t), job: t.job, minutes: t.minutes, stop: t.stop, check: t.checkAt, clock, stopClock: paused ? ST.showClock(t.stop, zone) : clock, paused, day, late: day !== today, midnight };
  });
  const kinds = [...new Set(rows.map((r) => r.check))];
  const heading = !rows.length ? '' : kinds.length === 1 ? (rows[0].midnight ? 'Midnight' : rows[0].clock) + ': still going?' : 'Still going?';
  return { rows, heading };
}
/* the end-of-day check of this phone, for the line under the running timers (owner, 21 Nov 2026: its switch and its time belong to the phone) */
function endOfDay(events, device, now, zone) {
  const s = ST.endOfDayOf(events, device, now), clock = ST.showClock(ST.atLocal(ST.localDay(now, zone), s.at, zone), zone);
  return { on: s.on, at: s.at, clock, text: s.on ? 'asks at ' + clock : 'off: nothing asks until midnight' };
}
/* one notification for each open timer (owner, 21 Nov 2026; mockup 8): a shop task, or a trip (its people together). What each says is worked out here, so it is the same
   on the page and in the test: the operation and the job; "Running 1 h 02 min", who, and the last check-in; or, paused, since when (and no Check in button). */
function notices(timers, zone) {
  const out = [], trips = new Set(), two = (n) => (n < 10 ? '0' : '') + n;
  const ran = (min) => { const all = Math.max(0, Math.floor(min)), h = Math.floor(all / 60), m = all % 60; return h ? h + ' h ' + two(m) + ' min' : m + ' min'; };
  for (const t of runningNow(timers)) {
    if (t.trip) { if (trips.has(t.trip)) continue; trips.add(t.trip); }
    const group = t.trip ? runningNow(timers).filter((x) => x.trip === t.trip) : [t], who = group.map((x) => ST.whoOf(x)).join(', ');
    const last = group.map((x) => x.checkin).filter(Boolean).sort().pop() || null;
    const title = t.op + ' \u00b7 ' + jobWords(t.job), quietFrom = last || group.map((x) => x.start).sort()[0];       /* the hour to the next ring counts from the last check-in, or the start */
    if (t.paused && !t.trip) out.push({ tag: 'timer-' + t.id, timers: group.map((x) => x.id), title, who, quietFrom, paused: true, body: 'Paused since ' + ST.showClock(t.pausedAt, zone) + ' \u00b7 ' + who + '\nTap to open SyntraTime' });
    else out.push({ tag: 'timer-' + t.id, timers: group.map((x) => x.id), title, who, quietFrom, paused: false,
      body: 'Running ' + ran(Math.max(...group.map((x) => x.minutes))) + ' \u00b7 ' + who + '\nStill working on it?' + (last ? ' Last check-in ' + ST.showClock(last, zone) : '') });
  }
  return out;
}

return { clockSeconds, dayName, logDays, runningNow, jobWords, timerLine, namesWords, jobChoices, filterJobs, newJob, operationGroups, opStatus, nameStates, endOfDay, waiting, notices, showKm, parseLength };
});
