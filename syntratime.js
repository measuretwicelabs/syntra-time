/* syntratime.js: the shape of everything SyntraTime keeps, and the rules that turn it into timers and hours. Read syntraquote docs/DATA.md, "SyntraTime", first:
   it has the same shapes with a picture and the reasons. The plan is Linework docs/QUOTES_PLAN.md, section 6b (the lists of 20 and 21 Nov 2026 at its end).

   One file, run in three places: the phone page (time/index.html), SyntraQuote on the computer (which writes the lists and reads the records), and Node for the tests
   (tests/node/time.test.js). It knows nothing about screens, Microsoft or folders: it is given words and numbers, and gives back words and numbers.

   The idea in one line: every phone or tablet keeps a diary of what was tapped (an "event": a start, a stop, a pause, a correction), one diary file per device per
   day, and nothing in a diary is ever rubbed out. The timers, the hours and the kilometres are worked out from all the diaries together, the same way everywhere.
   Why a diary and not a file per timer: two devices never write the same file, so OneDrive never makes a "conflicted copy"; a phone can stop a timer the shop tablet
   started; and a record cannot be lost by being written over.

   What a timer is (owner, 20 and 21 Nov 2026): one timer tracks one task and how long it took. Timers do not care what the others are doing. They are not employee
   hours, and no program prices from them. A task in the shop is one timer with its workers named on it (one or more, on person and machine operations alike); a trip
   out keeps a timer for each person, as built on 19 Nov.

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
/* version 2 (21 Nov 2026): one timer for a task with its workers named, Pause, the CNC's two stretches, maintenance, check-ins, the long-timer limit, and the
   end-of-day check kept by each phone. A copy of the page made for version 1 refuses these files in plain words, and this one refuses version 1's. */
const VERSION = { day: 2, lists: 2 };
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
const EVENT_TYPES = ['start', 'stop', 'edit', 'going', 'pause', 'resume', 'switch', 'unswitch', 'labels', 'checkin', 'eod', 'names', 'vehicles'];
/* how a start or stop came to be: tapped at the moment, typed in afterwards, or (stops only) the end-of-day check with no answer */
const HOW = { start: ['tap', 'typed'], stop: ['tap', 'typed'] };
const OP_KINDS = ['person', 'machine'];       /* person time and machine time are kept apart (owner, 17 and 19 Nov 2026) */
/* two operations are timed in a way of their own (owner, 21 Nov 2026): the CNC (one timer, two stretches) and Maintenance (a machine and a kind of work) */
const OP_MODES = ['cnc', 'maintenance'];
const CNC_PARTS = ['cutting', 'loading'];     /* what the CNC is doing: starting one ends the other */
const CNC_WORDS = { cutting: 'Cutting', loading: 'Loading and unloading' };
/* Labels (owner, 21 Nov 2026, with his hand test 7): unloading with the labels put on takes longer than without, so two CNC timers can only be compared when this is known.
   Two operations ask it, once, when the timer starts, and Start waits for the answer (nothing is picked beforehand):
   - the CNC ("sheets"): On or Off for the timer, and a switch that can be turned only while Loading and unloading is the part running (the task not paused). A change is an event
     of its own ("labels"). A sheet is labelled when Labels is on at the moment Cutting is tapped again after that sheet's cutting (the end of its unload), or at Stop when the
     timer is stopped during that unload. What the switch said earlier in that unload does not matter, and the answer stays as it was left until it is turned again;
   - Beam saw cutting ("timer"): On or Off for the whole timer, set once, never changed afterwards: to change it, stop the timer and start a new one.
   An operation asks when it is the CNC (mode cnc) or carries labels: true on the lists. A lists file written before this has no such field, so "Beam saw cutting" asks anyway
   until the lists say otherwise (labels: false). A timer started before this has no answer and reads "not asked". */
const LABELS_STARTER = 'Beam saw cutting';
const MAINTENANCE_KINDS = ['Repair', 'Regular maintenance', 'Changing tooling'];
/* the machines maintenance may be for, to begin with: his four computerised machines. A list in the lists file, with add and delete (SyntraQuote's Settings). */
const STARTER_MACHINES = ['CNC', 'Beam saw', 'Edge bander', 'Dowel inserter'];
const LONG_HOURS = 4;                         /* the long-timer limit to begin with (owner, 20 Nov 2026): one limit for everything, a setting in the lists */
/* the end-of-day check of a phone or tablet that has never set its own: on, at 4:00 pm (the shop day ends at 4 pm: owner, 19 Nov 2026) */
const END_OF_DAY = { on: true, at: '16:00' };
const EOD_KEEP_DAYS = 3;                      /* a device writes its end-of-day setting again when its last note of it is older than this, so every reader has it */
const EDITABLE = ['job', 'jobTyped', 'op', 'workers', 'person', 'machine', 'work', 'vehicle', 'odoOut', 'odoBack', 'note', 'remake', 'start', 'stop', 'checked', 'cancelled', 'sheetLabels'];
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

/* the starting list of operations (offered 18 Nov 2026, "good" late that night; changed 21 Nov 2026: "CNC" is one operation where "CNC cutting" was, "Maintenance"
   takes the place "Loading and unloading the CNC" leaves, and "Cleaning and maintenance" is "Cleaning"; nothing else moves). Each is person or machine time, and in
   the shop or out. The kinds of trip out (delivery, pickup, install, site visit) are the operations marked out: one list, kept once. */
const STARTER_OPERATIONS = [
  ['Site visit', 'person', true], ['Shop drawings', 'person', false], ['Maintenance', 'person', false, 'maintenance'],
  ['CNC', 'machine', false, 'cnc'], ['Beam saw cutting', 'machine', false, null, true], ['Edgebanding', 'machine', false], ['Dowel insertion', 'machine', false],
  ['Laminating', 'person', false], ['Solid surface', 'person', false], ['Assembly', 'person', false], ['Finishing', 'person', false],
  ['Doors and hardware', 'person', false], ['Delivery', 'person', true], ['Pickup', 'person', true], ['Installation', 'person', true],
  ['Cleaning', 'person', false]
].map(([name, kind, out, mode, labels]) => Object.assign({ name, kind, out }, mode ? { mode } : {}, labels ? { labels: true } : {}));

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
   operations  [ { name, kind: person | machine, out: true when it is done out of the shop, mode: cnc | maintenance on the two timed in their own way } ]
   names       the people who may be picked on a timer (names, not logins: owner, 19 Nov 2026)
   vehicles    the vehicles a trip out may be in, so each one's kilometres stay apart
   machines    the machines a maintenance timer may be for (owner, 21 Nov 2026)
   settings    zone; long: the long-timer limit in hours, each setting from the day it was set: [ { from, hours } ]. A change counts from the day it is made, so
               a timer already stopped keeps the limit it had and a record never changes because a setting did.
   The end-of-day check is no longer here (owner, 21 Nov 2026): its switch and time belong to each phone or tablet, written in that device's own diary ("eod").
   The names and the vehicles may also be added or removed on a phone or tablet (a "names" or "vehicles" event in its diary, laid over the list SyntraQuote wrote),
   so the lists file still has one writer. */
function starterLists(today) {
  return { format: FORMAT.lists, version: VERSION.lists, written: null,
    jobs: [], operations: clone(STARTER_OPERATIONS), names: [], vehicles: [], machines: STARTER_MACHINES.slice(),
    settings: { zone: ZONE, long: [{ from: today || '2026-01-01', hours: LONG_HOURS }] } };
}
const hoursWords = (h) => h + (h === 1 ? ' hour' : ' hours');
function checkLists(L) {
  const p = [];
  if (!isObj(L)) return ['The lists are not readable.'];
  if (L.format !== FORMAT.lists) p.push('This is not the lists file of SyntraTime.');
  for (const k of ['jobs', 'operations', 'names', 'vehicles', 'machines']) if (!Array.isArray(L[k])) p.push('The lists have no ' + k + '.');
  const twice = (arr, what) => { const seen = new Set(); for (const n of arr) { const k = String(n).trim().toLowerCase(); if (seen.has(k)) p.push(what + ' "' + n + '" is on the list twice.'); seen.add(k); } };
  if (Array.isArray(L.jobs)) { L.jobs.forEach((j) => { if (!isText(j)) p.push('A job on the list has no name.'); }); twice(L.jobs, 'The job'); }
  if (Array.isArray(L.names)) { L.names.forEach((j) => { if (!isText(j)) p.push('A name on the list is empty.'); }); twice(L.names, 'The name'); }
  if (Array.isArray(L.machines)) { L.machines.forEach((j) => { if (!isText(j)) p.push('A machine on the list has no name.'); }); twice(L.machines, 'The machine'); }
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
      if (o.mode != null && !OP_MODES.includes(o.mode)) p.push('The operation "' + o.name + '" is timed in a way SyntraTime does not know.');
      if (o.mode === 'cnc' && (o.kind !== 'machine' || o.out)) p.push('The operation "' + o.name + '" is the CNC and is not machine time in the shop.');
      if (o.mode === 'maintenance' && (o.kind !== 'person' || o.out)) p.push('The operation "' + o.name + '" is maintenance and is not person time in the shop.');
      if (o.labels != null && typeof o.labels !== 'boolean') p.push('The operation "' + o.name + '" does not say plainly whether it asks about labels.');
    });
    twice(L.operations.filter(isObj).map((o) => o.name), 'The operation');
  }
  const s = L.settings;
  if (!isObj(s) || !isText(s.zone)) p.push('The lists do not say the shop\'s time zone.');
  else {
    try { new Intl.DateTimeFormat('en', { timeZone: s.zone }); } catch (e) { p.push('The time zone "' + s.zone + '" is not known.'); }
    if (!Array.isArray(s.long) || !s.long.length) p.push('The lists have no long-timer limit.');
    else s.long.forEach((c, i) => {
      if (!isObj(c) || !isDay(c.from)) { p.push('A long-timer limit has no day it starts from.'); return; }
      if (i && !(c.from > s.long[i - 1].from)) p.push('The long-timer limits are not in order of their days.');
      if (!isNum(c.hours) || c.hours <= 0) p.push('The long-timer limit from ' + c.from + ' is not a number of hours.');
    });
  }
  return p;
}
const findOp = (L, name) => (L.operations || []).find((o) => same(o.name, name));
/* how an operation asks about labels: 'sheets' (the CNC), 'timer' (Beam saw cutting), or null (it does not ask) */
function labelsWay(L, name) {
  const o = findOp(L, name);
  if (!o || o.out) return null;
  if (o.mode === 'cnc') return 'sheets';
  if (o.labels === true) return 'timer';
  if (o.labels == null && same(o.name, LABELS_STARTER)) return 'timer';
  return null;
}
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
/* the machines maintenance may be for (owner, 21 Nov 2026): deleting one takes it off the list to pick from; the maintenance already recorded keeps it */
const addMachine = (L, n) => addToList(L, 'machines', n, 'machine');
const removeMachine = (L, n) => removeFromList(L, 'machines', n);
function addOperation(L, op) {
  if (!isObj(op) || !isText(op.name)) refuse('Type the operation\'s name.');
  if (findOp(L, op.name)) refuse('"' + op.name.trim() + '" is already on the list.');
  if (!OP_KINDS.includes(op.kind)) refuse('Say whether "' + op.name.trim() + '" is person time or machine time.');
  if (op.kind === 'machine' && op.out) refuse('A machine is timed in the shop only.');
  const out = clone(L); out.operations.push({ name: op.name.trim(), kind: op.kind, out: !!op.out }); return out;
}
/* an operation's kind (person or machine time) or side (in the shop or out) changed where it stands in the list, so its place on the phone's screen is kept (SyntraQuote's Settings,
   Operations tab: the Person / Machine and Shop / Out buttons on its row). Records already made keep their own copy, so past hours never change with it.
   The CNC and Maintenance are timed in their own way and stay what they are. */
