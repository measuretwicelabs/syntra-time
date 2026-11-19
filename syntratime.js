/* syntratime.js: the shape of everything SyntraTime keeps, and the rules that turn it into timers and hours. Read syntraquote docs/DATA.md, "SyntraTime", first:
   it has the same shapes with a picture and the reasons. The plan is Linework docs/QUOTES_PLAN.md, section 6b.

   One file, run in three places: the phone page (time/index.html), SyntraQuote on the computer (which writes the lists and reads the records), and Node for the tests
   (tests/node/time.test.js). It knows nothing about screens, Microsoft or folders: it is given words and numbers, and gives back words and numbers.

   The idea in one line: every phone or tablet keeps a diary of what was tapped (an "event": a start, a stop, a correction), one diary file per device per day, and
   nothing in a diary is ever rubbed out. The timers, the hours and the kilometres are worked out from all the diaries together, the same way everywhere.
   Why a diary and not a file per timer: two devices never write the same file, so OneDrive never makes a "conflicted copy"; a phone can stop a timer the shop tablet
   started; and a record cannot be lost by being written over.

   Every instant is kept in world time (UTC, written 2026-11-19T23:00:00.000Z). Shop days and clock times are worked out in the shop's own zone (America/Edmonton,
   a setting), never the phone's: a phone that kept the wrong zone (18 Nov 2026) cannot spoil the labour records. The zone is named, not a fixed number of hours,
   so the rules of each date come with it (Alberta stopped changing its clocks on 1 Nov 2026: 6 hours behind world time all year; 7 in the winters before).
   Test data only (owner's test-data rule, 15 Nov 2026): until he says real work has started, a change of shape needs no reading of old files. */