function setOperation(L, name, change) {
  const op = findOp(L, name);
  if (!op) refuse('"' + name + '" is not on the list.');
  if (!isObj(change) || !('kind' in change || 'out' in change)) refuse('Nothing to change.');
  if ('kind' in change && !OP_KINDS.includes(change.kind)) refuse('Say whether "' + op.name + '" is person time or machine time.');
  const next = Object.assign({}, op, { kind: 'kind' in change ? change.kind : op.kind, out: 'out' in change ? !!change.out : op.out });
  if (op.mode === 'cnc' && (next.kind !== 'machine' || next.out)) refuse('"' + op.name + '" is the CNC: it is always machine time in the shop.');
  if (op.mode === 'maintenance' && (next.kind !== 'person' || next.out)) refuse('"' + op.name + '" is maintenance: it is always person time in the shop.');
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
/* the long-timer limit changed, counted from today (owner, 20 Nov 2026: one limit for everything, starting at 4 hours of running time). Timers already stopped
   keep the limit they had. */
function setLong(L, hours, today) {
  if (!isNum(hours) || hours <= 0) refuse('Give the limit as a number of hours, more than none.');
  if (hours > 24) refuse('A timer is always asked at midnight, so the limit is 24 hours at most.');
  if (!isDay(today)) refuse('The day is not written YYYY-MM-DD.');
  const out = clone(L), list = out.settings.long, last = list[list.length - 1];
  if (today < last.from) refuse('The limit cannot be changed for a day before ' + last.from + '.');
  if (last.hours === hours) refuse('The limit is already ' + hoursWords(hours) + '.');
  if (last.from === today) list[list.length - 1] = { from: today, hours }; else list.push({ from: today, hours });
  return out;
}
/* the long-timer limit in force on a shop day, in hours */
function longOn(L, day) {
  const list = L.settings.long; let c = list[0];
  for (const x of list) if (x.from <= day) c = x;
  return c.hours;
}

/* ---- the diary: events --------------------------------------------------------------------------------------------------------
   Every event:  id (the device and its own count: K7Q2-12), type, made (the instant it was written), by (who was signed in: his name, read from his Microsoft sign-in)
   start     at, how (tap | typed), job (a name, or null for "Shop, no job"), jobTyped, op, opKind, out, mode (cnc | maintenance | null), note, remake,
             in the shop: workers [names] (one or more, on person and machine operations alike), and for maintenance: machine, work (the kind of work)
             on a trip out: person (one name), trip (the trip's mark: the id of the driver's start), driver (true on the driver's start only), vehicle, odoOut
             The timer's id is its start's id. The operation's name, kind and side are copied in, so the record stands on its own when the list changes.
   stop      timer, at, how (tap | typed), odoBack
   pause     timer, at, worker (a name on the timer, or null for the whole task)
   resume    timer, at, worker (the same)
   switch    timer, at, to (cutting | loading): what the CNC is doing from that moment; the stretch before it ends there
   unswitch  timer, undo (the id of the switch that is undone: "Undo the last switch")
   checkin   timer, at: someone confirmed the work is still going (the Check in button of the notification)
   edit      timer, set { any of: job, jobTyped, op (with opKind and out), workers, person, machine, work, vehicle, odoOut, odoBack, note, remake, start, stop, checked, cancelled }
   going     timer, check (the instant of the end-of-day check that was answered "still going")
   eod       on, at ("16:00"): this device's end-of-day check from this moment on; a timer follows the device that started it
   names     action (add | remove), name: a person added or removed on the device, as a timer is started for someone not on the list
   vehicles  action (add | remove), name: a company vehicle added or removed on the device, as a trip is started (owner, 19 Nov 2026, the trip screens)

   A trip out (owner, 19 Nov 2026; "exactly as built", 20 Nov 2026): several people go in one vehicle and are started and stopped together. Each person keeps a timer
   of their own, so the hours stay per person (three people out for an hour are three hours on the job); the timers are tied by the trip's mark. The vehicle and both
   readings are on the driver's timer only, so the kilometres are counted once. One or more may be stopped while the rest run on. An operation out of the shop is
   always started as a trip (one person alone is a trip of one), and there is no Remake on a trip. */
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
const NO_TIMER = ['start', 'eod', 'names', 'vehicles'];
function eventProblems(e) {
  const p = [], who = 'Event ' + (e && e.id || '?') + ': ';
  if (!isObj(e)) return ['An event is not readable.'];
  if (!/^[A-Z2-9]{4}-[1-9]\d*$/.test(String(e.id))) p.push(who + 'its id is not a device and a number.');
  if (!EVENT_TYPES.includes(e.type)) p.push(who + 'it is not a kind of event SyntraTime knows.');
  if (!isInstant(e.made)) p.push(who + 'the time it was written is not in world time.');
  if (!isText(e.by)) p.push(who + 'it does not name who made it.');
  if (EVENT_TYPES.includes(e.type) && !NO_TIMER.includes(e.type) && !isText(e.timer)) p.push(who + 'it does not say which timer.');
  if (e.type === 'start') {
    if (!isInstant(e.at)) p.push(who + 'the start is not in world time.');
    if (!HOW.start.includes(e.how)) p.push(who + 'the start is neither tapped nor typed.');
    if (e.job !== null && !isText(e.job)) p.push(who + 'the job has no name.');
    if (!isText(e.op)) p.push(who + 'it has no operation.');
    if (!OP_KINDS.includes(e.opKind)) p.push(who + 'the operation is neither person time nor machine time.');
    if (typeof e.out !== 'boolean') p.push(who + 'it does not say whether it is in the shop or out.');
    if (e.trip != null) {
      if (!isText(e.trip) || typeof e.driver !== 'boolean') p.push(who + 'its trip is not readable.');
      if (!isText(e.person)) p.push(who + 'it does not say who is on the trip.');
      if (!e.driver && e.vehicle) p.push(who + 'the vehicle is on a timer that is not the driver\'s.');
    } else if (!Array.isArray(e.workers) || !e.workers.length || !e.workers.every(isText)) p.push(who + 'it does not say who is working.');
    if (e.mode != null && !OP_MODES.includes(e.mode)) p.push(who + 'it is timed in a way SyntraTime does not know.');
    if (e.mode === 'maintenance' && (!isText(e.machine) || !MAINTENANCE_KINDS.includes(e.work))) p.push(who + 'the maintenance does not say which machine, or which kind of work.');
    if (e.labels != null && typeof e.labels !== 'boolean') p.push(who + 'labels is neither on nor off.');
  }
  if (e.type === 'stop') {
    if (!isInstant(e.at)) p.push(who + 'the stop is not in world time.');
    if (!HOW.stop.includes(e.how)) p.push(who + 'the stop is neither tapped nor typed.');
  }
  if (e.type === 'edit') {
    if (!isObj(e.set) || !Object.keys(e.set).length) p.push(who + 'the correction changes nothing.');
    else for (const k of Object.keys(e.set)) if (!EDITABLE.includes(k) && k !== 'opKind' && k !== 'out') p.push(who + '"' + k + '" cannot be corrected.');
    if (isObj(e.set)) for (const k of ['start', 'stop']) if (k in e.set && !isInstant(e.set[k])) p.push(who + 'the corrected ' + k + ' is not in world time.');
    if (isObj(e.set) && 'sheetLabels' in e.set && (!Array.isArray(e.set.sheetLabels) || !e.set.sheetLabels.length || !e.set.sheetLabels.every((b) => typeof b === 'boolean'))) p.push(who + 'the corrected labels are not on or off for each sheet.');
    if (isObj(e.set) && 'workers' in e.set && (!Array.isArray(e.set.workers) || !e.set.workers.length || !e.set.workers.every(isText))) p.push(who + 'the corrected workers name nobody.');
  }
  if (e.type === 'going' && !isInstant(e.check)) p.push(who + 'the check it answers is not in world time.');
  if ((e.type === 'pause' || e.type === 'resume') && (!isInstant(e.at) || (e.worker != null && !isText(e.worker)))) p.push(who + 'it does not say when, or for whom.');
  if (e.type === 'switch' && (!isInstant(e.at) || !CNC_PARTS.includes(e.to))) p.push(who + 'it does not say when, or what the CNC went on to.');
  if (e.type === 'unswitch' && !isText(e.undo)) p.push(who + 'it does not say which switch is undone.');
  if (e.type === 'labels' && (!isInstant(e.at) || typeof e.on !== 'boolean')) p.push(who + 'it does not say when, or whether labels are on.');
  if (e.type === 'checkin' && !isInstant(e.at)) p.push(who + 'the check-in is not in world time.');
  if (e.type === 'eod' && (typeof e.on !== 'boolean' || !isClock(e.at))) p.push(who + 'it does not say whether the end-of-day check is on, or its time.');
  if (e.type === 'names' && (!['add', 'remove'].includes(e.action) || !isText(e.name))) p.push(who + 'it does not say which name to add or remove.');
  if (e.type === 'vehicles' && (!['add', 'remove'].includes(e.action) || !isText(e.name))) p.push(who + 'it does not say which vehicle to add or remove.');
  return p;
}

/* ---- the fold: from all the diaries to timers ---------------------------------------------------------------------------------
   timersFrom(events, lists, now) gives { timers, problems }. A timer:
     id, device, by, job, jobTyped, op, opKind, out, mode, machine, work, note, remake,
     workers [ { name, minutes, paused, pausedAt } ]   who is on it, each with their own time on it (a trip's timer has its one person here too),
     person, trip, driver, vehicle, odoOut, odoBack     on a trip out only (person is null on a shop timer),
     start, startHow, stop (null while running), stopHow (tap | typed | check), checkAt (the check that stopped it),
     minutes     the task's time: from start to stop, less the time the whole task was paused
     combined    each worker's own time on it, added up (a worker's own pauses and the task's pauses left out)
     paused, pausedAt   the whole task is paused now, and since when (running stays true: a paused timer is still open)
     checkin, confirmed, unconfirmed   the last check-in, the task's minutes up to it, and the minutes after it that nobody confirmed
     cnc { now, since, cutting, loading, sheets, stretches [ { what, start, stop, minutes } ], lastSwitch }   on a CNC timer only
     running, toCheck, why, cancelled
   The three figures of a task (owner, 21 Nov 2026) are minutes, workers.length and combined: two workers together for 8 h are 8 h, 2 and 16 h; Sam for the whole
   of a 1 h task with Pat paused after 40 min are 1 h, 2 and 1 h 40 min.
   why is the list of reasons it is to check, each { why: check | reading | late | long, text } in plain words: stopped by an end-of-day check with no answer; a
   trip in a company vehicle, finished, with a reading missing (on the driver's timer; Own vehicle's readings may be left empty); time typed in more than 7 days
   after its start; a tapped timer that ran longer than the long-timer limit. toCheck is true while there is a reason and he has not said the timer is right
   (checked). A cancelled timer has none.
   The rules, the same in every reader:
   - the first stop written counts; a later one changes nothing (two devices may both stop it);
   - corrections are applied in the order they were written, the later winning for each thing it changes; a corrected start or stop is marked typed;
   - Pause and Resume: for the whole task (nothing is counted while it is paused) or for one worker (that worker's own time stops; the task's time never changes);
     a pause with no resume simply stays paused to the end;
   - the end-of-day check: a running shop timer is asked "still going?" at the check time of the device that started it, while that device's check is on, and
     every timer at every midnight (always: so a late timer cannot run all night). The first check with no answer stops it, at that check's time, or at the moment
     it was paused when the task is paused then; it is marked to check until he confirms it (checked) or corrects the stop. "Still going", or a check-in at or
     after the check, is the answer. The check is worked out, not written, so every reader comes to the same stop;
   - the long-timer limit never stops a timer: it only marks one that was tapped and ran longer, once it has stopped. */
/* the stretches that are paused, from the pause and resume events of the whole task (who: null) or of one worker: [ [from, to] ... ], to being Infinity while
   still paused. A pause while paused, or a resume while not, changes nothing. */
function pausedSpans(list, who) {
  const out = []; let open = null;
  for (const e of list) {
    if (who === null ? e.worker != null : (e.worker == null || !same(e.worker, who))) continue;
    const t = ms(e.at);
    if (e.type === 'pause' && open === null) open = t;
    else if (e.type === 'resume' && open !== null) { if (t > open) out.push([open, t]); open = null; }
  }
  if (open !== null) out.push([open, Infinity]);
  return out;
}
/* how many ms of [a, b] the stretches cover, each ms counted once however many stretches lie over it */
function covered(spans, a, b) {
  const cut = spans.map(([x, y]) => [Math.max(x, a), Math.min(y, b)]).filter(([x, y]) => y > x).sort((p, q) => p[0] - q[0]);
  let sum = 0, end = -Infinity;
  for (const [x, y] of cut) { if (y <= end) continue; sum += y - Math.max(x, end); end = y; }
  return sum;
}
/* the stretches of [a, b] that the spans leave uncovered, in order: [ [from, to] ... ] */
function uncovered(spans, a, b) {
  const cut = spans.map(([x, y]) => [Math.max(x, a), Math.min(y, b)]).filter(([x, y]) => y > x).sort((p, q) => p[0] - q[0]), out = [];
  let pos = a;
  for (const [x, y] of cut) { if (x > pos) out.push([pos, x]); pos = Math.max(pos, y); }
  if (b > pos) out.push([pos, b]);
  return out;
}
/* a device's end-of-day check at an instant: the last setting it wrote at or before then, or the one every device starts with */
function eodAt(list, t) {
  let s = END_OF_DAY;
  for (const x of list || []) { if (x.t <= t) s = x; else break; }
  return s;
}
/* the instants a timer is asked "still going?": on each shop day the check time of the device that started it (a shop timer only, and only if at that instant
   the device's check is on and set to that time), and every midnight. A trip out is asked at midnight only, as before (its own check time was never set). */
function checkInstants(T, L, eod, upTo) {
  const zone = L.settings.zone, start = ms(T.start), out = [];
  const clocks = T.out ? [] : [...new Set([END_OF_DAY.at].concat((eod || []).map((x) => x.at)))];
  for (let day = localDay(start, zone), n = 0; atLocal(day, '00:00', zone) <= upTo && n < 400; day = nextDay(day), n++) {
    for (const c of clocks) { const t = atLocal(day, c, zone), s = eodAt(eod, t); if (s.on && s.at === c && t > start && t <= upTo) out.push(t); }
    const midnight = atLocal(nextDay(day), '00:00', zone);
    if (midnight > start && midnight <= upTo) out.push(midnight);
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
  const at = nowMs(now), zone = L.settings.zone, problems = [], starts = new Map(), rest = new Map(), going = new Map(), eod = new Map(), more = new Map();
  const side = (id) => { if (!more.has(id)) more.set(id, { pauses: [], switches: [], undone: new Set(), checkins: [], labels: [] }); return more.get(id); };
  for (const e of inOrder(events)) {
    const bad = eventProblems(e);
    if (bad.length) { problems.push(...bad.map((text) => ({ timer: e && e.timer || e && e.id || null, text }))); continue; }
    if (e.type === 'names' || e.type === 'vehicles') continue;
    if (e.type === 'eod') { const d = deviceOf(e.id); if (!eod.has(d)) eod.set(d, []); eod.get(d).push({ t: ms(e.made), on: e.on, at: e.at }); continue; }
    if (e.type === 'start') {
      if (starts.has(e.id)) problems.push({ timer: e.id, text: 'The timer ' + e.id + ' was started twice.' });
      else starts.set(e.id, e);
      continue;
    }
    if (e.type === 'going') { if (!going.has(e.timer)) going.set(e.timer, new Set()); going.get(e.timer).add(ms(e.check)); continue; }
    if (e.type === 'pause' || e.type === 'resume') { side(e.timer).pauses.push(e); continue; }
    if (e.type === 'switch') { side(e.timer).switches.push(e); continue; }
    if (e.type === 'unswitch') { side(e.timer).undone.add(e.undo); continue; }
    if (e.type === 'labels') { side(e.timer).labels.push(e); continue; }
    if (e.type === 'checkin') { side(e.timer).checkins.push(ms(e.at)); continue; }
    if (!rest.has(e.timer)) rest.set(e.timer, []);
    rest.get(e.timer).push(e);
  }
  for (const id of new Set([...rest.keys(), ...more.keys()])) if (!starts.has(id)) problems.push({ timer: id, text: 'There is a stop or a correction for the timer ' + id + ', which was never started.' });
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
    const T = { id, device: deviceOf(id), by: s.by, job: s.job, jobTyped: !!s.jobTyped, op: s.op, opKind: s.opKind, out: s.out, mode: s.mode || null,
      machine: s.machine || null, work: s.work || null, workers: [], person: s.trip ? s.person : null,
      vehicle: s.vehicle || null, odoOut: isNum(s.odoOut) ? s.odoOut : null, odoBack: null, note: s.note || '', remake: !!s.remake,
      trip: s.trip || null, driver: !!s.driver,
      start: s.at, startHow: s.how, stop: null, stopHow: null, checkAt: null, minutes: null, combined: null, running: false, paused: false, pausedAt: null,
      checkin: null, confirmed: 0, unconfirmed: 0, cnc: null, labels: null, toCheck: false, why: [], cancelled: false };
    let tapped = null, edited = null, checked = false, fixedSheets = null, names = s.trip ? [s.person] : s.workers.slice();
    const own = rest.get(id) || [], mine = shared.has(id) ? inOrder(own.concat(shared.get(id))) : own;
    for (const e of mine) {
      if (e.type === 'stop') { if (!tapped) { tapped = e; if (isNum(e.odoBack)) T.odoBack = e.odoBack; } continue; }
      for (const [k, v] of Object.entries(e.set)) {
        if (k === 'start') { T.start = v; T.startHow = 'typed'; }
        else if (k === 'stop') edited = v;
        else if (k === 'checked') checked = !!v;
        else if (k === 'cancelled') T.cancelled = !!v;
        else if (k === 'sheetLabels') fixedSheets = v.slice();
        else if (k === 'remake' || k === 'jobTyped') T[k] = !!v;
        else if (k === 'workers') { if (!T.trip) names = v.slice(); }
        else if (k === 'person') { if (T.trip) { T.person = v; names = [v]; } }
        else T[k] = v;
      }
    }
    const M = more.get(id) || { pauses: [], switches: [], undone: new Set(), checkins: [], labels: [] }, st = ms(T.start);
    const pauses = M.pauses.slice().sort((a, b) => ms(a.at) - ms(b.at)), taskPaused = pausedSpans(pauses, null);
    if (edited) { T.stop = edited; T.stopHow = 'typed'; }
    else {
      const limit = tapped ? Math.min(ms(tapped.at), at) : at, said = going.get(id) || new Set();
      /* answered: "still going" for that check, or a check-in at or after it (someone said the work was still going) */
      const answered = (t) => said.has(t) || M.checkins.some((c) => c >= t && c <= limit);
      const check = checkInstants(T, L, eod.get(T.device), tapped ? limit - 1 : limit).find((t) => !answered(t));
      if (check != null) {
        const p = taskPaused.find(([x, y]) => x <= check && check < y);       /* paused when the check stops it: it closes at the moment it was paused */
        T.stop = iso(p ? Math.max(p[0], st) : check); T.stopHow = 'check'; T.checkAt = iso(check);
      }
      else if (tapped) { T.stop = tapped.at; T.stopHow = tapped.how; }
      else T.running = true;
    }
    const end = T.stop ? ms(T.stop) : at;
    const clip = (spans) => spans.map(([x, y]) => [Math.max(x, st), Math.min(y, end)]).filter(([x, y]) => y > x);
    const taskSpans = clip(taskPaused), count = (a, b, spans) => Math.max(0, (b - a) - covered(spans, a, b)) / 60000;
    const openNow = (spans) => { const o = spans.find(([, y]) => y === Infinity); return T.running && o && o[0] <= end ? o[0] : null; };
    T.minutes = (end - st - covered(taskSpans, st, end)) / 60000;
    const tp = openNow(taskPaused); T.paused = tp !== null; T.pausedAt = tp !== null ? iso(tp) : null;
    T.workers = names.map((name) => {
      const mineOnly = pausedSpans(pauses, name), wp = openNow(mineOnly);
      /* spans: the stretches this worker's time is made of (the task's pauses and their own left out), so one person's timers that ran together can be
         counted once (workerTime) */
      return { name, minutes: count(st, end, taskSpans.concat(clip(mineOnly))), paused: wp !== null, pausedAt: wp !== null ? iso(wp) : null,
        spans: uncovered(taskSpans.concat(clip(mineOnly)), st, end).map(([x, y]) => [iso(x), iso(y)]) };
    });
    T.combined = T.workers.reduce((a, w) => a + w.minutes, 0);
    const cis = M.checkins.filter((t) => t > st && t <= end);
    if (cis.length) { const ci = Math.max(...cis); T.checkin = iso(ci); T.confirmed = count(st, ci, taskSpans); }
    T.unconfirmed = Math.max(0, T.minutes - T.confirmed);
    if (T.mode === 'cnc') {
      /* the CNC's stretches: it starts loading (the program and the first sheet), and each switch that is not undone ends one stretch and begins the other */
      const sw = M.switches.filter((e) => !M.undone.has(e.id) && ms(e.at) >= st && (T.stop ? ms(e.at) < end : ms(e.at) <= end)).sort((a, b) => ms(a.at) - ms(b.at));
      let cur = 'loading', from = st, last = null; const stretches = [];
      for (const e of sw) {
        if (e.to === cur) continue;
        stretches.push({ what: cur, start: iso(from), stop: e.at, minutes: count(from, ms(e.at), taskSpans) });
        cur = e.to; from = ms(e.at); last = e.id;
      }
      stretches.push({ what: cur, start: iso(from), stop: T.stop, minutes: count(from, end, taskSpans) });
      const sum = (w) => stretches.reduce((a, x) => a + (x.what === w ? x.minutes : 0), 0);
      T.cnc = { now: cur, since: iso(from), cutting: sum('cutting'), loading: sum('loading'), sheets: stretches.filter((x) => x.what === 'cutting').length, stretches, lastSwitch: last };
      /* Labels on the CNC: the start's answer, then each change made while it was loading and unloading (a change that lies in a stretch that is not, once undone switches
         are left out, counts for nothing). A sheet is labelled by the answer standing when the loading and unloading after its cutting ends. A sheet cut and never unloaded
         (the timer stopped while cutting) is not labelled. The sheet being cut now, on a running timer, is not counted yet. A correction (sheetLabels) replaces them. */
      const asked = typeof s.labels === 'boolean', evs = M.labels.slice().sort((a, b) => ms(a.at) - ms(b.at)).filter((e) => {
        const x = stretches.find((y) => ms(y.start) <= ms(e.at) && (y.stop === null || ms(e.at) < ms(y.stop)));
        return x && x.what === 'loading';
      });
      const stateAt = (t) => { let v = asked ? s.labels : null; for (const e of evs) { if (ms(e.at) <= t) v = e.on; else break; } return v; };
      let sheets = [];
      stretches.forEach((x, i) => {
        if (x.what !== 'cutting') return;
        const after = stretches[i + 1];
        if (!after) { if (!T.running) sheets.push(asked ? false : null); return; }
        sheets.push(stateAt(after.stop === null ? end : ms(after.stop)));
      });
      let fixed = false;
      if (fixedSheets && fixedSheets.length === sheets.length) { sheets = fixedSheets; fixed = true; }
      T.labels = { kind: 'sheets', asked, now: stateAt(end), sheets: sheets.map((on, i) => ({ n: i + 1, on })), fixed, labelled: sheets.filter((x) => x === true).length, of: sheets.length };
    } else if (labelsWay(L, T.op) === 'timer') T.labels = { kind: 'timer', asked: typeof s.labels === 'boolean', on: typeof s.labels === 'boolean' ? s.labels : null };
    /* why it is to check: each reason in plain words. All of them stay until he says the timer is right (checked) or corrects what is missing. */
    if (!T.cancelled) {
      if (T.stopHow === 'check') {
        const c = localClock(T.checkAt, zone) === '00:00' ? 'midnight' : showClock(T.checkAt, zone);
        T.why.push({ why: 'check', text: 'Stopped by the ' + c + ' check: nobody answered "still going?"' + (T.stop !== T.checkAt ? ' It was paused at ' + showClock(T.stop, zone) + ', so it closes there.' : '') });
      }
      if (T.driver && T.vehicle && !isOwn(T) && !T.running && (T.odoOut === null || T.odoBack === null)) {
        const which = T.odoOut === null && T.odoBack === null ? 'No odometer readings' : T.odoOut === null ? 'No odometer leaving' : 'No odometer back';
        T.why.push({ why: 'reading', text: which + ': the kilometres cannot be counted.' });
      }
      const days = (ms(s.made) - ms(T.start)) / 86400000;
      if (s.how === 'typed' && days > LATE_DAYS) T.why.push({ why: 'late', text: 'Typed in ' + Math.floor(days) + ' days after it started.' });
      /* the long-timer check (owner, 20 Nov 2026): a timer that was tapped and ran longer than the limit of the day it stopped. Paused time is not counted. A
         stop he has corrected is his own figure, so it is no longer asked about. */
      if (T.startHow === 'tap' && (T.stopHow === 'tap' || T.stopHow === 'check')) {
        const hours = longOn(L, localDay(T.stop, zone));
        if (T.minutes > hours * 60) T.why.push({ why: 'long', text: 'Ran ' + showMinutes(T.minutes) + ': longer than the ' + hoursWords(hours) + ' set.' });
      }
      T.toCheck = T.why.length > 0 && !checked;
    }
    if (T.stop && ms(T.stop) < ms(T.start)) problems.push({ timer: id, text: 'The timer ' + id + ' stops before it starts.' });
    if (T.odoOut !== null && T.odoBack !== null && T.odoBack < T.odoOut) problems.push({ timer: id, text: 'The odometer of ' + id + ' is lower back than out (' + T.odoOut + ' to ' + T.odoBack + ' km).' });
    if ((T.odoOut !== null || T.odoBack !== null) && !T.vehicle) problems.push({ timer: id, text: 'The timer ' + id + ' has odometer readings and no vehicle.' });
    timers.push(T);
  }
  timers.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id < b.id ? -1 : 1));
  problems.push(...vehicleTwice(timers, at));
  problems.push(...odometerOrder(timers));
  return { timers, problems };
}
/* timers ignore each other (owner, 20 Nov 2026): a person or a machine in two timers at once is no longer named. The same vehicle on two trips at once still is:
   it cannot be in two places, and its kilometres would be counted twice. */