(function (root, make) {
  const ST = make();
  if (typeof module === 'object' && module.exports) module.exports = ST;
  else root.ST = ST;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const FORMAT = { day: 'syntratime.day', lists: 'syntratime.lists' };
const VERSION = { day: 1, lists: 1 };
const ZONE = 'America/Edmonton';

/* where things are, inside the Time folder. SyntraTime reads and writes only the Time folder (owner, 19 Nov 2026, 00:27), so that moving to the shop account later
   is a change of sign-in: the same names inside whichever Time folder it is signed in to. */
const PLACES = {
  time: 'Time',                               /* inside the Syntra folder, today: SYNTRA/Time in his OneDrive */
  lists: 'syntratime.lists.json',             /* inside Time: written by SyntraQuote only */
  records: 'Records',                         /* inside Time: Records/<YYYY-MM>/<YYYY-MM-DD>.<device>.json, each written by its own device only */
  copy: 'SyntraQuote/Time'                    /* inside the Syntra folder: SyntraQuote's own copy of every diary it has read, never trimmed */
};

/* the kinds of event a diary holds */
const EVENT_TYPES = ['start', 'stop', 'edit', 'going', 'checkOff', 'names', 'vehicles'];
/* how a start or stop came to be: tapped at the moment, typed in afterwards, or (stops only) the end-of-day check with no answer */
const HOW = { start: ['tap', 'typed'], stop: ['tap', 'typed'] };
const OP_KINDS = ['person', 'machine'];       /* person time and machine time are kept apart (owner, 17 and 19 Nov 2026) */
const CHECK_SIDES = ['shop', 'out'];          /* the end-of-day check has one time for timers in the shop and one for timers out of the shop */
const EDITABLE = ['job', 'jobTyped', 'op', 'person', 'vehicle', 'odoOut', 'odoBack', 'note', 'remake', 'start', 'stop', 'checked', 'cancelled'];
/* device ids: four letters and figures, with none that are easily mistaken for another (no I, O, 0 or 1) */
const ID_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SHOP_NO_JOB = 'Shop, no job';           /* how a timer with no job (job: null) is written on screen: cleaning, maintenance, the overhead the price needs */
/* a worker's own car (owner, 19 Nov 2026, the trip screens): always offered on a trip, never on the list of company vehicles; its kilometres are kept apart for
   each person (the driver), and its odometer may be left empty without the trip being marked to check */
const OWN_VEHICLE = 'Own vehicle';
/* time typed in more than this many days after its start is shown among the timers to check (owner, 19 Nov 2026: "more than a week"; counted as 7 x 24 hours) */
const LATE_DAYS = 7;
/* on a trip these belong to the whole trip: a correction of any one of them on one person's timer is made on every timer of the trip */
const TRIP_WIDE = ['job', 'jobTyped', 'op', 'opKind', 'out', 'note'];

/* the starting list of operations (offered 18 Nov 2026, "good" late that night; still open for his own list). Each is person or machine time, and in the shop or out.
   The kinds of trip out (delivery, pickup, install, site visit) are the operations marked out: one list, kept once (Claude, 19 Nov 2026, for the owner to confirm). */
const STARTER_OPERATIONS = [
  ['Site visit', 'person', true], ['Shop drawings', 'person', false], ['Loading and unloading the CNC', 'person', false],
  ['CNC cutting', 'machine', false], ['Beam saw cutting', 'machine', false], ['Edgebanding', 'machine', false], ['Dowel insertion', 'machine', false],
  ['Laminating', 'person', false], ['Solid surface', 'person', false], ['Assembly', 'person', false], ['Finishing', 'person', false],
  ['Doors and hardware', 'person', false], ['Delivery', 'person', true], ['Pickup', 'person', true], ['Installation', 'person', true],
  ['Cleaning and maintenance', 'person', false]
].map(([name, kind, out]) => ({ name, kind, out }));

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && isFinite(v);
const isText = (v) => typeof v === 'string' && v.trim() !== '';
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isClock = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const isInstant = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && isFinite(Date.parse(v));
const iso = (ms) => new Date(ms).toISOString();
const ms = (v) => Date.parse(v);
const clone = (v) => JSON.parse(JSON.stringify(v));
const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const nowMs = (now) => (now == null ? Date.now() : typeof now === 'number' ? now : ms(now));
function refuse(words) { throw new Error(words); }

/* ---- the shop's clock ------------------------------------------------------------------------------------------------------
   The shop's day and clock time of an instant, and the instant of a clock time on a shop day, in the shop's zone (summer and winter time included). */
const FORMATTERS = {};
function partsAt(t, zone) {
  const f = FORMATTERS[zone] || (FORMATTERS[zone] = new Intl.DateTimeFormat('en-CA', { timeZone: zone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  const o = {};
  for (const p of f.formatToParts(new Date(t))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  if (o.hour === 24) o.hour = 0;
  return o;
}
/* how far the shop's clock is from world time at that instant, in ms (Edmonton: -6 h all year since Alberta stopped changing its clocks on 1 Nov 2026; -7 h in winters before) */
function offsetAt(t, zone) {
  const whole = t - (((t % 1000) + 1000) % 1000), p = partsAt(whole, zone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - whole;
}
const pad = (n) => String(n).padStart(2, '0');
function localDay(at, zone) { const p = partsAt(nowMs(at), zone || ZONE); return p.year + '-' + pad(p.month) + '-' + pad(p.day); }
function localClock(at, zone) { const p = partsAt(nowMs(at), zone || ZONE); return pad(p.hour) + ':' + pad(p.minute); }
/* the instant (ms) of a clock time on a shop day, for example 16:00 on 2026-11-19 in Edmonton is 23:00 world time */
function atLocal(day, clock, zone) {
  const [y, m, d] = day.split('-').map(Number), [h, mi] = clock.split(':').map(Number);
  const asIfWorld = Date.UTC(y, m - 1, d, h, mi);
  const first = asIfWorld - offsetAt(asIfWorld, zone || ZONE);
  return asIfWorld - offsetAt(first, zone || ZONE);
}
function nextDay(day) { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10); }
/* minutes as the screen says them: 135 is "2 h 15 min" */
function showMinutes(min) {
  if (!isNum(min)) return '';
  const all = Math.round(min), h = Math.floor(all / 60), m = all % 60;
  return h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min';
}

/* a timer that is running, as the screen says it, with seconds so the owner can see it is going (19 Nov 2026, hand test 2): 727 s is "12 min 07 s", 8103 s is "2 h 15 min 03 s".
   Only for what is on show; every sum stays in minutes. Whole seconds are cut off, never rounded up, so the figure never runs ahead of the clock; below nothing it is 0 s. */
function showElapsed(min) {
  if (!isNum(min)) return '';
  const all = Math.max(0, Math.floor(min * 60 + 1e-6)), h = Math.floor(all / 3600), m = Math.floor((all % 3600) / 60), s = all % 60, two = (n) => (n < 10 ? '0' : '') + n;
  return h ? h + ' h ' + two(m) + ' min ' + two(s) + ' s' : m ? m + ' min ' + two(s) + ' s' : s + ' s';
}

/* ---- the lists: written by SyntraQuote into the Time folder, read by SyntraTime ---------------------------------------------
   jobs        the names of the folders in SYNTRA/Jobs, as SyntraQuote read them (SyntraTime never reads Jobs itself)
   operations  [ { name, kind: person | machine, out: true when it is done out of the shop } ]
   names       the people who may be picked on a timer (names, not logins: owner, 19 Nov 2026)
   vehicles    the vehicles a trip out may be in, so each one's kilometres stay apart
   settings    zone; checks: the end-of-day check, each setting from the day it was set: [ { from, shop: { on, at: "16:00" }, out: { on, at: "HH:MM" or null } } ]
               on/off is the owner's switch to use the check or not (19 Nov 2026); the time is kept while it is off, so on again brings it back.
               A change counts from the day it is made, so past days keep the setting they had and a record never changes because a setting did.
   The names may also be added or removed on a phone or tablet, as it starts a timer (owner, 19 Nov 2026): that is a "names" event in its diary, laid over the
   list SyntraQuote wrote (namesNow), so the lists file still has one writer. */
function starterLists(today) {
  return { format: FORMAT.lists, version: VERSION.lists, written: null,
    jobs: [], operations: clone(STARTER_OPERATIONS), names: [], vehicles: [],
    settings: { zone: ZONE, checks: [{ from: today || '2026-01-01', shop: { on: true, at: '16:00' }, out: { on: false, at: null } }] } };
}
function checkLists(L) {
  const p = [];
  if (!isObj(L)) return ['The lists are not readable.'];
  if (L.format !== FORMAT.lists) p.push('This is not the lists file of SyntraTime.');
  for (const k of ['jobs', 'operations', 'names', 'vehicles']) if (!Array.isArray(L[k])) p.push('The lists have no ' + k + '.');
  const twice = (arr, what) => { const seen = new Set(); for (const n of arr) { const k = String(n).trim().toLowerCase(); if (seen.has(k)) p.push(what + ' "' + n + '" is on the list twice.'); seen.add(k); } };
  if (Array.isArray(L.jobs)) { L.jobs.forEach((j) => { if (!isText(j)) p.push('A job on the list has no name.'); }); twice(L.jobs, 'The job'); }
  if (Array.isArray(L.names)) { L.names.forEach((j) => { if (!isText(j)) p.push('A name on the list is empty.'); }); twice(L.names, 'The name'); }
  if (Array.isArray(L.vehicles)) {
    L.vehicles.forEach((j) => { if (!isText(j)) p.push('A vehicle on the list has no name.'); else if (same(j, OWN_VEHICLE)) p.push('"' + OWN_VEHICLE + '" is always offered: it is not a company vehicle.'); });
    twice(L.vehicles, 'The vehicle');
  }
  if (Array.isArray(L.operations)) {
    L.operations.forEach((o) => {
      if (!isObj(o) || !isText(o.name)) { p.push('An operation on the list has no name.'); return; }
      if (!OP_KINDS.includes(o.kind)) p.push('The operation "' + o.name + '" is neither person time nor machine time.');
      if (typeof o.out !== 'boolean') p.push('The operation "' + o.name + '" does not say whether it is in the shop or out.');
      if (o.kind === 'machine' && o.out) p.push('The operation "' + o.name + '" is machine time out of the shop.');
    });
    twice(L.operations.filter(isObj).map((o) => o.name), 'The operation');
  }
  const s = L.settings;
  if (!isObj(s) || !isText(s.zone)) p.push('The lists do not say the shop\'s time zone.');
  else {
    try { new Intl.DateTimeFormat('en', { timeZone: s.zone }); } catch (e) { p.push('The time zone "' + s.zone + '" is not known.'); }
    if (!Array.isArray(s.checks) || !s.checks.length) p.push('The lists have no end-of-day check times.');
    else s.checks.forEach((c, i) => {
      if (!isObj(c) || !isDay(c.from)) { p.push('An end-of-day check time has no day it starts from.'); return; }
      if (i && !(c.from > s.checks[i - 1].from)) p.push('The end-of-day check times are not in order of their days.');
      for (const side of CHECK_SIDES) {
        const x = c[side];
        if (!isObj(x) || typeof x.on !== 'boolean') p.push('The end-of-day check from ' + c.from + ' does not say whether it is on.');
        else if (x.at !== null && !isClock(x.at)) p.push('The end-of-day check from ' + c.from + ' has a time that is not HH:MM.');
        else if (x.on && x.at === null) p.push('The end-of-day check from ' + c.from + ' is on with no time.');
      }
    });
  }
  return p;
}
const findOp = (L, name) => (L.operations || []).find((o) => same(o.name, name));
/* editing the lists (SyntraQuote's Settings): each gives back new lists and refuses in plain words, changing nothing */
function addToList(L, key, name, what) {
  if (!isText(name)) refuse('Type the ' + what + '\'s name.');
  if (key === 'vehicles' && same(name, OWN_VEHICLE)) refuse('"' + OWN_VEHICLE + '" is always offered on a trip: it is not added to the company vehicles.');
  if (L[key].some((n) => same(n, name))) refuse('"' + name.trim() + '" is already on the list.');
  const out = clone(L); out[key].push(name.trim()); return out;
}
function removeFromList(L, key, name) {
  if (!L[key].some((n) => same(n, name))) refuse('"' + name + '" is not on the list.');
  const out = clone(L); out[key] = out[key].filter((n) => !same(n, name)); return out;
}
const addName = (L, n) => addToList(L, 'names', n, 'person');
const removeName = (L, n) => removeFromList(L, 'names', n);
const addVehicle = (L, n) => addToList(L, 'vehicles', n, 'vehicle');
const removeVehicle = (L, n) => removeFromList(L, 'vehicles', n);
function addOperation(L, op) {
  if (!isObj(op) || !isText(op.name)) refuse('Type the operation\'s name.');
  if (findOp(L, op.name)) refuse('"' + op.name.trim() + '" is already on the list.');
  if (!OP_KINDS.includes(op.kind)) refuse('Say whether "' + op.name.trim() + '" is person time or machine time.');
  if (op.kind === 'machine' && op.out) refuse('A machine is timed in the shop only.');
  const out = clone(L); out.operations.push({ name: op.name.trim(), kind: op.kind, out: !!op.out }); return out;
}
/* an operation's kind (person or machine time) or side (in the shop or out) changed where it stands in the list, so its place on the phone's screen is kept (SyntraQuote's Settings,
   Operations tab: the Person / Machine and Shop / Out buttons on its row). Records already made keep their own copy, so past hours never change with it. */
function setOperation(L, name, change) {
  const op = findOp(L, name);
  if (!op) refuse('"' + name + '" is not on the list.');
  if (!isObj(change) || !('kind' in change || 'out' in change)) refuse('Nothing to change.');
  if ('kind' in change && !OP_KINDS.includes(change.kind)) refuse('Say whether "' + op.name + '" is person time or machine time.');
  const next = { name: op.name, kind: 'kind' in change ? change.kind : op.kind, out: 'out' in change ? !!change.out : op.out };
  if (next.kind === 'machine' && next.out) refuse('A machine is timed in the shop only.');
  const out = clone(L); out.operations = out.operations.map((o) => (same(o.name, name) ? next : o)); return out;
}
/* deleting an operation takes it off the list to pick from; records already made with it keep it (owner, 18 Nov 2026), because each record holds its own copy */
function removeOperation(L, name) {
  if (!findOp(L, name)) refuse('"' + name + '" is not on the list.');
  const out = clone(L); out.operations = out.operations.filter((o) => !same(o.name, name)); return out;
}
/* the job names, from the folders SyntraQuote found in SYNTRA/Jobs, in A to Z order */
function setJobs(L, folderNames) {
  const out = clone(L), seen = new Set(); out.jobs = [];
  for (const n of folderNames || []) { const k = String(n).trim(); if (k && !seen.has(k.toLowerCase())) { seen.add(k.toLowerCase()); out.jobs.push(k); } }
  out.jobs.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  return out;
}
/* the end-of-day check changed, counted from today: change is { on } (the switch) and/or { at: "HH:MM" } (the time, kept while the switch is off) */
function setCheck(L, side, change, today) {
  if (!CHECK_SIDES.includes(side)) refuse('The end-of-day check is for timers in the shop or out of the shop.');
  if (!isObj(change) || !('on' in change || 'at' in change)) refuse('Nothing to change.');
  if ('at' in change && !isClock(change.at)) refuse('Write the time as HH:MM, for example 16:00.');
  if (!isDay(today)) refuse('The day is not written YYYY-MM-DD.');
  const out = clone(L), list = out.settings.checks, last = list[list.length - 1];
  if (today < last.from) refuse('The check cannot be changed for a day before ' + last.from + '.');
  const now = Object.assign({}, last[side], 'at' in change ? { at: change.at } : {}, 'on' in change ? { on: !!change.on } : {});
  if (now.on && !now.at) refuse('Give the time of the check before turning it on.');
  const next = Object.assign(clone(last), { from: today, [side]: now });
  if (last.from === today) list[list.length - 1] = next; else list.push(next);
  return out;
}
/* the end-of-day check times in force on a shop day */
function checksOn(L, day) {
  const list = L.settings.checks; let c = list[0];
  for (const x of list) if (x.from <= day) c = x;
  return c;
}

/* ---- the diary: events --------------------------------------------------------------------------------------------------------
   Every event:  id (the device and its own count: K7Q2-12), type, made (the instant it was written), by (who was signed in: his name, read from his Microsoft sign-in)
   start     at, how (tap | typed), job (a name, or null for "Shop, no job"), jobTyped, op, opKind, out, person (null on machine time), vehicle, odoOut, note, remake,
             and on a trip out: trip (the trip's mark: the id of the driver's start), driver (true on the driver's start only)
             The timer's id is its start's id. The operation's name, kind and side are copied in, so the record stands on its own when the list changes.
   stop      timer, at, how (tap | typed), odoBack
   edit      timer, set { any of: job, jobTyped, op (with opKind and out), person, vehicle, odoOut, odoBack, note, remake, start, stop, checked, cancelled }
   going     timer, check (the instant of the end-of-day check that was answered "still going")
   checkOff  side (shop | out), day: the end-of-day check is off for that one shop day ("off for today" turns itself back on the next day)
   names     action (add | remove), name: a person added or removed on the device, as a timer is started for someone not on the list
   vehicles  action (add | remove), name: a company vehicle added or removed on the device, as a trip is started (owner, 19 Nov 2026, the trip screens)

   A trip out (owner, 19 Nov 2026): several people go in one vehicle and are started and stopped together. Each person keeps a timer of their own, so the hours stay
   per person (three people out for an hour are three hours on the job); the timers are tied by the trip's mark. The vehicle and both readings are on the driver's
   timer only, so the kilometres are counted once. One or more may be stopped while the rest run on. An operation out of the shop is always started as a trip
   (one person alone is a trip of one), and there is no Remake on a trip. */
function newDeviceId(random, taken) {
  const rnd = random || Math.random, used = new Set(taken || []);
  for (let tries = 0; tries < 1000; tries++) {
    let id = ''; for (let i = 0; i < 4; i++) id += ID_LETTERS[Math.floor(rnd() * ID_LETTERS.length) % ID_LETTERS.length];
    if (!used.has(id)) return id;
  }
  refuse('No new device id could be found.');
}
const isDeviceId = (v) => typeof v === 'string' && new RegExp('^[' + ID_LETTERS + ']{4}$').test(v);
const deviceOf = (id) => String(id).split('-')[0];
const countOf = (id) => Number(String(id).split('-')[1]) || 0;
function nextEventId(events, device) {
  let n = 0; for (const e of events) if (deviceOf(e.id) === device) n = Math.max(n, countOf(e.id));
  return device + '-' + (n + 1);
}
/* the order every reader puts events in: when they were written, then the device, then the device's own count. The same everywhere, so every reader agrees. */
function inOrder(events) {
  return events.slice().sort((a, b) => (a.made < b.made ? -1 : a.made > b.made ? 1 : deviceOf(a.id) < deviceOf(b.id) ? -1 : deviceOf(a.id) > deviceOf(b.id) ? 1 : countOf(a.id) - countOf(b.id)));
}
/* what is wrong with one event, in plain words (an empty list when nothing is) */
function eventProblems(e) {
  const p = [], who = 'Event ' + (e && e.id || '?') + ': ';
  if (!isObj(e)) return ['An event is not readable.'];
  if (!/^[A-Z2-9]{4}-[1-9]\d*$/.test(String(e.id))) p.push(who + 'its id is not a device and a number.');
  if (!EVENT_TYPES.includes(e.type)) p.push(who + 'it is not a start, stop, correction, answer or check turned off.');
  if (!isInstant(e.made)) p.push(who + 'the time it was written is not in world time.');
  if (!isText(e.by)) p.push(who + 'it does not name who made it.');
  if (e.type !== 'start' && e.type !== 'checkOff' && e.type !== 'names' && e.type !== 'vehicles' && !isText(e.timer)) p.push(who + 'it does not say which timer.');
  if (e.type === 'start') {
    if (!isInstant(e.at)) p.push(who + 'the start is not in world time.');
    if (!HOW.start.includes(e.how)) p.push(who + 'the start is neither tapped nor typed.');
    if (e.job !== null && !isText(e.job)) p.push(who + 'the job has no name.');
    if (!isText(e.op)) p.push(who + 'it has no operation.');
    if (!OP_KINDS.includes(e.opKind)) p.push(who + 'the operation is neither person time nor machine time.');
    if (typeof e.out !== 'boolean') p.push(who + 'it does not say whether it is in the shop or out.');
    if (e.trip != null && (!isText(e.trip) || typeof e.driver !== 'boolean')) p.push(who + 'its trip is not readable.');
    if (e.trip != null && !e.driver && e.vehicle) p.push(who + 'the vehicle is on a timer that is not the driver\'s.');
  }
  if (e.type === 'stop') {
    if (!isInstant(e.at)) p.push(who + 'the stop is not in world time.');
    if (!HOW.stop.includes(e.how)) p.push(who + 'the stop is neither tapped nor typed.');
  }
  if (e.type === 'edit') {
    if (!isObj(e.set) || !Object.keys(e.set).length) p.push(who + 'the correction changes nothing.');
    else for (const k of Object.keys(e.set)) if (!EDITABLE.includes(k) && k !== 'opKind' && k !== 'out') p.push(who + '"' + k + '" cannot be corrected.');
    if (isObj(e.set)) for (const k of ['start', 'stop']) if (k in e.set && !isInstant(e.set[k])) p.push(who + 'the corrected ' + k + ' is not in world time.');
  }
  if (e.type === 'going' && !isInstant(e.check)) p.push(who + 'the check it answers is not in world time.');
  if (e.type === 'checkOff' && (!CHECK_SIDES.includes(e.side) || !isDay(e.day))) p.push(who + 'it does not say which check, or which day.');
  if (e.type === 'names' && (!['add', 'remove'].includes(e.action) || !isText(e.name))) p.push(who + 'it does not say which name to add or remove.');
  if (e.type === 'vehicles' && (!['add', 'remove'].includes(e.action) || !isText(e.name))) p.push(who + 'it does not say which vehicle to add or remove.');
  return p;
}

/* ---- the fold: from all the diaries to timers ---------------------------------------------------------------------------------
   timersFrom(events, lists, now) gives { timers, problems }. A timer:
     id, device, by, job, jobTyped, op, opKind, out, person, vehicle, odoOut, odoBack, note, remake, trip (the trip's mark, or null), driver,
     start, startHow, stop (null while running), stopHow (tap | typed | check), minutes, running, toCheck, why, cancelled
   why is the list of reasons it is to check, each { why: check | reading | late, text } in plain words: stopped by an end-of-day check with no answer; a trip in a
   company vehicle, finished, with a reading missing (on the driver's timer; Own vehicle's readings may be left empty); time typed in more than 7 days after its
   start. toCheck is true while there is a reason and he has not said the timer is right (checked). A cancelled timer has none.
   The rules, the same in every reader:
   - the first stop written counts; a later one changes nothing (two devices may both stop it);
   - corrections are applied in the order they were written, the later winning for each thing it changes; a corrected start or stop is marked typed;
   - the end-of-day check: a running timer is asked "still going?" at the day's check time for its side (unless that check is off for that day) and at every
     midnight (always: so a late timer cannot run all night). The first check with no "still going" answer stops it, at that check's time, and marks it to check.
     It stays marked until he confirms it (checked) or corrects the stop. The check is worked out, not written, so every reader comes to the same stop. */
function checkInstants(T, L, offs, upTo) {
  const zone = L.settings.zone, side = T.out ? 'out' : 'shop', start = ms(T.start), out = [];
  for (let day = localDay(start, zone); atLocal(day, '00:00', zone) <= upTo; day = nextDay(day)) {
    const set = checksOn(L, day)[side], c = set && set.on ? set.at : null;
    if (c && !offs.has(side + '|' + day)) { const t = atLocal(day, c, zone); if (t > start && t <= upTo) out.push(t); }
    const midnight = atLocal(nextDay(day), '00:00', zone);
    if (midnight > start && midnight <= upTo) out.push(midnight);
    if (out.length > 400) break;
  }
  return out.sort((a, b) => a - b);
}
/* a clock time as the screen says it: "4:00 pm" */
function showClock(t, zone) {
  const [h, m] = localClock(t, zone).split(':').map(Number);
  return (h % 12 || 12) + ':' + pad(m) + (h < 12 ? ' am' : ' pm');
}
/* which vehicle a timer's kilometres belong to: a company vehicle by its name; Own vehicle apart for each person (the driver) */
const vehicleKey = (t) => (!t.vehicle ? null : same(t.vehicle, OWN_VEHICLE) ? 'own|' + String(t.person || '').toLowerCase() : t.vehicle.toLowerCase());
const isOwn = (t) => !!t.vehicle && same(t.vehicle, OWN_VEHICLE);
function timersFrom(events, L, now) {
  const at = nowMs(now), zone = L.settings.zone, problems = [], starts = new Map(), rest = new Map(), offs = new Set(), going = new Map();
  for (const e of inOrder(events)) {
    const bad = eventProblems(e);
    if (bad.length) { problems.push(...bad.map((text) => ({ timer: e && e.timer || e && e.id || null, text }))); continue; }
    if (e.type === 'checkOff') { offs.add(e.side + '|' + e.day); continue; }
    if (e.type === 'names' || e.type === 'vehicles') continue;
    if (e.type === 'start') {
      if (starts.has(e.id)) problems.push({ timer: e.id, text: 'The timer ' + e.id + ' was started twice.' });
      else starts.set(e.id, e);
      continue;
    }
    if (e.type === 'going') { if (!going.has(e.timer)) going.set(e.timer, new Set()); going.get(e.timer).add(ms(e.check)); continue; }
    if (!rest.has(e.timer)) rest.set(e.timer, []);
    rest.get(e.timer).push(e);
  }
  for (const id of rest.keys()) if (!starts.has(id)) problems.push({ timer: id, text: 'There is a stop or a correction for the timer ' + id + ', which was never started.' });
  /* a trip: what belongs to the whole trip (job, operation, note), corrected on any one timer of it, is corrected on all of them, in the order written */
  const members = new Map();
  for (const [id, s] of starts) if (s.trip) { if (!members.has(s.trip)) members.set(s.trip, []); members.get(s.trip).push(id); }
  const shared = new Map();
  for (const [id, list] of rest) {
    const s = starts.get(id); if (!s || !s.trip) continue;
    for (const e of list) if (e.type === 'edit') {
      const part = {}; for (const k of TRIP_WIDE) if (k in e.set) part[k] = e.set[k];
      if (!Object.keys(part).length) continue;
      for (const other of members.get(s.trip)) if (other !== id) { if (!shared.has(other)) shared.set(other, []); shared.get(other).push(Object.assign({}, e, { set: part })); }
    }
  }
  for (const [trip, ids] of members) if (!ids.some((id) => starts.get(id).driver)) problems.push({ timer: trip, text: 'The trip ' + trip + ' has no driver.' });
  const timers = [];
  for (const [id, s] of starts) {
    const T = { id, device: deviceOf(id), by: s.by, job: s.job, jobTyped: !!s.jobTyped, op: s.op, opKind: s.opKind, out: s.out, person: s.person || null,
      vehicle: s.vehicle || null, odoOut: isNum(s.odoOut) ? s.odoOut : null, odoBack: null, note: s.note || '', remake: !!s.remake,
      trip: s.trip || null, driver: !!s.driver,
      start: s.at, startHow: s.how, stop: null, stopHow: null, minutes: null, running: false, toCheck: false, why: [], cancelled: false };
    let tapped = null, edited = null, checked = false;
    const own = rest.get(id) || [], mine = shared.has(id) ? inOrder(own.concat(shared.get(id))) : own;
    for (const e of mine) {
      if (e.type === 'stop') { if (!tapped) { tapped = e; if (isNum(e.odoBack)) T.odoBack = e.odoBack; } continue; }
      for (const [k, v] of Object.entries(e.set)) {
        if (k === 'start') { T.start = v; T.startHow = 'typed'; }
        else if (k === 'stop') edited = v;
        else if (k === 'checked') checked = !!v;
        else if (k === 'cancelled') T.cancelled = !!v;
        else if (k === 'remake' || k === 'jobTyped') T[k] = !!v;
        else T[k] = v;
      }
    }
    if (edited) { T.stop = edited; T.stopHow = 'typed'; }
    else {
      const limit = tapped ? Math.min(ms(tapped.at), at) : at, answered = going.get(id) || new Set();
      const check = checkInstants(T, L, offs, tapped ? limit - 1 : limit).find((t) => !answered.has(t));
      if (check != null) { T.stop = iso(check); T.stopHow = 'check'; }
      else if (tapped) { T.stop = tapped.at; T.stopHow = tapped.how; }
      else T.running = true;
    }
    T.minutes = ((T.stop ? ms(T.stop) : at) - ms(T.start)) / 60000;
    /* why it is to check: each reason in plain words. All of them stay until he says the timer is right (checked) or corrects what is missing. */
    if (!T.cancelled) {
      if (T.stopHow === 'check') {
        const c = localClock(T.stop, zone) === '00:00' ? 'midnight' : showClock(T.stop, zone);
        T.why.push({ why: 'check', text: 'Stopped by the ' + c + ' check: nobody answered "still going?"' });
      }
      if (T.driver && T.vehicle && !isOwn(T) && !T.running && (T.odoOut === null || T.odoBack === null)) {
        const which = T.odoOut === null && T.odoBack === null ? 'No odometer readings' : T.odoOut === null ? 'No odometer leaving' : 'No odometer back';
        T.why.push({ why: 'reading', text: which + ': the kilometres cannot be counted.' });
      }
      const days = (ms(s.made) - ms(T.start)) / 86400000;
      if (s.how === 'typed' && days > LATE_DAYS) T.why.push({ why: 'late', text: 'Typed in ' + Math.floor(days) + ' days after it started.' });
      T.toCheck = T.why.length > 0 && !checked;
    }
    if (T.stop && ms(T.stop) < ms(T.start)) problems.push({ timer: id, text: 'The timer ' + id + ' stops before it starts.' });
    if (T.opKind === 'person' && !T.person) problems.push({ timer: id, text: 'The timer ' + id + ' (' + T.op + ') does not say who did it.' });
    if (T.odoOut !== null && T.odoBack !== null && T.odoBack < T.odoOut) problems.push({ timer: id, text: 'The odometer of ' + id + ' is lower back than out (' + T.odoOut + ' to ' + T.odoBack + ' km).' });
    if ((T.odoOut !== null || T.odoBack !== null) && !T.vehicle) problems.push({ timer: id, text: 'The timer ' + id + ' has odometer readings and no vehicle.' });
    timers.push(T);
  }
  timers.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id < b.id ? -1 : 1));
  problems.push(...overlaps(timers, at));
  problems.push(...odometerOrder(timers));
  return { timers, problems };
}
/* the same machine, the same person or the same vehicle in two timers at once is named, for him to look at: it would count the time twice */
function overlaps(timers, at) {
  const p = [], live = timers.filter((t) => !t.cancelled), end = (t) => (t.stop ? ms(t.stop) : at);
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j];
    if (!(ms(a.start) < end(b) && ms(b.start) < end(a))) continue;
    const both = ' (' + a.id + ' and ' + b.id + ').';
    if (a.opKind === 'machine' && b.opKind === 'machine' && same(a.op, b.op)) p.push({ timer: b.id, text: a.op + ' has two timers at once' + both });
    if (a.person && b.person && same(a.person, b.person)) p.push({ timer: b.id, text: a.person + ' has two timers at once' + both });
    if (a.vehicle && b.vehicle && vehicleKey(a) === vehicleKey(b)) p.push({ timer: b.id, text: (isOwn(a) ? a.person + '\'s own vehicle' : 'The ' + a.vehicle) + ' is on two trips at once' + both });
  }
  return p;
}
/* a vehicle's readings, in the order of its trips, never go down: a reading lower than the last one is a typing slip */
function odometerOrder(timers) {
  const p = [], last = new Map();
  for (const t of timers) {
    if (t.cancelled || !t.vehicle) continue;
    const k = vehicleKey(t), prev = last.get(k), what = isOwn(t) ? t.person + '\'s own vehicle' : 'The ' + t.vehicle;
    if (t.odoOut !== null && prev && t.odoOut < prev.km) p.push({ timer: t.id, text: what + ' left at ' + t.odoOut + ' km on ' + t.id + ', lower than ' + prev.km + ' km at the end of ' + prev.id + '.' });
    const top = t.odoBack !== null ? t.odoBack : t.odoOut;
    if (top !== null) last.set(k, { km: top, id: t.id });
  }
  return p;
}
const findTimer = (events, L, id, now) => timersFrom(events, L, now).timers.find((t) => t.id === id);
/* the names to pick from now: SyntraQuote's list, then every add and remove made on a device, in the order written. SyntraQuote may write a name added on a
   phone into its own list later; adding it twice changes nothing. */
function listNow(events, L, key) {
  const list = (L[key] || []).slice();
  for (const e of inOrder(events)) if (e && e.type === key && isText(e.name)) {
    const i = list.findIndex((n) => same(n, e.name));
    if (e.action === 'add' && i < 0) list.push(e.name.trim());
    if (e.action === 'remove' && i >= 0) list.splice(i, 1);
  }
  return list;
}
const namesNow = (events, L) => listNow(events, L, 'names');
/* the company vehicles to pick from now, the same way (owner, 19 Nov 2026: added or removed on a phone or tablet, as names are). Own vehicle is always offered besides. */
const vehiclesNow = (events, L) => listNow(events, L, 'vehicles');
const withLists = (events, L) => Object.assign({}, L, { names: namesNow(events, L), vehicles: vehiclesNow(events, L) });
/* add or remove a person or a vehicle on the device; the timers already made with it keep it */
function listEvent(events, device, by, L, key, action, name, now) {
  const what = key === 'names' ? 'person' : 'vehicle';
  if (!isText(name)) refuse('Type the ' + what + '\'s name.');
  if (key === 'vehicles' && same(name, OWN_VEHICLE)) refuse('"' + OWN_VEHICLE + '" is always offered on a trip: it is not added or removed.');
  const list = listNow(events, L, key), has = list.some((n) => same(n, name));
  if (action === 'add' && has) refuse('"' + name.trim() + '" is already on the list.');
  if (action === 'remove' && !has) refuse('"' + name.trim() + '" is not on the list.');
  return Object.assign(base(events, device, by, key, now), { action, name: action === 'add' ? name.trim() : list.find((n) => same(n, name)) });
}
const addPerson = (events, device, by, L, name, now) => listEvent(events, device, by, L, 'names', 'add', name, now);
const removePerson = (events, device, by, L, name, now) => listEvent(events, device, by, L, 'names', 'remove', name, now);
const addVehicleHere = (events, device, by, L, name, now) => listEvent(events, device, by, L, 'vehicles', 'add', name, now);
const removeVehicleHere = (events, device, by, L, name, now) => listEvent(events, device, by, L, 'vehicles', 'remove', name, now);

/* ---- making events: each gives back one new event (or several, in an array) for the caller to keep; it refuses in plain words, making nothing ---- */
function base(events, device, by, type, now) {
  if (!isDeviceId(device)) refuse('This device has no id yet.');
  if (!isText(by)) refuse('Sign in first: every record names who made it.');
  return { id: nextEventId(events, device), type, made: iso(nowMs(now)), by: by.trim() };
}
/* the vehicle checked against the company vehicles (with those added or removed on the devices), or Own vehicle */
function pickVehicle(L, name) {
  if (same(name, OWN_VEHICLE)) return OWN_VEHICLE;
  const v = L.vehicles.find((x) => same(x, name));
  if (!v) refuse('"' + name + '" is not in the list of vehicles.');
  return v;
}
/* the job, operation, person and vehicle checked against the lists, and copied in */
function whatAndWho(L, f, by, opFixed) {
  const o = {};
  if (f.job === null || f.job === undefined) { o.job = null; o.jobTyped = false; }
  else if (f.jobTyped) { if (!isText(f.job)) refuse('Type the job\'s name, or pick it from the list.'); o.job = f.job.trim(); o.jobTyped = true; }
  else { const j = L.jobs.find((x) => same(x, f.job)); if (!j) refuse('"' + f.job + '" is not in the list of jobs. Pick it from the list, or type it.'); o.job = j; o.jobTyped = false; }
  const op = opFixed || findOp(L, f.op);
  if (!op) refuse(isText(f.op) ? '"' + f.op + '" is not in the list of operations.' : 'Pick what is being timed.');
  o.op = op.name; o.opKind = op.kind; o.out = op.out;
  if (op.kind === 'machine') o.person = null;
  else if (f.personFixed) o.person = f.person;
  else if (!L.names.length) o.person = isText(f.person) ? f.person.trim() : by.trim();
  else { const n = L.names.find((x) => same(x, f.person)); if (!n) refuse(isText(f.person) ? '"' + f.person + '" is not in the list of names.' : 'Pick who is doing it.'); o.person = n; }
  if (f.vehicle && f.vehicleFixed) o.vehicle = f.vehicle;
  else if (f.vehicle) {
    if (!op.out) refuse('A vehicle goes only on a trip out of the shop.');
    o.vehicle = pickVehicle(L, f.vehicle);
  } else o.vehicle = null;
  return o;
}
function odo(v, what) {
  if (v === null || v === undefined || v === '') return null;
  if (!isNum(v) || v < 0) refuse('The odometer ' + what + ' is not a number of kilometres.');
  return v;
}
function startAt(f, now) {
  if (f.at == null) return null;
  if (!isInstant(f.at)) refuse('The start time is not readable.');
  if (ms(f.at) > nowMs(now)) refuse('A timer cannot start in the future.');
  return f.at;
}
/* starting a person who is on another timer stops that one first, as one action (owner, 19 Nov 2026, screen 3: the screen asks "stop that timer and start
   this one?"). Without stopOther it refuses, naming where each one is, and the refusal carries .busy, the timers to stop. Time typed in afterwards stops nothing:
   if it lies over another timer, that is named for him to look at, as before. */
function stopsFor(events, device, by, L, people, f, now) {
  if (f.at != null) return [];
  const busy = timersFrom(events, L, now).timers.filter((t) => t.running && !t.cancelled && t.person && people.some((p) => same(p, t.person)));
  if (!busy.length) return [];
  if (!f.stopOther) {
    const err = new Error(busy.map((t) => '"' + t.person + '" is on ' + t.op + ', ' + (t.job === null ? SHOP_NO_JOB : t.job) + '.').join(' ') +
      (busy.length > 1 ? ' Stop those timers and start this one?' : ' Stop that timer and start this one?'));
    err.busy = busy.map((t) => t.id);
    throw err;
  }
  const stops = [];
  for (const t of busy) stops.push(stopTimer(events.concat(stops), device, by, L, t.id, {}, now));
  return stops;
}
/* start a timer in the shop: tapped now, or typed (at: the instant it began, not in the future). An operation out of the shop is started as a trip (startTrip).
   Gives back the start; with stopOther, an array: the stops first, the start last. */
function startTimer(events, device, by, L, f, now) {
  f = f || {};
  const lists = withLists(events, L), op = findOp(lists, f.op);
  if (op && op.out) refuse('"' + op.name + '" is out of the shop: start it as a trip (who is going, who drives, which vehicle).');
  const w = whatAndWho(lists, f, by), typedAt = startAt(f, now);
  const stops = w.person ? stopsFor(events, device, by, L, [w.person], f, now) : [];
  const e = base(events.concat(stops), device, by, 'start', now);
  const s = Object.assign(e, { at: typedAt || e.made, how: typedAt ? 'typed' : 'tap' }, w, { odoOut: null, note: isText(f.note) ? f.note.trim() : '', remake: !!f.remake });
  return f.stopOther ? stops.concat([s]) : s;
}
/* start a trip out: people (everyone in the vehicle), driver (one of them), vehicle (a company vehicle or Own vehicle), odoOut (may be left empty), note (what
   the trip is for), job, op (one marked out), at (typed) and stopOther as for startTimer. One start per person, the driver's first; the trip's mark is the id of
   the driver's start. The vehicle and the reading go on the driver's start only. Gives back an array: any stops first, then the starts. */
function startTrip(events, device, by, L, f, now) {
  f = f || {};
  const lists = withLists(events, L), op = findOp(lists, f.op);
  if (!op) refuse(isText(f.op) ? '"' + f.op + '" is not in the list of operations.' : 'Pick what the trip is for.');
  if (!op.out) refuse('A trip is for an operation out of the shop.');
  if (f.remake) refuse('There is no Remake on a trip.');
  const asked = Array.isArray(f.people) && f.people.length ? f.people : (lists.names.length ? [] : [by]);
  if (!asked.length) refuse('Pick who is going.');
  const people = [];
  for (const p of asked) {
    const w = whatAndWho(lists, { job: f.job, jobTyped: f.jobTyped, op: op.name, person: p }, by);
    if (people.some((x) => same(x.person, w.person))) refuse('"' + w.person + '" is picked twice.');
    people.push(w);
  }
  const drive = isText(f.driver) ? f.driver : people.length === 1 ? people[0].person : null;
  const driver = drive && people.find((x) => same(x.person, drive));
  if (!driver) refuse('Pick who is driving: one of the people going.');
  if (!isText(f.vehicle)) refuse('Pick the vehicle: a company vehicle, or Own vehicle.');
  const vehicle = pickVehicle(lists, f.vehicle), odoOut = odo(f.odoOut, 'out'), typedAt = startAt(f, now);
  const stops = stopsFor(events, device, by, L, people.map((x) => x.person), f, now);
  const order = [driver].concat(people.filter((x) => x !== driver)), starts = [];
  for (const w of order) {
    const e = base(events.concat(stops, starts), device, by, 'start', now), isDriver = w === driver;
    starts.push(Object.assign(e, { at: typedAt || e.made, how: typedAt ? 'typed' : 'tap' }, w,
      { vehicle: isDriver ? vehicle : null, odoOut: isDriver ? odoOut : null, note: isText(f.note) ? f.note.trim() : '', remake: false,
        trip: starts.length ? starts[0].id : e.id, driver: isDriver }));
  }
  return stops.concat(starts);
}
function stopTimer(events, device, by, L, timer, f, now) {
  const T = findTimer(events, L, timer, now);
  if (!T) refuse('There is no timer ' + timer + '.');
  if (!T.running) refuse('The timer is already stopped' + (T.stopHow === 'check' ? ' by the end-of-day check: answer "still going" first, or correct its stop.' : '.'));
  const e = base(events, device, by, 'stop', now); f = f || {};
  let at = e.made, how = 'tap';
  if (f.at != null) { if (!isInstant(f.at)) refuse('The stop time is not readable.'); if (ms(f.at) > nowMs(now)) refuse('A timer cannot stop in the future.'); at = f.at; how = 'typed'; }
  if (ms(at) < ms(T.start)) refuse('A timer cannot stop before it started.');
  const odoBack = odo(f.odoBack, 'back');
  if (odoBack !== null && !T.vehicle) refuse(T.trip ? 'The odometer goes on the driver\'s timer (' + T.trip + ').' : 'This timer has no vehicle for the reading.');
  if (odoBack !== null && T.odoOut !== null && odoBack < T.odoOut) refuse('The odometer back (' + odoBack + ' km) is lower than out (' + T.odoOut + ' km).');
  return Object.assign(e, { timer, at, how, odoBack });
}
/* stop a trip, or some of it: people (who is back; everyone still out when not given), odoBack (may be left empty; only when the driver is among them), at
   (typed). Anyone not stopped runs on, and is stopped later with stopTimer. Gives back an array of stops, the driver's first. */
function stopTrip(events, device, by, L, trip, f, now) {
  f = f || {};
  const all = timersFrom(events, L, now).timers.filter((t) => t.trip === trip && !t.cancelled);
  if (!all.length) refuse('There is no trip ' + trip + '.');
  const running = all.filter((t) => t.running);
  if (!running.length) refuse('Everyone on that trip is already stopped.');
  const who = f.people == null ? running : f.people.map((p) => running.find((t) => same(t.person, p)) || refuse('"' + p + '" is not out on that trip.'));
  const odoBack = odo(f.odoBack, 'back'), driver = all.find((t) => t.driver);
  if (odoBack !== null && !who.some((t) => t.driver)) refuse('The odometer back goes with the driver: stop ' + (driver ? driver.person : 'the driver') + ' too, or fill it in later.');
  who.sort((a, b) => (b.driver ? 1 : 0) - (a.driver ? 1 : 0));
  const stops = [];
  for (const t of who) stops.push(stopTimer(events.concat(stops), device, by, L, t.id, { at: f.at, odoBack: t.driver ? odoBack : null }, now));
  return stops;
}
/* time typed in afterwards, start and stop together: two events, both marked typed. The stop is given (until), or worked out from a length in minutes (owner,
   19 Nov 2026, screen 6b: a start and How long give the stop). A trip typed in afterwards is startTrip and stopTrip, each with its at. */
function typedTimer(events, device, by, L, f, now) {
  if (!f || !isInstant(f.at)) refuse('Give the start.');
  let until = f.until;
  if (f.minutes != null) {
    if (!isNum(f.minutes) || f.minutes <= 0) refuse('How long must be a number of minutes, more than none.');
    const u = iso(ms(f.at) + Math.round(f.minutes * 60000));
    if (until != null && until !== u) refuse('The stop and how long do not agree: give one of them.');
    until = u;
  }
  if (!isInstant(until)) refuse('Give the stop, or how long it took.');
  if (ms(until) <= ms(f.at)) refuse('The stop must come after the start.');
  if (ms(until) > nowMs(now)) refuse('A timer cannot stop in the future.');
  const s = startTimer(events, device, by, L, Object.assign({}, f, { stopOther: false }), now);
  const e = base(events.concat([s]), device, by, 'stop', now);
  return [s, Object.assign(e, { timer: s.id, at: until, how: 'typed', odoBack: null })];
}
/* a correction: any of the things a timer holds; the operation is checked against the lists and copied in with its kind and side. On a trip the job, the operation
   and the note are corrected for the whole trip (one event; every reader applies it to each timer of the trip), and the vehicle and readings on the driver's
   timer only. A timer is never moved between the shop and out: it is marked Started by mistake and started again. */
function editTimer(events, device, by, L, timer, set, now) {
  const T = findTimer(events, L, timer, now);
  if (!T) refuse('There is no timer ' + timer + '.');
  if (!isObj(set) || !Object.keys(set).length) refuse('Nothing to change.');
  const out = {};
  for (const k of Object.keys(set)) if (!EDITABLE.includes(k)) refuse('"' + k + '" cannot be changed.');
  if (T.trip && set.remake) refuse('There is no Remake on a trip.');
  if (T.trip && !T.driver && ('vehicle' in set || 'odoOut' in set || 'odoBack' in set)) refuse('The vehicle and its readings are on the driver\'s timer (' + T.trip + ').');
  if (T.trip && 'vehicle' in set && !isText(set.vehicle)) refuse('A trip needs its vehicle.');
  if ('op' in set) {
    const o = findOp(L, set.op);
    if (o && o.out !== T.out) refuse(T.out ? 'A trip\'s operation can only be changed to another one out of the shop.' : 'A timer in the shop cannot be made a trip out: mark it Started by mistake, and start the trip.');
  }
  if ('job' in set || 'op' in set || 'person' in set || 'vehicle' in set) {
    /* a timer keeps its own operation when it is not being changed, even one since taken off the list */
    const opFixed = 'op' in set ? null : { name: T.op, kind: T.opKind, out: T.out };
    const keepJob = !('job' in set) && !('jobTyped' in set), keepPerson = !('person' in set) && !('op' in set);
    const w = whatAndWho(withLists(events, L), { job: 'job' in set ? set.job : T.job, jobTyped: 'jobTyped' in set ? !!set.jobTyped : (keepJob ? true : T.jobTyped),
      op: 'op' in set ? set.op : T.op, person: 'person' in set ? set.person : T.person,
      personFixed: keepPerson && T.person !== null,
      vehicle: 'vehicle' in set ? set.vehicle : T.vehicle, vehicleFixed: !('vehicle' in set) }, by, opFixed);
    if ('job' in set || 'jobTyped' in set) { out.job = w.job; out.jobTyped = w.jobTyped; }
    if ('op' in set) { out.op = w.op; out.opKind = w.opKind; out.out = w.out; }
    if ('op' in set || 'person' in set) out.person = w.person;
    if ('vehicle' in set) out.vehicle = w.vehicle;
  }
  for (const k of ['note']) if (k in set) out[k] = isText(set[k]) ? set[k].trim() : '';
  for (const k of ['remake', 'checked', 'cancelled']) if (k in set) out[k] = !!set[k];
  for (const k of ['odoOut', 'odoBack']) if (k in set) out[k] = odo(set[k], k === 'odoOut' ? 'out' : 'back');
  for (const k of ['start', 'stop']) if (k in set) {
    if (!isInstant(set[k])) refuse('The ' + k + ' time is not readable.');
    if (ms(set[k]) > nowMs(now)) refuse('A timer cannot ' + k + ' in the future.');
    out[k] = set[k];
  }
  const s = 'start' in out ? out.start : T.start, e = 'stop' in out ? out.stop : T.stop;
  if (e && ms(e) < ms(s)) refuse('A timer cannot stop before it started.');
  const oo = 'odoOut' in out ? out.odoOut : T.odoOut, ob = 'odoBack' in out ? out.odoBack : T.odoBack;
  if (oo !== null && ob !== null && ob < oo) refuse('The odometer back (' + ob + ' km) is lower than out (' + oo + ' km).');
  return Object.assign(base(events, device, by, 'edit', now), { timer, set: out });
}
/* "still going": the answer to one end-of-day check (it may come late; the timer then runs on from that check) */
function stillGoing(events, device, by, L, timer, check, now) {
  const T = findTimer(events, L, timer, now);
  if (!T) refuse('There is no timer ' + timer + '.');
  if (T.stopHow !== 'check' || T.stop !== check) refuse('That timer is not waiting for an answer to that check.');
  return Object.assign(base(events, device, by, 'going', now), { timer, check });
}
/* "off for today": no end-of-day check for that side on this shop day; it is back on the next day by itself */
function checkOffToday(events, device, by, L, side, now) {
  if (!CHECK_SIDES.includes(side)) refuse('The end-of-day check is for timers in the shop or out of the shop.');
  return Object.assign(base(events, device, by, 'checkOff', now), { side, day: localDay(nowMs(now), L.settings.zone) });
}

/* ---- what it gives back (step 1: the record; quoted against real is step 2, learned times step 3) ----------------------------
   Finished timers only, cancelled ones left out. Minutes are not rounded: only the screen rounds. Person minutes and machine minutes are never added together
   (owner, 17 and 19 Nov 2026), so every figure that could hold both is given as { person, machine }.
   Remake time is inside the person and machine figures and also given apart, so the learned times can leave it out. Timers still to check count in the hours
   (screen 10, owner 19 Nov 2026), and their minutes are also given apart ("of which … to check"): the amber end of each bar. */
const jobKey = (j) => (j === null ? '\u0000' : j.toLowerCase());
const byJob = (a, b) => (a.job === null ? (b.job === null ? 0 : 1) : b.job === null ? -1 : a.job.localeCompare(b.job, 'en', { sensitivity: 'base' }));
const counted = (t) => !t.cancelled && !t.running;
/* one person's figures: minutes, the remake and to-check minutes inside them, and how many timers */
const personRow = (person) => ({ person, minutes: 0, remake: 0, check: 0, timers: 0 });
function addTo(R, t) { R.minutes += t.minutes; R.timers++; if (t.remake) R.remake += t.minutes; if (t.toCheck) R.check += t.minutes; }
const byMinutes = (a, b) => b.minutes - a.minutes || a.person.localeCompare(b.person, 'en', { sensitivity: 'base' });
function jobTotals(timers) {
  const jobs = new Map();
  for (const t of timers) {
    if (!counted(t)) continue;
    const key = jobKey(t.job);
    if (!jobs.has(key)) jobs.set(key, { job: t.job, person: 0, machine: 0, remake: { person: 0, machine: 0 }, check: { person: 0, machine: 0 }, toCheck: 0, trips: 0,
      tripMarks: new Set(), people: new Map(), ops: new Map() });
    const J = jobs.get(key), k = t.opKind;
    if (t.trip && !J.tripMarks.has(t.trip)) { J.tripMarks.add(t.trip); J.trips++; }
    /* an operation is its name and its kind: one whose kind was changed in Settings keeps its old records apart, so a machine hour never joins a person hour */
    const ok = k + '|' + t.op.toLowerCase();
    if (!J.ops.has(ok)) J.ops.set(ok, { op: t.op, kind: k, person: 0, machine: 0, remake: 0, check: 0, timers: 0 });
    const O = J.ops.get(ok);
    J[k] += t.minutes; O[k] += t.minutes; O.timers++;
    if (t.remake) { J.remake[k] += t.minutes; O.remake += t.minutes; }
    if (t.toCheck) { J.toCheck++; J.check[k] += t.minutes; O.check += t.minutes; }
    /* who worked on it: people only (machine time has no person), most hours first */
    if (k === 'person') {
      const pk = String(t.person).toLowerCase();
      if (!J.people.has(pk)) J.people.set(pk, personRow(t.person));
      addTo(J.people.get(pk), t);
    }
  }
  return [...jobs.values()].map((J) => { delete J.tripMarks; return Object.assign(J, { people: [...J.people.values()].sort(byMinutes), ops: [...J.ops.values()] }); })
    .sort(byJob);
}
/* the By person view (screen 10): each person's hours across every job, people A to Z, and under each the jobs they worked on, in the order of jobTotals (A to Z,
   "Shop, no job" last). People only: machine time has no person and is never added in. Remake and to-check minutes are inside, and also given apart. */
function personTotals(timers) {
  const people = new Map();
  for (const t of timers) {
    if (!counted(t) || t.opKind !== 'person' || !t.person) continue;
    const pk = t.person.toLowerCase();
    if (!people.has(pk)) people.set(pk, Object.assign(personRow(t.person), { jobs: new Map() }));
    const P = people.get(pk), jk = jobKey(t.job);
    addTo(P, t);
    if (!P.jobs.has(jk)) P.jobs.set(jk, Object.assign({ job: t.job }, personRow(t.person)));
    addTo(P.jobs.get(jk), t);
  }
  return [...people.values()].map((P) => Object.assign(P, { jobs: [...P.jobs.values()].map((j) => { delete j.person; return j; }).sort(byJob) }))
    .sort((a, b) => a.person.localeCompare(b.person, 'en', { sensitivity: 'base' }));
}
/* kilometres and trips for each vehicle, from the trips with both readings: counted once, on the driver's timer. Own vehicle is kept apart for each person:
   person is the driver's name on an Own vehicle row, and null on a company vehicle. */
function vehicleKm(timers) {
  const v = new Map();
  for (const t of timers) {
    if (t.cancelled || !t.vehicle || t.odoOut === null || t.odoBack === null) continue;
    const k = vehicleKey(t);
    if (!v.has(k)) v.set(k, { vehicle: t.vehicle, person: isOwn(t) ? t.person : null, km: 0, trips: 0 });
    const V = v.get(k); V.km += t.odoBack - t.odoOut; V.trips++;
  }
  return [...v.values()].sort((a, b) => a.vehicle.localeCompare(b.vehicle) || String(a.person).localeCompare(String(b.person)));
}
/* a vehicle's last reading, shown under the odometer when a trip leaves (screen 5) and on the Vehicles tab (screen 8): the highest of its trips, in their order;
   for Own vehicle, that person's own. Null when it has none. */
function lastReading(timers, vehicle, person) {
  const key = vehicleKey({ vehicle, person });
  let last = null;
  for (const t of timers) {
    if (t.cancelled || !t.vehicle || vehicleKey(t) !== key) continue;
    const top = t.odoBack !== null ? t.odoBack : t.odoOut;
    if (top !== null) last = { km: top, timer: t.id };
  }
  return last;
}
/* one card per trip (screens 5b, 9 and the Kilometres view), from its timers: the people (driver first), the vehicle and readings from the driver's timer, from the
   first start to the last stop (stop is null while anyone is still out), km when both readings are there, toCheck when any of its timers is. Cancelled timers are
   left out, and a trip whose timers are all cancelled is not shown. */
function tripsFrom(timers) {
  const trips = new Map();
  for (const t of timers) {
    if (!t.trip || t.cancelled) continue;
    if (!trips.has(t.trip)) trips.set(t.trip, []);
    trips.get(t.trip).push(t);
  }
  return [...trips].map(([trip, ts]) => {
    ts.sort((a, b) => (b.driver ? 1 : 0) - (a.driver ? 1 : 0));
    const d = ts.find((t) => t.driver) || null, running = ts.some((t) => t.running);
    const odoOut = d ? d.odoOut : null, odoBack = d ? d.odoBack : null;
    return { trip, job: ts[0].job, op: ts[0].op, note: ts[0].note, vehicle: d ? d.vehicle : null, driver: d ? d.person : null,
      people: ts.map((t) => t.person), timers: ts.map((t) => t.id),
      start: ts.map((t) => t.start).sort()[0], stop: running ? null : ts.map((t) => t.stop).sort().at(-1), running,
      odoOut, odoBack, km: odoOut !== null && odoBack !== null ? odoBack - odoOut : null, toCheck: ts.some((t) => t.toCheck) };
  }).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.trip < b.trip ? -1 : 1));
}

/* ---- the files ---------------------------------------------------------------------------------------------------------------
   A day file is one device's diary for one day, by world time (so a file's name never depends on a setting): Records/2026-11/2026-11-19.K7Q2.json.
   Only that device writes it, always whole, with every event of that day it holds. A device whose storage was cleared takes a new id, so it can never write over
   an old diary. */
function recordPath(day, device) { return PLACES.records + '/' + day.slice(0, 7) + '/' + day + '.' + device + '.json'; }
function dayFiles(events, device, deviceName) {
  const days = new Map();
  for (const e of inOrder(events)) if (deviceOf(e.id) === device) {
    const d = e.made.slice(0, 10); if (!days.has(d)) days.set(d, []); days.get(d).push(e);
  }
  return [...days].map(([day, evs]) => ({ path: recordPath(day, device),
    data: { format: FORMAT.day, version: VERSION.day, device, deviceName: deviceName || '', day, events: evs } }));
}
function checkDay(D) {
  const p = [];
  if (!isObj(D) || D.format !== FORMAT.day) return ['This is not a SyntraTime day file.'];
  if (!isDeviceId(D.device)) p.push('The day file does not say which device wrote it.');
  if (!isDay(D.day)) p.push('The day file does not say its day.');
  if (!Array.isArray(D.events)) return p.concat('The day file has no events.');
  for (const e of D.events) {
    p.push(...eventProblems(e));
    if (isObj(e) && deviceOf(e.id) !== D.device) p.push('Event ' + e.id + ' is in the diary of another device.');
    if (isObj(e) && isInstant(e.made) && e.made.slice(0, 10) !== D.day) p.push('Event ' + e.id + ' is in the diary of another day.');
  }
  return p;
}
/* a file read from the Time folder: refused in plain words when it is not one of SyntraTime's, or of another version, never half-read */
function readFile(text) {
  let o; try { o = JSON.parse(text); } catch (e) { refuse('The file is not readable: it is not a SyntraTime file, or it was cut short.'); }
  const kind = Object.keys(FORMAT).find((k) => FORMAT[k] === (o && o.format));
  if (!kind) refuse('This is not a SyntraTime file.');
  if (o.version !== VERSION[kind]) refuse('This ' + kind + ' file is version ' + o.version + '; this program reads version ' + VERSION[kind] + '.');
  return { kind, data: o };
}
/* SyntraQuote's copy: every event ever read, joined by id. Nothing is dropped when the Time folder has lost an event; an id that comes back different is named, and the
   first copy kept. */