function vehicleTwice(timers, at) {
  const p = [], live = timers.filter((t) => !t.cancelled && t.vehicle), end = (t) => (t.stop ? ms(t.stop) : at);
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j];
    if (!(ms(a.start) < end(b) && ms(b.start) < end(a)) || vehicleKey(a) !== vehicleKey(b)) continue;
    p.push({ timer: b.id, text: (isOwn(a) ? a.person + '\'s own vehicle' : 'The ' + a.vehicle) + ' is on two trips at once (' + a.id + ' and ' + b.id + ').' });
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
/* a device's end-of-day check now: its switch and its time (owner, 21 Nov 2026: they belong to the phone) */
function endOfDayOf(events, device, now) {
  const at = nowMs(now); let s = END_OF_DAY;
  for (const e of inOrder(events)) if (e && e.type === 'eod' && deviceOf(e.id) === device && typeof e.on === 'boolean' && isClock(e.at) && ms(e.made) <= at) s = { on: e.on, at: e.at };
  return { on: s.on, at: s.at };
}
/* who is on a timer, as words: "Pat, Sam" */
const whoOf = (t) => (t.workers || []).map((w) => w.name).join(', ');

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
/* the job checked against the lists (or typed), and copied in */
function pickJob(L, f) {
  if (f.job === null || f.job === undefined) return { job: null, jobTyped: false };
  if (f.jobTyped) { if (!isText(f.job)) refuse('Type the job\'s name, or pick it from the list.'); return { job: f.job.trim(), jobTyped: true }; }
  const j = L.jobs.find((x) => same(x, f.job));
  if (!j) refuse('"' + f.job + '" is not in the list of jobs. Pick it from the list, or type it.');
  return { job: j, jobTyped: false };
}
/* one person checked against the names (with no names at all, him alone, it is whoever is signed in) */
function pickPerson(L, p, by) {
  if (!L.names.length) return isText(p) ? p.trim() : by.trim();
  const n = L.names.find((x) => same(x, p));
  if (!n) refuse(isText(p) ? '"' + p + '" is not in the list of names.' : 'Pick who is doing it.');
  return n;
}
/* who is working on a task: one or more names, each once */
function pickWorkers(L, asked, by) {
  const list = Array.isArray(asked) ? asked.filter((x) => x != null && x !== '') : [];
  if (!list.length && L.names.length) refuse('Pick who is working: one or more names.');
  const out = [];
  for (const p of list.length ? list : [by]) {
    const n = pickPerson(L, p, by);
    if (out.some((x) => same(x, n))) refuse('"' + n + '" is picked twice.');
    out.push(n);
  }
  return out;
}
/* maintenance: which machine, and which kind of work */
function pickMachine(L, name) {
  const m = (L.machines || []).find((x) => same(x, name));
  if (!m) refuse(isText(name) ? '"' + name + '" is not in the list of machines.' : 'Pick which machine the maintenance is for.');
  return m;
}
function pickWork(work) {
  const w = MAINTENANCE_KINDS.find((x) => same(x, work));
  if (!w) refuse('Pick the kind of work: ' + MAINTENANCE_KINDS.join(', ') + '.');
  return w;
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
const jobSame = (a, b) => (a === null || b === null ? a === b : same(a, b));
/* start a timer in the shop: one task, with its workers (owner, 21 Nov 2026: one or more names, on person and machine operations alike). Tapped now, or typed
   (at: the instant it began, not in the future). An operation out of the shop is started as a trip (startTrip). Maintenance needs its machine and kind of work.
   A second timer on the same operation and job (owner, 20 Nov 2026): a tapped start is refused while one is running there, and the refusal carries .same, the
   timers already running, so the screen can ask. Asked again with second: 'second' (a second timer at the same time), 'stop' (stop the first) or 'cancel' (the
   first was started by mistake), it is done as one action: any stops or cancellations first, the start last. Other timers are never looked at: timers ignore
   each other. Gives back the start, or with 'stop' or 'cancel' an array. */
function startTimer(events, device, by, L, f, now) {
  f = f || {};
  if (!isText(by)) refuse('Sign in first: every record names who made it.');
  const lists = withLists(events, L), op = findOp(lists, f.op);
  if (!op) refuse(isText(f.op) ? '"' + f.op + '" is not in the list of operations.' : 'Pick what is being timed.');
  if (op.out) refuse('"' + op.name + '" is out of the shop: start it as a trip (who is going, who drives, which vehicle).');
  if (f.vehicle) refuse('A vehicle goes only on a trip out of the shop.');
  const job = pickJob(lists, f), workers = pickWorkers(lists, f.workers, by), typedAt = startAt(f, now);
  const extra = op.mode === 'maintenance' ? { machine: pickMachine(L, f.machine), work: pickWork(f.work) } : { machine: null, work: null };
  /* Labels: asked by the CNC and by Beam saw cutting, and Start waits for the answer; no other operation takes one */
  const way = labelsWay(lists, op.name);
  if (way && typeof f.labels !== 'boolean') refuse(way === 'sheets' ? 'Say whether labels are put on while unloading: On or Off.' : 'Say whether labels are put on the parts: On or Off.');
  if (!way && f.labels != null) refuse('Only the CNC and Beam saw cutting ask about labels.');
  const before = [];
  if (!typedAt) {
    const here = timersFrom(events, L, now).timers.filter((t) => t.running && !t.cancelled && !t.trip && same(t.op, op.name) && jobSame(t.job, job.job) && (op.mode !== 'maintenance' || same(t.machine, extra.machine)));
    if (here.length && !f.second) {
      const err = new Error(op.name + ' is already running here' + (here.length > 1 ? ' (' + here.length + ' timers)' : '') + '. Start a second timer, stop the first, or cancel the first?');
      err.same = here.map((t) => t.id);
      throw err;
    }
    if (f.second && !['second', 'stop', 'cancel'].includes(f.second)) refuse('Say what to do with the timer already running: a second timer, stop the first, or cancel the first.');
    for (const t of here) {
      if (f.second === 'stop') before.push(stopTimer(events.concat(before), device, by, L, t.id, {}, now));
      if (f.second === 'cancel') before.push(editTimer(events.concat(before), device, by, L, t.id, { cancelled: true }, now));
    }
  }
  const e = base(events.concat(before), device, by, 'start', now);
  const s = Object.assign(e, { at: typedAt || e.made, how: typedAt ? 'typed' : 'tap' }, job, { op: op.name, opKind: op.kind, out: false, mode: op.mode || null, workers },
    extra, way ? { labels: f.labels } : {}, { note: isText(f.note) ? f.note.trim() : '', remake: !!f.remake });
  return before.length ? before.concat([s]) : s;
}
/* a trip keeps what it did before (owner, 20 Nov 2026): starting someone who is on another timer asks first. Without stopOther it refuses, naming where each one
   is, and the refusal carries .busy. With it, the way is made as one action: a trip timer of theirs, or a shop timer they are alone on, is stopped; on a shop
   timer they share, that worker is paused, and the task runs on for the others. Time typed in afterwards touches nothing. */
function makeWay(events, device, by, L, people, f, now) {
  if (f.at != null) return [];
  const busy = [];
  for (const t of timersFrom(events, L, now).timers) {
    if (!t.running || t.cancelled) continue;
    for (const p of people) { const w = t.workers.find((x) => same(x.name, p)); if (w && !w.paused) busy.push({ t, p: w.name, shared: !t.trip && t.workers.length > 1 }); }
  }
  if (!busy.length) return [];
  if (!f.stopOther) {
    const where = busy.map((b) => '"' + b.p + '" is on ' + b.t.op + ', ' + (b.t.job === null ? SHOP_NO_JOB : b.t.job) +
      (b.shared ? ', with ' + b.t.workers.filter((w) => !same(w.name, b.p)).map((w) => w.name).join(' and ') : '') + '.').join(' ');
    const ask = busy.some((b) => b.shared) ? (busy.length > 1 ? ' Stop or pause them there and start this one?' : ' Pause ' + busy[0].p + ' on it and start this one?')
      : (busy.length > 1 ? ' Stop those timers and start this one?' : ' Stop that timer and start this one?');
    const err = new Error(where + ask);
    err.busy = busy.map((b) => b.t.id);
    throw err;
  }
  const evs = [], done = new Set();
  for (const b of busy) {
    if (b.shared) evs.push(pauseTimer(events.concat(evs), device, by, L, b.t.id, b.p, now));
    else if (!done.has(b.t.id)) { done.add(b.t.id); evs.push(stopTimer(events.concat(evs), device, by, L, b.t.id, {}, now)); }
  }
  return evs;
}
/* start a trip out: people (everyone in the vehicle), driver (one of them), vehicle (a company vehicle or Own vehicle), odoOut (may be left empty), note (what
   the trip is for), job, op (one marked out), at (typed) and stopOther. One start per person, the driver's first; the trip's mark is the id of the driver's
   start. The vehicle and the reading go on the driver's start only. Gives back an array: any stops or pauses first, then the starts. */
function startTrip(events, device, by, L, f, now) {
  f = f || {};
  if (!isText(by)) refuse('Sign in first: every record names who made it.');
  const lists = withLists(events, L), op = findOp(lists, f.op);
  if (!op) refuse(isText(f.op) ? '"' + f.op + '" is not in the list of operations.' : 'Pick what the trip is for.');
  if (!op.out) refuse('A trip is for an operation out of the shop.');
  if (f.remake) refuse('There is no Remake on a trip.');
  const asked = Array.isArray(f.people) && f.people.length ? f.people : (lists.names.length ? [] : [by]);
  if (!asked.length) refuse('Pick who is going.');
  const job = pickJob(lists, f), people = [];
  for (const p of asked) {
    const n = pickPerson(lists, p, by);
    if (people.some((x) => same(x, n))) refuse('"' + n + '" is picked twice.');
    people.push(n);
  }
  const drive = isText(f.driver) ? f.driver : people.length === 1 ? people[0] : null;
  const driver = drive && people.find((x) => same(x, drive));
  if (!driver) refuse('Pick who is driving: one of the people going.');
  if (!isText(f.vehicle)) refuse('Pick the vehicle: a company vehicle, or Own vehicle.');
  const vehicle = pickVehicle(lists, f.vehicle), odoOut = odo(f.odoOut, 'out'), typedAt = startAt(f, now);
  const way = makeWay(events, device, by, L, people, f, now);
  const order = [driver].concat(people.filter((x) => x !== driver)), starts = [];
  for (const person of order) {
    const e = base(events.concat(way, starts), device, by, 'start', now), isDriver = person === driver;
    starts.push(Object.assign(e, { at: typedAt || e.made, how: typedAt ? 'typed' : 'tap' }, job, { op: op.name, opKind: op.kind, out: true, mode: null, person,
      vehicle: isDriver ? vehicle : null, odoOut: isDriver ? odoOut : null, note: isText(f.note) ? f.note.trim() : '', remake: false,
      trip: starts.length ? starts[0].id : e.id, driver: isDriver }));
  }
  return way.concat(starts);
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
/* Pause and Resume (owner, 20 Nov 2026: "a must"): for the whole task (worker: null), or for one worker named on it. Paused time is not counted. A worker's
   pause never changes the task's time, and a worker who does not come back simply stays recorded as paused. A paused timer is still open: Stop ends it. */
function openTimer(events, L, timer, now) {
  const T = findTimer(events, L, timer, now);
  if (!T) refuse('There is no timer ' + timer + '.');
  if (!T.running) refuse('That timer is already stopped.');
  return T;
}
function pauseOrResume(type, events, device, by, L, timer, worker, now) {
  const T = openTimer(events, L, timer, now), pausing = type === 'pause';
  let name = null;
  if (worker == null) {
    if (pausing && T.paused) refuse('The task is already paused.');
    if (!pausing && !T.paused) refuse('The task is not paused.');
  } else {
    if (T.trip) refuse('On a trip each person has a timer of their own: pause that timer.');
    const w = T.workers.find((x) => same(x.name, worker));
    if (!w) refuse('"' + worker + '" is not on that timer.');
    if (pausing && w.paused) refuse('"' + w.name + '" is already paused.');
    if (!pausing && !w.paused) refuse('"' + w.name + '" is not paused.');
    name = w.name;
  }
  const e = base(events, device, by, type, now);
  return Object.assign(e, { timer, at: e.made, worker: name });
}
const pauseTimer = (events, device, by, L, timer, worker, now) => pauseOrResume('pause', events, device, by, L, timer, worker, now);
const resumeTimer = (events, device, by, L, timer, worker, now) => pauseOrResume('resume', events, device, by, L, timer, worker, now);
/* the CNC (owner, 21 Nov 2026): one timer, and two buttons that say what the machine is doing. A tap on one ends the other's stretch; each stretch is saved
   on its own (the switch is the record of where one ends). */
function switchCnc(events, device, by, L, timer, to, now) {
  const T = openTimer(events, L, timer, now);
  if (T.mode !== 'cnc') refuse('Only the CNC has Cutting and Loading and unloading.');
  if (!CNC_PARTS.includes(to)) refuse('The CNC is either cutting, or loading and unloading.');
  if (T.paused) refuse('The task is paused: resume it first.');
  if (T.cnc.now === to) refuse('The CNC is already ' + (to === 'cutting' ? 'cutting' : 'loading and unloading') + '.');
  const e = base(events, device, by, 'switch', now);
  return Object.assign(e, { timer, at: e.made, to });
}
/* "Undo the last switch": the last switch is taken back, as if it had not been tapped; the stretch before it runs on */
function undoSwitch(events, device, by, L, timer, now) {
  const T = openTimer(events, L, timer, now);
  if (T.mode !== 'cnc') refuse('Only the CNC has switches to undo.');
  if (!T.cnc.lastSwitch) refuse('There is no switch to undo.');
  return Object.assign(base(events, device, by, 'unswitch', now), { timer, undo: T.cnc.lastSwitch });
}
/* the CNC's Labels switch (owner, 21 Nov 2026): turned only while Loading and unloading is the part running and the task is not paused. It is an event of its own, so
   "Undo the last switch" never touches it; a change that comes to lie outside a loading and unloading stretch (its switch undone) simply counts for nothing. Beam saw cutting
   has no switch: its answer is the one it started with. */
function setLabels(events, device, by, L, timer, on, now) {
  const T = openTimer(events, L, timer, now);
  if (typeof on !== 'boolean') refuse('Say On or Off.');
  if (!T.labels) refuse('This timer has no Labels.');
  if (T.labels.kind === 'timer') refuse('Labels on the beam saw is set when the timer starts and cannot be changed: stop the timer and start a new one.');
  if (T.paused) refuse('The task is paused: resume it first.');
  if (T.cnc.now !== 'loading') refuse('Labels can be changed only while the CNC is loading and unloading.');
  if (T.labels.now === on) refuse('Labels are already ' + (on ? 'on' : 'off') + '.');
  const e = base(events, device, by, 'labels', now);
  return Object.assign(e, { timer, at: e.made, on });
}
/* a check-in (owner, 21 Nov 2026): someone confirms the work is still going. at may be earlier than now: a Check in tapped on a notification while the page was
   closed is written down when the page next opens. A check-in at or after an end-of-day check answers it, as "still going" does. */
function checkIn(events, device, by, L, timer, f, now) {
  const T = findTimer(events, L, timer, now);
  if (!T) refuse('There is no timer ' + timer + '.');
  f = f || {};
  const e = base(events, device, by, 'checkin', now);
  let at = e.made;
  if (f.at != null) { if (!isInstant(f.at)) refuse('The check-in time is not readable.'); if (ms(f.at) > nowMs(now)) refuse('A check-in cannot be in the future.'); at = f.at; }
  if (ms(at) < ms(T.start)) refuse('That timer had not started yet.');
  if (!T.running && !(T.stopHow === 'check' && ms(at) >= ms(T.checkAt))) refuse('That timer is already stopped.');
  return Object.assign(e, { timer, at });
}
/* "Stop at the last check-in": a correction of the stop to that moment, the last time anyone confirmed the work was going */
function stopAtCheckin(events, device, by, L, timer, now) {
  const T = findTimer(events, L, timer, now);
  if (!T) refuse('There is no timer ' + timer + '.');
  if (!T.checkin) refuse('That timer has no check-in to stop at.');
  return editTimer(events, device, by, L, timer, { stop: T.checkin }, now);
}
/* the end-of-day check of this phone or tablet (owner, 21 Nov 2026): change is { on } (the switch) and/or { at: "HH:MM" } (the time, kept while it is off).
   It counts from the moment it is written, for every timer this device started: one that is running now is asked, or not, by the new setting. */
function setEndOfDay(events, device, by, change, now) {
  if (!isObj(change) || !('on' in change || 'at' in change)) refuse('Nothing to change.');
  if ('at' in change && !isClock(change.at)) refuse('Write the time as HH:MM, for example 16:00.');
  const cur = endOfDayOf(events, device, now), next = { on: 'on' in change ? !!change.on : cur.on, at: 'at' in change ? change.at : cur.at };
  if (next.on === cur.on && next.at === cur.at) refuse('The end-of-day check is already ' + (cur.on ? 'on' : 'off') + ' at that time.');
  return Object.assign(base(events, device, by, 'eod', now), next);
}
/* a device's setting written again, unchanged, when its last note of it is more than a few days old: the phones read only the last days of each other's diaries,
   so this keeps the setting in front of every reader. Gives back the event, or null when there is nothing to write. */
function eodRefresh(events, device, by, now) {
  const at = nowMs(now); let last = null;
  for (const e of inOrder(events)) if (e && e.type === 'eod' && deviceOf(e.id) === device && ms(e.made) <= at) last = e;
  if (!last || at - ms(last.made) <= EOD_KEEP_DAYS * 86400000) return null;
  return Object.assign(base(events, device, by, 'eod', now), { on: last.on, at: last.at });
}
/* time typed in afterwards, start and stop together: two events, both marked typed. The stop is given (until), or worked out from a length in minutes (owner,
   19 Nov 2026, screen 6b: a start and How long give the stop). It asks nothing about other timers. A trip typed in afterwards is startTrip and stopTrip, each
   with its at. */
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
  const s = startTimer(events, device, by, L, f, now);
  const e = base(events.concat([s]), device, by, 'stop', now);
  return [s, Object.assign(e, { timer: s.id, at: until, how: 'typed', odoBack: null })];
}
/* a correction: any of the things a timer holds, each checked against the lists and copied in. On a shop timer the workers are corrected together (workers: the
   names, each counted from the start); on a trip each person's own timer names its person. On a trip the job, the operation and the note are corrected for the
   whole trip (one event; every reader applies it to each timer of the trip), and the vehicle and readings on the driver's timer only. A timer is never moved
   between the shop and out, nor into or out of the CNC's or Maintenance's own way of timing: it is marked Started by mistake and started again. */
function editTimer(events, device, by, L, timer, set, now) {
  const T = findTimer(events, L, timer, now);
  if (!T) refuse('There is no timer ' + timer + '.');
  if (!isObj(set) || !Object.keys(set).length) refuse('Nothing to change.');
  const out = {}, lists = withLists(events, L);
  if ('labels' in set) refuse(T.labels && T.labels.kind === 'sheets' ? 'The Labels switch is turned on the running timer, while it is loading and unloading; afterwards it is corrected sheet by sheet.'
    : 'Labels is set when the timer starts and cannot be changed: stop the timer and start a new one.');
  for (const k of Object.keys(set)) if (!EDITABLE.includes(k)) refuse('"' + k + '" cannot be changed.');
  if (T.trip && set.remake) refuse('There is no Remake on a trip.');
  if (T.trip && !T.driver && ('vehicle' in set || 'odoOut' in set || 'odoBack' in set)) refuse('The vehicle and its readings are on the driver\'s timer (' + T.trip + ').');
  if (T.trip && 'vehicle' in set && !isText(set.vehicle)) refuse('A trip needs its vehicle.');
  if (T.trip && 'workers' in set) refuse('On a trip each person has a timer of their own: change who it is on that timer.');
  if (!T.trip && 'person' in set) refuse('A timer in the shop names its workers: change who is working.');
  if (!T.trip && 'vehicle' in set && set.vehicle) refuse('A vehicle goes only on a trip out of the shop.');
  if (T.mode !== 'maintenance' && ('machine' in set || 'work' in set)) refuse('Only a maintenance timer has a machine and a kind of work.');
  if ('op' in set) {
    const o = findOp(lists, set.op);
    if (!o) refuse(isText(set.op) ? '"' + set.op + '" is not in the list of operations.' : 'Pick what is being timed.');
    if (o.out !== T.out) refuse(T.out ? 'A trip\'s operation can only be changed to another one out of the shop.' : 'A timer in the shop cannot be made a trip out: mark it Started by mistake, and start the trip.');
    if ((o.mode || null) !== T.mode) refuse('The CNC and Maintenance are timed in their own way, so a timer cannot be changed into one or out of one: mark it Started by mistake, and start it again.');
    out.op = o.name; out.opKind = o.kind; out.out = o.out;
  }
  if ('job' in set || 'jobTyped' in set) Object.assign(out, pickJob(lists, { job: 'job' in set ? set.job : T.job, jobTyped: 'jobTyped' in set ? !!set.jobTyped : T.jobTyped }));
  if ('workers' in set) out.workers = pickWorkers(lists, set.workers, by);
  if ('person' in set) out.person = pickPerson(lists, set.person, by);
  if ('vehicle' in set) out.vehicle = isText(set.vehicle) ? pickVehicle(lists, set.vehicle) : null;
  if ('machine' in set) out.machine = pickMachine(L, set.machine);
  if ('work' in set) out.work = pickWork(set.work);
  for (const k of ['note']) if (k in set) out[k] = isText(set[k]) ? set[k].trim() : '';
  for (const k of ['remake', 'checked', 'cancelled']) if (k in set) out[k] = !!set[k];
  if ('sheetLabels' in set) {
    if (!T.labels || T.labels.kind !== 'sheets') refuse('Only the CNC has Labels sheet by sheet.');
    if (T.running) refuse('Labels are corrected sheet by sheet once the timer is stopped.');
    if (!T.labels.of) refuse('This timer has no sheet to label.');
    if (!Array.isArray(set.sheetLabels) || set.sheetLabels.length !== T.labels.of || !set.sheetLabels.every((b) => typeof b === 'boolean')) refuse('Give On or Off for each of the ' + T.labels.of + (T.labels.of === 1 ? ' sheet.' : ' sheets.'));
    out.sheetLabels = set.sheetLabels.slice();
  }
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
/* "still going": the answer to one end-of-day check (it may come late; the timer then runs on from that check, still paused if it was paused) */
function stillGoing(events, device, by, L, timer, check, now) {
  const T = findTimer(events, L, timer, now);
  if (!T) refuse('There is no timer ' + timer + '.');
  if (T.stopHow !== 'check' || T.checkAt !== check) refuse('That timer is not waiting for an answer to that check.');
  return Object.assign(base(events, device, by, 'going', now), { timer, check });
}

/* ---- what it gives back (step 1: the record; quoted against real is step 2, learned times step 3) ----------------------------
   Finished timers only, cancelled ones left out. Minutes are not rounded: only the screen rounds. A task's time on a person operation and on a machine operation
   are never added together (owner, 17 and 19 Nov 2026), so every figure that could hold both is given as { person, machine }.
   Each task has three figures (owner, 21 Nov 2026): its time, its workers, and the combined time (each worker's own time on it, added up). The combined time is
   about people, on person and machine operations alike, so it is one figure.
   Remake time is inside the figures and also given apart, so the learned times can leave it out. Timers still to check count in the hours (screen 10, owner
   19 Nov 2026), and their minutes are also given apart ("of which … to check"): the amber end of each bar. */
const jobKey = (j) => (j === null ? '\u0000' : j.toLowerCase());
const byJob = (a, b) => (a.job === null ? (b.job === null ? 0 : 1) : b.job === null ? -1 : a.job.localeCompare(b.job, 'en', { sensitivity: 'base' }));
const counted = (t) => !t.cancelled && !t.running;
/* Labels in words, the same on the phone and in SyntraQuote. A timer: "On", "Off", "not asked"; the CNC's: "on 2 of 3 sheets", "no sheet cut yet", "not asked". "" when the timer has none. */
function labelsWords(t) {
  const b = t && t.labels; if (!b) return '';
  if (b.kind === 'timer') return b.on === null ? 'not asked' : b.on ? 'On' : 'Off';
  if (!b.asked && b.sheets.every((x) => x.on === null)) return 'not asked';
  if (!b.of) return 'no sheet unloaded yet';
  return 'on ' + b.labelled + ' of ' + b.of + (b.of === 1 ? ' sheet' : ' sheets');
}
/* the same for an operation's row in a job's hours: "labels on 2 of 3 sheets", "labels on 0 of 1 timer", and the timers with no answer counted apart; "" when there is nothing to say */
function labelsRowWords(o) {
  const b = o && o.labels; if (!b) return '';
  const unit = b.kind === 'sheets' ? (b.of === 1 ? 'sheet' : 'sheets') : (b.of === 1 ? 'timer' : 'timers');
  const main = b.of || !b.notAsked ? 'labels on ' + b.on + ' of ' + b.of + ' ' + unit : '';
  const rest = b.notAsked ? b.notAsked + (b.notAsked === 1 ? ' timer' : ' timers') + ' not asked' : '';
  return [main, rest].filter(Boolean).join(' \u00b7 ');
}
const az = (a, b) => String(a).localeCompare(String(b), 'en', { sensitivity: 'base' });
/* one person's figures: their own minutes, the remake and to-check minutes inside them, and how many timers */
const personRow = (person) => ({ person, minutes: 0, remake: 0, check: 0, timers: 0 });
const byMinutes = (a, b) => b.minutes - a.minutes || az(a.person, b.person);
/* for each job (and "Shop, no job", last): person and machine (the tasks' time, apart), combined (every worker's own time, added up), remake and check as
   { person, machine }, toCheck (how many timers), trips, people (each worker's own minutes on the job, machines' operations included, most first: they add up
   to combined), and ops: for each operation its task time, timers, workers (the names, A to Z), together (the most workers on one timer), combined, people
   (each worker's own minutes on that operation, with their remake and to-check minutes and timers, most first: they add up to the operation's combined; the
   operation picked on the one view, owner 21 Nov 2026), and for the CNC its cutting, loading and sheets, for Maintenance its minutes by machine and kind of work. */
function jobTotals(timers) {
  const jobs = new Map();
  for (const t of timers) {
    if (!counted(t)) continue;
    const key = jobKey(t.job);
    if (!jobs.has(key)) jobs.set(key, { job: t.job, person: 0, machine: 0, combined: 0, remake: { person: 0, machine: 0 }, check: { person: 0, machine: 0 }, toCheck: 0, trips: 0,
      tripMarks: new Set(), people: new Map(), ops: new Map() });
    const J = jobs.get(key), k = t.opKind;
    if (t.trip && !J.tripMarks.has(t.trip)) { J.tripMarks.add(t.trip); J.trips++; }
    /* an operation is its name and its kind: one whose kind was changed in Settings keeps its old records apart, so a machine hour never joins a person hour */
    const ok = k + '|' + t.op.toLowerCase();
    if (!J.ops.has(ok)) J.ops.set(ok, { op: t.op, kind: k, mode: t.mode, person: 0, machine: 0, remake: 0, check: 0, timers: 0, workers: [], together: 0, combined: 0,
      people: new Map(), cutting: 0, loading: 0, sheets: 0, maintenance: [], labels: null });
    const O = J.ops.get(ok);
    J[k] += t.minutes; O[k] += t.minutes; O.timers++; J.combined += t.combined; O.combined += t.combined; O.together = Math.max(O.together, t.workers.length);
    if (t.remake) { J.remake[k] += t.minutes; O.remake += t.minutes; }
    if (t.toCheck) { J.toCheck++; J.check[k] += t.minutes; O.check += t.minutes; }
    if (t.cnc) { O.cutting += t.cnc.cutting; O.loading += t.cnc.loading; O.sheets += t.cnc.sheets; }
    /* Labels: on the CNC, on how many of the sheets (a timer with no answer at all is counted apart, never as a sheet without labels); on Beam saw cutting, on how many of the timers */
    if (t.labels) {
      const Lb = O.labels || (O.labels = { kind: t.labels.kind, on: 0, of: 0, notAsked: 0 });
      if (t.labels.kind === 'sheets') { if (!t.labels.asked && t.labels.sheets.every((x) => x.on === null)) Lb.notAsked++; else { Lb.on += t.labels.labelled; Lb.of += t.labels.of; } }
      else if (t.labels.asked) { Lb.of++; if (t.labels.on) Lb.on++; }
      else Lb.notAsked++;
    }
    if (t.mode === 'maintenance') {
      let m = O.maintenance.find((x) => same(x.machine, t.machine) && x.work === t.work);
      if (!m) { m = { machine: t.machine, work: t.work, minutes: 0, timers: 0 }; O.maintenance.push(m); }
      m.minutes += t.minutes; m.timers++;
    }
    /* who worked on it: every worker named, with their own time on the task */
    for (const w of t.workers) {
      if (!O.workers.some((n) => same(n, w.name))) O.workers.push(w.name);
      const pk = w.name.toLowerCase();
      for (const rows of [J.people, O.people]) {
        if (!rows.has(pk)) rows.set(pk, personRow(w.name));
        const R = rows.get(pk);
        R.minutes += w.minutes; R.timers++; if (t.remake) R.remake += w.minutes; if (t.toCheck) R.check += w.minutes;
      }
    }
  }
  return [...jobs.values()].map((J) => { delete J.tripMarks;
    return Object.assign(J, { people: [...J.people.values()].sort(byMinutes), ops: [...J.ops.values()].map((O) => Object.assign(O, { workers: O.workers.sort(az), people: [...O.people.values()].sort(byMinutes) })) }); })
    .sort(byJob);
}
/* one worker's timed time (owner, 21 Nov 2026: "a snapshot of a worker's true time", to set beside the timesheet, never in its place; the timers are still not
   employee hours, and nothing is priced from this). scope is { job } (a job's name, or null for "Shop, no job"; all its time), { month: 'YYYY-MM' } or
   { year: 'YYYY' }, a month and a year being the shop's own days (zone: the lists' settings.zone). As decided while drawing the total (his to change):
   - timed: the time that person was on at least one timer, their pauses and the task's left out, counted once where two of their timers ran together
     (timers ignore each other, so adding the tasks up could say more hours than the clock had). Called "timed", never "worked";
   - days: the shop days with a timer for that person, because a day nobody tapped adds nothing and must not read as a short day;
   - a timer still to check counts, as in the job's hours; one started by mistake, or still running, does not;
   - a timer over midnight is split there, so a month or a year takes only its own part.
   Gives back { person, scope, from, to (the period's instants, null for a job), timed, days, timers (tasks), withOthers (tasks shared with someone), jobs:
   [ { job, timed, days, timers, ops: [ { op, kind, mode, out, trip, own (their own time on it, in the period), remake and check (inside own), timers,
   together (the most workers on one of those timers; on a trip, the people on it), with (the other names, A to Z) } ] } ] }, the jobs A to Z with
   "Shop, no job" last, the operations in the order first worked. A job's timed time is counted once inside the job; the total is counted once across them all,
   so the jobs can add up to more than the total when two of that person's timers on different jobs ran together. */
function mergeSpans(spans) {
  const out = [];
  for (const [x, y] of spans.slice().sort((p, q) => p[0] - q[0])) {
    if (out.length && x <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], y);
    else out.push([x, y]);
  }
  return out;
}
const spanMinutes = (spans) => spans.reduce((a, [x, y]) => a + (y - x), 0) / 60000;
/* the shop days the spans touch: a span that ends exactly at midnight does not touch the next day */
function spanDays(spans, zone) {
  const days = new Set();
  for (const [x, y] of spans) for (let day = localDay(x, zone), n = 0; atLocal(day, '00:00', zone) < y && n < 400; day = nextDay(day), n++) days.add(day);
  return days;
}
function periodOf(scope, zone) {
  if (scope && /^\d{4}-\d{2}$/.test(scope.month || '')) {
    const [y, m] = scope.month.split('-').map(Number), next = m === 12 ? (y + 1) + '-01' : y + '-' + pad(m + 1);
    return [atLocal(scope.month + '-01', '00:00', zone), atLocal(next + '-01', '00:00', zone)];
  }
  if (scope && /^\d{4}$/.test(scope.year || '')) return [atLocal(scope.year + '-01-01', '00:00', zone), atLocal((Number(scope.year) + 1) + '-01-01', '00:00', zone)];
  if (scope && 'job' in scope && (scope.job === null || isText(scope.job))) return [-Infinity, Infinity];
  return refuse('Say which job, month (YYYY-MM) or year (YYYY).');
}
function workerTime(timers, name, scope, zone) {
  const z = zone || ZONE, [from, to] = periodOf(scope, z), onJob = 'job' in scope && !('month' in scope) && !('year' in scope);
  const trips = new Map(), jobs = new Map(), all = [];
  for (const t of timers) if (counted(t) && t.trip) { if (!trips.has(t.trip)) trips.set(t.trip, []); trips.get(t.trip).push(t.person); }
  let person = name, tasks = 0, shared = 0;
  for (const t of timers) {
    if (!counted(t) || (onJob && !jobSame(t.job, scope.job))) continue;
    const w = t.workers.find((x) => same(x.name, name));
    if (!w) continue;
    const mine = w.spans.map(([a, b]) => [Math.max(ms(a), from), Math.min(ms(b), to)]).filter(([a, b]) => b > a);
    const st = ms(t.start);
    if (!mine.length && !(st >= from && st < to)) continue;          /* nothing of it in the period; a task with no time of their own is listed where it starts */
    person = w.name;
    const key = jobKey(t.job);
    if (!jobs.has(key)) jobs.set(key, { job: t.job, spans: [], timers: 0, ops: new Map() });
    const J = jobs.get(key), ok = t.opKind + '|' + t.op.toLowerCase(), own = spanMinutes(mine);
    const names = t.trip ? trips.get(t.trip) : t.workers.map((x) => x.name), others = names.filter((n) => !same(n, w.name));
    if (!J.ops.has(ok)) J.ops.set(ok, { op: t.op, kind: t.opKind, mode: t.mode, out: !!t.out, trip: false, own: 0, remake: 0, check: 0, timers: 0, together: 0, with: [] });
    const O = J.ops.get(ok);
    O.own += own; O.timers++; O.together = Math.max(O.together, names.length); if (t.trip) O.trip = true;
    if (t.remake) O.remake += own; if (t.toCheck) O.check += own;
    for (const n of others) if (!O.with.some((x) => same(x, n))) O.with.push(n);
    J.spans.push(...mine); J.timers++; all.push(...mine); tasks++; if (others.length) shared++;
  }
  const whole = mergeSpans(all);
  return { person, scope: Object.assign({}, scope), from: isFinite(from) ? iso(from) : null, to: isFinite(to) ? iso(to) : null,
    timed: spanMinutes(whole), days: spanDays(whole, z).size, timers: tasks, withOthers: shared,
    jobs: [...jobs.values()].sort(byJob).map((J) => { const m = mergeSpans(J.spans);
      return { job: J.job, timed: spanMinutes(m), days: spanDays(m, z).size, timers: J.timers, ops: [...J.ops.values()].map((O) => Object.assign(O, { with: O.with.sort(az) })) }; }) };
}
/* maintenance by machine and kind of work (owner, 21 Nov 2026): for each machine, A to Z, the tasks' time, the combined worker time and the timers, and the
   same for each kind of work on it, in the order Repair, Regular maintenance, Changing tooling. Every job together: maintenance is mostly "Shop, no job". */
function maintenanceTotals(timers) {
  const machines = new Map();
  for (const t of timers) {
    if (!counted(t) || t.mode !== 'maintenance') continue;
    const mk = String(t.machine).toLowerCase();
    if (!machines.has(mk)) machines.set(mk, { machine: t.machine, minutes: 0, combined: 0, timers: 0, kinds: new Map() });
    const M = machines.get(mk);
    if (!M.kinds.has(t.work)) M.kinds.set(t.work, { work: t.work, minutes: 0, combined: 0, timers: 0 });
    for (const R of [M, M.kinds.get(t.work)]) { R.minutes += t.minutes; R.combined += t.combined; R.timers++; }
  }
  return [...machines.values()].map((M) => Object.assign(M, { kinds: [...M.kinds.values()].sort((a, b) => MAINTENANCE_KINDS.indexOf(a.work) - MAINTENANCE_KINDS.indexOf(b.work)) }))
    .sort((a, b) => az(a.machine, b.machine));
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
  if (o.version !== VERSION[kind]) refuse('This ' + kind + ' file is version ' + o.version + '; this program reads version ' + VERSION[kind] + '.' +
    (o.version < VERSION[kind] ? ' It was made before the timers changed on 21 Nov 2026, and is left as it is.' : ' This copy of the program is the older one: refresh it to get the new one.'));
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

return { FORMAT, VERSION, ZONE, PLACES, EVENT_TYPES, OP_KINDS, OP_MODES, CNC_PARTS, CNC_WORDS, MAINTENANCE_KINDS, STARTER_MACHINES, LONG_HOURS, END_OF_DAY, EOD_KEEP_DAYS,
  EDITABLE, LABELS_STARTER, ID_LETTERS, SHOP_NO_JOB, OWN_VEHICLE, LATE_DAYS, TRIP_WIDE, STARTER_OPERATIONS,
  isInstant, localDay, localClock, showClock, atLocal, nextDay, offsetAt, showMinutes, showElapsed, hoursWords,
  starterLists, checkLists, addName, removeName, addVehicle, removeVehicle, addMachine, removeMachine, addOperation, setOperation, removeOperation, setJobs, setLong, longOn,
  namesNow, vehiclesNow, addPerson, removePerson, addVehicleHere, removeVehicleHere, endOfDayOf, setEndOfDay, eodRefresh, whoOf,
  newDeviceId, nextEventId, inOrder, eventProblems, timersFrom, startTimer, startTrip, stopTimer, stopTrip, typedTimer, editTimer, stillGoing,
  pauseTimer, resumeTimer, switchCnc, undoSwitch, setLabels, labelsWay, labelsWords, labelsRowWords, checkIn, stopAtCheckin,
  jobTotals, workerTime, maintenanceTotals, vehicleKm, lastReading, tripsFrom, recordPath, dayFiles, checkDay, readFile, mergeEvents };
});