function mergeEvents(known, incoming) {
  const byId = new Map(known.map((e) => [e.id, e])), added = [], clashes = [];
  for (const e of incoming) {
    const had = byId.get(e.id);
    if (!had) { byId.set(e.id, e); added.push(e.id); }
    else if (JSON.stringify(had) !== JSON.stringify(e)) clashes.push(e.id);
  }
  return { events: inOrder([...byId.values()]), added, clashes };
}

return { FORMAT, VERSION, ZONE, PLACES, EVENT_TYPES, OP_KINDS, CHECK_SIDES, EDITABLE, ID_LETTERS, SHOP_NO_JOB, OWN_VEHICLE, LATE_DAYS, TRIP_WIDE, STARTER_OPERATIONS,
  isInstant, localDay, localClock, showClock, atLocal, nextDay, offsetAt, showMinutes, showElapsed,
  starterLists, checkLists, addName, removeName, addVehicle, removeVehicle, addOperation, setOperation, removeOperation, setJobs, setCheck, checksOn,
  namesNow, vehiclesNow, addPerson, removePerson, addVehicleHere, removeVehicleHere,
  newDeviceId, nextEventId, inOrder, eventProblems, timersFrom, startTimer, startTrip, stopTimer, stopTrip, typedTimer, editTimer, stillGoing, checkOffToday,
  jobTotals, personTotals, vehicleKm, lastReading, tripsFrom, recordPath, dayFiles, checkDay, readFile, mergeEvents };
});
