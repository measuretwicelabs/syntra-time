/* app.js: the screens of the SyntraTime phone page, built from the mockups agreed on 19 Nov 2026 (docs/time_mockups/). It holds no sum and no rule about hours: it asks syntratime.js
   (ST), keeps and sends through store.js, puts words and order on what ST gives back through view.js, and draws. A screen is a function that gives its top, body and bottom bar as
   markup; a tap is a data-act that names the function that handles it. */
(function () {
'use strict';
const VERSION = 'Version 22 Nov, 5';             /* shown at the bottom of What happened, so it is plain which copy the phone has; the number goes up with each change to the page */
const ms = MS.create({ clientId: CLIENT_ID, note: (text, more) => store.note(text, more) });
const store = STORE.createStore({ storage: localStorage, drive: ms.drive });
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const now = () => Date.now();
const zone = () => store.lists().settings.zone;
const auth = { signedIn: false, name: '', checked: false };          /* what Microsoft says: signed in or not, and as whom */
const ui = { view: 'home', notice: '', open: {}, earlier: false, form: { who: [], note: '', remake: false }, maint: null, picking: [], pickDraw: null, search: '', newName: '', job: null, op: null, error: '', busy: null, runCount: 0, waitCount: 0, trip: null, back: null, edit: null, after: null, newVehicle: '', from: 'op' };
const screens = {}, acts = {}, inputs = {};
/* the notifications of the open timers (notify.js, with the service worker sw.js): one for each open timer, with Check in */
const NOTIFY = NOTIFYLIB.create({ notices: () => VIEW.notices(snap().timers, zone()), zone, now, pref: (k, v) => store.pref(k, v), checkin: (timers, at) => checkedIn(timers, at) });
window.NOTIFY = NOTIFY;
/* Check in was tapped on a notification: written in the diary for each timer it stands for, with the moment it was tapped (it may have waited while the page was closed) */
function checkedIn(timers, at) {
  for (const id of timers || []) {
    const s = snap();
    try { record(ST.checkIn(s.events, store.device, store.by(), s.L, id, { at }, now())); }
    catch (e) { store.note('A check-in from a notification was not kept: ' + e.message, { odd: true, timer: id }); }
  }
  render(); sync();
}
/* the permission is asked for once, in plain words, after the first timer is started; the phone then asks its own question. It can be turned on later from What happened. */
function maybeAskNotify() {
  if (NOTIFY.state() !== 'default' || store.pref('notifyAsked')) return;
  store.pref('notifyAsked', true);
  sheet('<p><b>Show a notification for each running timer?</b></p><p class="small">SyntraTime can keep one notification on this phone for each timer that is open. It goes when the timer stops, it rings once an hour while SyntraTime is open, and its "Check in" button says the work is still going without opening the page.</p>' +
    '<p class="small">If you say yes, the phone will ask you to allow notifications from this page.</p><div class="two"><button type="button" class="btn" data-act="close">Not now</button><button type="button" class="btn go" data-act="notify-allow">Yes, show them</button></div>');
}

const MARK = '<svg class="mark" viewBox="0 0 32 32" width="34" height="34" aria-hidden="true"><path d="M22.6 9.4A9 9 0 1 0 22.6 22.6" fill="none" stroke="#f0b24a" stroke-width="2.6" stroke-linecap="round"/><path d="M15.6 16H24.4" stroke="#6fe7c0" stroke-width="2" stroke-linecap="round"/><circle cx="24.4" cy="16" r="1.9" fill="#6fe7c0"/></svg>';
const BACK = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="#d8e1e8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const backButton = (to, label) => '<button type="button" class="back" data-act="go" data-to="' + esc(to) + '" aria-label="' + esc(label || 'Back') + '">' + BACK + '<span>Back</span></button>';
const dot = (kind) => '<i class="dot ' + (kind || '') + '"></i>';

/* the number of records waiting, and the line at the top right of the home screen */
function statusButton() {
  const n = store.pending();
  return n ? '<button type="button" class="status wait" data-act="go" data-to="what">' + dot('wait') + '<span>' + n + (n === 1 ? ' record waiting' : ' records waiting') + '</span></button>'
    : '<div class="status">' + dot('good') + '<span>All saved</span></div>';
}

/* what the screens work from: the lists, every event the phone knows (its own and the other devices'), the timers worked out from them, and the names to pick from */
function snap() {
  const L = store.lists(), events = store.events();
  return { L, events, timers: ST.timersFrom(events, L, now()).timers, names: ST.namesNow(events, L) };
}
/* keep what was tapped: the events go into the phone's diary, and each gets its line in What happened */
function wordsFor(e, timers) {
  const T = (id) => timers.find((x) => x.id === id), label = (t) => (t ? t.op + (ST.whoOf(t) ? ': ' + ST.whoOf(t) : '') : 'a timer');
  if (e.type === 'start') return e.trip ? 'Started ' + e.op + ': ' + e.person + (e.driver ? ' (driving' + (e.vehicle ? ' the ' + e.vehicle : '') + ')' : '')
    : 'Started ' + e.op + (e.mode === 'maintenance' ? ' (' + e.machine + ', ' + e.work + ')' : '') + ': ' + e.workers.join(', ');
  if (e.type === 'stop') { const t = T(e.timer); return 'Stopped ' + (t ? label(t) + ', ' + ST.showMinutes(t.minutes) : 'a timer') + (e.odoBack !== null && e.odoBack !== undefined ? ', odometer back ' + VIEW.showKm(e.odoBack) + ' km' : ''); }
  if (e.type === 'pause' || e.type === 'resume') { const t = T(e.timer), did = e.type === 'pause' ? 'Paused ' : 'Resumed '; return e.worker ? did + e.worker + ' on ' + (t ? t.op : 'a timer') : did + label(t); }
  if (e.type === 'switch') return 'The CNC: ' + (e.to === 'cutting' ? 'cutting' : 'loading and unloading');
  if (e.type === 'unswitch') return 'Undid the last switch on the CNC';
  if (e.type === 'checkin') return 'Checked in: ' + label(T(e.timer)) + (e.at !== e.made ? ' (tapped at ' + ST.showClock(e.at, zone()) + ')' : '');
  if (e.type === 'eod') return 'End-of-day check on this phone: ' + (e.on ? 'on, asks at ' : 'off (its time stays ') + ST.showClock(ST.atLocal(ST.localDay(e.made, zone()), e.at, zone()), zone()) + (e.on ? '' : ')');
  if (e.type === 'edit' && e.set && 'cancelled' in e.set) return (e.set.cancelled ? 'Started by mistake: ' : 'Counted again: ') + label(T(e.timer));
  if (e.type === 'edit' && e.set && Object.keys(e.set).join() === 'checked') return 'Said it is right: ' + label(T(e.timer));
  if (e.type === 'edit' && e.set && Object.keys(e.set).join() === 'stop') { const t = T(e.timer); return 'Kept the stop' + (t ? ' of ' + label(t) + ' at ' + ST.showClock(e.set.stop, zone()) : ''); }
  if (e.type === 'edit') return 'Corrected ' + label(T(e.timer)) + ' (' + Object.keys(e.set).join(', ') + ')';
  if (e.type === 'going') return 'Still going: ' + label(T(e.timer));
  if (e.type === 'vehicles') return (e.action === 'add' ? 'Added ' : 'Removed ') + e.name + (e.action === 'add' ? ' to' : ' from') + ' the vehicles on this phone';
  if (e.type === 'names') return (e.action === 'add' ? 'Added ' : 'Removed ') + e.name + (e.action === 'add' ? ' to' : ' from') + ' the names on this phone';
  return e.type;
}
function record(evs) {
  evs = [].concat(evs); store.add(evs);
  const timers = ST.timersFrom(store.events(), store.lists(), now()).timers;
  for (const e of evs) store.note(wordsFor(e, timers), { detail: e.id + ' ' + e.type, timer: e.type === 'start' ? e.id : e.timer || null });
  /* a timer follows the end-of-day check of the phone that started it: so that every reader has this phone's setting in the days it reads, it is written again now and then */
  if (evs.some((e) => e.type === 'start')) { const again = ST.eodRefresh(store.events(), store.device, store.by(), now()); if (again) store.add([again]); }
  if (window.NOTIFY) NOTIFY.refresh();
}
/* the Start screen comes filled in with the worker picked last time (owner, 21 Nov 2026), when that name is still on the list */
function lastWho() { const names = ST.namesNow(store.events(), store.lists()), last = store.pref('who') || []; return last.filter((n) => names.some((x) => x.toLowerCase() === String(n).toLowerCase())); }
const fresh = () => ({ who: lastWho(), note: '', remake: false, labels: null });
const freshAfter = () => ({ job: undefined, jobTyped: false, op: null, who: lastWho(), day: ST.localDay(now(), zone()), clock: '', length: '', stopClock: '', note: '', remake: false, labels: null });
const freshTrip = () => ({ people: [], driver: null, vehicle: null, odo: '', note: '', stopOther: false });
/* a typed odometer reading as a number: spaces and commas between the thousands are allowed; anything else goes to syntratime.js, which says it is not a number */
const odoValue = (txt) => { const t = String(txt || '').replace(/[\s,\u00a0\u202f]/g, ''); return t === '' ? '' : /^\d+(\.\d+)?$/.test(t) ? Number(t) : t; };
/* make something happen; a refusal comes in plain words from syntratime.js and is shown on the screen, changing nothing */
function attempt(fn) {
  try { ui.error = ''; fn(); } catch (e) { ui.error = e.message; ui.busy = e.busy || null; }
  const a = document.activeElement; if (a && a.matches && a.matches('input[type=text]') && !a.closest('#sheet')) a.blur();       /* an action was taken: the screen must show what came of it */
  render(); sync();
}
const errorBox = () => (ui.error ? '<div class="note-error"><div>' + esc(ui.error) + '</div>' + (/^Sign in first/.test(ui.error) ? '<button type="button" class="btn" data-act="go" data-to="what">Sign in</button>' : '') + '</div>' : '');
const mainBar = () => '<button type="button" class="btn" data-act="help">Help</button>' + (screens.after ? '<button type="button" class="btn" data-act="go" data-to="after">Add time after</button>' : '') +
  '<button type="button" class="btn" data-act="go" data-to="what">What happened</button>';
const barClass = () => (screens.after ? 'low' : 'low two');

/* a time that moves by itself: the minutes counted so far, and the moment they were counted, so each second adds to it without reading the diaries again. A paused timer stands still. */
const live = (minutes, style) => '<span class="time" data-ms="' + Math.round(minutes * 60000) + '" data-at="' + now() + '"' + (style ? ' style="' + style + '"' : '') + '>' + esc(ST.showElapsed(minutes)) + '</span>';
const CHK = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="#06121e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const pausedWords = (iso) => 'paused ' + ST.showClock(iso, zone());
/* a timer's time: moving while it runs; standing still in minutes with "paused 2:41 pm" under it while the task is paused (mockup 2) */
const timeOf = (t, size) => (t.paused ? '<span class="time stack"' + (size ? ' style="font-size:' + size + '"' : '') + '>' + esc(ST.showMinutes(t.minutes)) + '<span class="pz">' + esc(pausedWords(t.pausedAt)) + '</span></span>' : live(t.minutes, size ? 'font-size:' + size : ''));
const pauseStop = (t, words) => '<div class="pair"><button type="button" class="btn" data-act="' + (t.paused ? 'resume' : 'pause') + '" data-id="' + esc(t.id) + '">' + (t.paused ? 'Resume' : 'Pause') + (words || '') + '</button>' +
  '<button type="button" class="btn stop" data-act="stop" data-id="' + esc(t.id) + '">Stop</button></div>';

/* ---- screen 1: the timers running now, and picking the job ---- */
function jobsMarkup() {
  const s = snap(), choices = VIEW.jobChoices(s.timers, s.L), shown = VIEW.filterJobs(choices, ui.search), fresh1 = VIEW.newJob(choices, ui.search);
  /* the jobs that match come first; a typed name that is not a job yet is offered last, so a part of a name never makes a new job by a wrong tap */
  return shown.map((c) => '<button type="button" class="pick" data-act="job" data-name="' + esc(c.job) + '"' + (c.listed ? '' : ' data-typed="1"') + '><span class="grow">' + esc(c.job) + '</span>' + (c.running ? '<span class="more">' + c.running + ' running</span>' : '') + '</button>').join('') +
    (fresh1 ? '<button type="button" class="pick" data-act="job" data-name="' + esc(fresh1) + '" data-typed="1"><span class="grow">New job: ' + esc(fresh1) + '</span></button>' : '');
}
screens.home = () => {
  const s = snap(), run = VIEW.runningNow(s.timers), eod = VIEW.endOfDay(s.events, store.device, now(), zone());
  ui.runCount = run.length;
  const wait = VIEW.waiting(s.timers, zone(), ST.localDay(now(), zone())); ui.waitCount = wait.rows.length;
  const ask = (r) => '<div class="askrow"><div class="trow" style="border:0;padding:0;background:none"><button type="button" class="rowlink grow" data-act="timer" data-id="' + esc(r.id) + '"><span class="op">' + esc(r.who + ' · ' + r.op) + '</span></button><span class="time">' + esc(ST.showMinutes(r.minutes)) + '</span></div>' +
    '<div class="sub">' + esc(VIEW.jobWords(r.job)) + (r.late ? ' · asked ' + esc(VIEW.dayName(ST.localDay(r.stop, zone()))) : '') + (r.paused ? ' · it was paused at ' + esc(r.stopClock) : '') + '</div>' +
    '<div class="row"><button type="button" class="btn go" data-act="going" data-id="' + esc(r.id) + '" data-check="' + esc(r.check) + '">Still going</button><button type="button" class="btn" data-act="keep-stop" data-id="' + esc(r.id) + '" data-at="' + esc(r.stop) + '">Stop at ' + esc(r.stopClock) + '</button></div></div>';
  const box = wait.rows.length ? '<div class="section"><div class="alert"><div class="label" style="color:var(--mark);font-size:15px">' + esc(wait.heading) + '</div>' +
    '<div class="small">A timer with no answer is stopped at the check’s time and marked for you to check.</div>' + wait.rows.map(ask).join('') + '</div></div>' : '';
  /* a running timer: Pause beside Stop, on a line of their own; a paused one has an amber edge and Resume (mockup 2). A tap on a task opens its card; on a trip, that person's timer. */
  const row = (t) => '<div class="trow wrap' + (t.paused ? ' paused' : '') + '"><button type="button" class="rowlink grow" data-act="' + (t.trip ? 'timer' : 'open') + '" data-id="' + esc(t.id) + '"><span class="op">' + esc(t.op) + '</span><span class="sub">' + esc(VIEW.timerLine(t)) + '</span></button>' +
    timeOf(t) + pauseStop(t) + '</div>';
  return {
    top: MARK + '<div class="name"><div class="title">SyntraTime</div><div class="sub">Shop time ' + esc(ST.showClock(now(), zone())) + '</div></div>' + statusButton(),
    body: errorBox() + box + '<div class="section"><div class="label">Running now: ' + run.length + '</div>' + (run.length ? run.map(row).join('') : '<div class="small">No timer is running.</div>') +
      '<div class="row" id="eod"><div class="grow"><div style="font-size:15.5px">End-of-day check</div><div class="small">' + esc(eod.text) + ' · <button type="button" class="linkbtn" data-act="eod-time">Change</button></div></div>' +
      '<div class="seg"><button type="button" class="btn' + (eod.on ? ' lit' : '') + '" data-act="eod-on" aria-pressed="' + eod.on + '">On</button><button type="button" class="btn' + (eod.on ? '' : ' lit') + '" data-act="eod-off" aria-pressed="' + !eod.on + '">Off</button></div></div></div>' +
      '<div class="section" style="padding-top:6px"><div class="label">Start a timer: pick the job</div>' +
      '<label class="field"><span class="step">Find a job, or type a new job name. Last used first.</span><input type="text" class="input" id="search" data-input="search" placeholder="Job name" autocomplete="off" value="' + esc(ui.search) + '"></label>' +
      '<button type="button" class="pick amber-edge" data-act="job" data-none="1"><span class="grow" style="font-weight:600">Shop, no job</span><span class="more">cleaning, maintenance</span></button>' +
      '<div class="section" id="jobs">' + jobsMarkup() + '</div></div>',
    bar: mainBar(), barClass: barClass()
  };
};

/* ---- screen 2: what is being timed, for the chosen job ---- */
screens.timed = () => {
  const s = snap(), g = VIEW.operationGroups(s.L), job = ui.job || { name: null };
  const btn = (o) => {
    const st = VIEW.opStatus(s.timers, job.name, o.name), on = st.running ? st.running + ' running' + (st.names.length ? ': ' + st.names.join(', ') : '') : '';
    return '<button type="button" class="opbtn' + (st.running ? ' running' : '') + '" data-act="op" data-name="' + esc(o.name) + '"><span' + (st.running ? ' style="font-weight:600"' : '') + '>' + esc(o.name) + '</span>' + (on ? '<span class="on">' + esc(on) + '</span>' : '') + '</button>';
  };
  const group = (label, ops, first) => ops.length ? '<div class="label"' + (first ? '' : ' style="padding-top:8px"') + '>' + label + '</div><div class="opgrid">' + ops.map(btn).join('') + '</div>' : '';
  return {
    top: '<button type="button" class="back" data-act="go" data-to="home" aria-label="Back to the jobs">' + BACK + '<span>Jobs</span></button><div class="name"><div class="title" style="font-size:20px">' + esc(VIEW.jobWords(job.name)) + '</div><div class="sub">What is being timed?</div></div>',
    body: errorBox() + group('In the shop: people', g.people, true) + group('In the shop: machines', g.machines) + group('Out of the shop: a trip', g.out),
    bar: mainBar(), barClass: barClass()
  };
};

/* ---- screen 3: one operation: the timers on it side by side, and adding another ---- */
/* screen 5: a trip out, leaving. Everyone in the vehicle is tapped, one of them drives, the vehicle is picked, the odometer may be left empty (syntratime.js: startTrip) */
const kmWords = (n) => VIEW.showKm(n) + ' km';
screens.trip = () => {
  const s = snap(), job = ui.job || { name: null }, f = ui.trip, states = VIEW.nameStates(s.names, s.timers, job.name, ui.op), vehicles = ST.vehiclesNow(s.events, s.L).concat([ST.OWN_VEHICLE]);
  const alone = !s.names.length, going = alone ? [store.by()].filter(Boolean) : f.people;
  const chip = (n) => {
    const on = going.some((x) => x.toLowerCase() === n.name.toLowerCase());
    if (on) return '<button type="button" class="opbtn chosen" aria-pressed="true" data-act="trip-who" data-name="' + esc(n.name) + '"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="#06121e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>' + esc(n.name) + '</span></button>';
    return '<button type="button" class="opbtn" data-act="trip-who" data-name="' + esc(n.name) + '"><span>' + esc(n.name) + '</span>' + (n.state === 'busy' ? '<span class="where amber">' + esc(n.where) + '</span>' : '') + '</button>';
  };
  const pick = (label, act, key, chosen) => '<button type="button" class="opbtn' + (chosen ? ' chosen' : '') + '"' + (chosen ? ' aria-pressed="true"' : '') + ' data-act="' + act + '" data-name="' + esc(label) + '">' + (chosen ? '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="#06121e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '') + '<span>' + esc(label) + '</span></button>';
  const driver = going.length === 1 ? going[0] : f.driver, vehicle = f.vehicle;
  const last = vehicle ? ST.lastReading(s.timers, vehicle, driver) : null;
  const n = going.length;
  return {
    top: '<button type="button" class="back" data-act="go" data-to="timed" aria-label="Back to what is timed">' + BACK + '<span>Back</span></button><div class="name"><div class="title" style="font-size:20px">' + esc(ui.op) + '</div><div class="sub">' + esc(VIEW.jobWords(job.name)) + ' · out of the shop</div></div>',
    body: errorBox() + '<div class="section"><div class="label">Start a trip: leaving</div>' +
      (alone ? '<div class="step">1. The trip is in your name' + (going.length ? ' (' + esc(going[0]) + ')' : '') + '.</div>' : '<div class="step">1. Who is going? Tap everyone in the vehicle.</div><div class="cardgrid">' + states.map(chip).join('') + '</div>') +
      '<button type="button" class="btn" data-act="go" data-to="people" data-from="trip" style="min-height:44px;font-size:15px">Add / remove a person</button>' +
      (n > 1 ? '<div class="step" style="padding-top:8px">2. Who is driving?</div><div class="cardgrid">' + going.map((x) => pick(x, 'trip-driver', 'driver', f.driver && f.driver.toLowerCase() === x.toLowerCase())).join('') + '</div>' : '') +
      '<div class="step" style="padding-top:8px">' + (n > 1 ? '3' : '2') + '. Which vehicle?</div><div class="cardgrid">' + vehicles.map((v) => pick(v, 'trip-vehicle', 'vehicle', vehicle && vehicle.toLowerCase() === v.toLowerCase())).join('') +
      '<button type="button" class="opbtn" data-act="go" data-to="vehicles"><span>Add / remove a vehicle</span></button></div>' +
      '<label class="field" style="padding-top:8px"><span class="step">' + (n > 1 ? '4' : '3') + '. Odometer leaving, in km (may be filled in later)</span><input type="text" class="input" inputmode="numeric" data-input="trip-odo" autocomplete="off" value="' + esc(f.odo) + '">' +
      (last ? '<span class="small">' + esc(vehicle.toLowerCase() === ST.OWN_VEHICLE.toLowerCase() ? 'Last reading of ' + (driver || 'this person') + '’s own vehicle: ' : vehicle + '’s last reading: ') + esc(kmWords(last.km)) + '</span>' : '') + '</label>' +
      '<label class="field" style="padding-top:4px"><span class="step">' + (n > 1 ? '5' : '4') + '. What is the trip for?</span><textarea class="input" rows="2" data-input="trip-note" style="padding-top:10px">' + esc(f.note) + '</textarea></label>' +
      '<button type="button" class="btn go" data-act="trip-start"' + (n && driver && vehicle ? '' : ' disabled') + '>' + (n ? 'Start the trip: ' + n + (n === 1 ? ' person' : ' people') : 'Pick who is going') + '</button></div>',
    bar: mainBar(), barClass: barClass()
  };
};
/* the vehicles to pick on a trip, kept on this device like the names (the company vehicles; Own vehicle is always offered) */
screens.vehicles = () => {
  const s = snap(), list = ST.vehiclesNow(s.events, s.L), out = VIEW.runningNow(s.timers).filter((t) => t.vehicle);
  const row = (v) => '<div class="prow"><div class="grow"><div class="who">' + esc(v) + '</div>' + (out.some((t) => t.vehicle.toLowerCase() === v.toLowerCase()) ? '<div class="small good">out on a trip now</div>' : '') + '</div>' +
    '<button type="button" class="btn warn" data-act="vehicle-remove" data-name="' + esc(v) + '" style="min-width:92px;min-height:44px;font-size:15px">Remove</button></div>';
  return {
    top: '<button type="button" class="back" data-act="go" data-to="trip" aria-label="Back to the trip">' + BACK + '<span>Back</span></button><div class="name"><div class="title" style="font-size:20px">Add / remove a vehicle</div><div class="sub">The vehicles to pick on a trip</div></div>',
    body: errorBox() + '<div class="section"><div class="label">Add a vehicle</div><div class="row" style="align-items:flex-end"><label class="field grow"><span class="step">Name</span>' +
      '<input type="text" class="input" id="newvehicle" data-input="newvehicle" autocomplete="off" value="' + esc(ui.newVehicle) + '"></label>' +
      '<button type="button" class="btn go" data-act="vehicle-add" style="min-width:92px">Add</button></div></div>' +
      '<div class="section" style="padding-top:14px"><div class="label">On the list: ' + list.length + '</div>' + (list.map(row).join('') || '<div class="small">No company vehicles yet.</div>') +
      '<div class="small" style="padding-top:6px">' + esc(ST.OWN_VEHICLE) + ' is always offered on a trip, for each person, so it is not on this list. Removing a vehicle only takes it off the list to pick from: trips already recorded keep it.</div></div>',
    bar: '<button type="button" class="btn go" data-act="go" data-to="trip" style="width:100%">Done: back to the trip</button>', barClass: ''
  };
};
/* screen 5b: a trip out, coming back. Who is back (everyone ticked: untick anyone staying out, their timer runs on), the odometer back, and the note. The distance under it is
   worked out by syntratime.js: the stops are made as a trial, the timers read from them, and the trip's own kilometres shown; nothing is kept until the button is pressed. */
function backTrial(s, b, withOdo) {
  try {
    const stops = ST.stopTrip(s.events, store.device, store.by() || '?', s.L, b.trip, { people: b.back, odoBack: withOdo ? odoValue(b.odo) : '' }, now());
    const trip = ST.tripsFrom(ST.timersFrom(s.events.concat(stops), s.L, now()).timers).find((x) => x.trip === b.trip);
    return { stops, km: trip ? trip.km : null, problem: '' };
  } catch (e) { return { stops: null, km: null, problem: e.message }; }
}
function backLine(s, b, trip, driverBack) {
  if (!driverBack) return '';
  const tr = backTrial(s, b, true);
  return (trip.odoOut !== null ? '<div class="kmrow"><span>Left at ' + esc(kmWords(trip.odoOut)) + '</span>' + (tr.km !== null ? '<span class="kmgo">' + esc(kmWords(tr.km)) + ' driven</span>' : '') + '</div>' : (tr.km !== null ? '<div class="kmrow"><span class="kmgo">' + esc(kmWords(tr.km)) + ' driven</span></div>' : '')) +
    (tr.problem && String(b.odo).trim() ? '<div class="small amber">' + esc(tr.problem) + '</div>' : '');
}
screens.tripstop = () => {
  const s = snap(), b = ui.back, all = s.timers.filter((t) => t.trip === b.trip && !t.cancelled), out = all.filter((t) => t.running), trip = ST.tripsFrom(s.timers).find((x) => x.trip === b.trip);
  if (!trip || !out.length) { ui.back = null; ui.view = 'home'; return screens.home(); }
  const driverOut = out.find((t) => t.driver), driverBack = !!driverOut && b.back.some((x) => x.toLowerCase() === driverOut.person.toLowerCase());
  const row = (t) => { const on = b.back.some((x) => x.toLowerCase() === t.person.toLowerCase());
    return '<label class="check big"><input type="checkbox" data-input="back-who" data-name="' + esc(t.person) + '"' + (on ? ' checked' : '') + '><span class="grow">' + esc(t.person) + '</span>' + (t.driver ? '<span class="small">driver</span>' : '') + (on ? '' : '<span class="small amber">staying out: timer runs on</span>') + '</label>'; };
  if (b.note === null) b.note = trip.note || '';
  const names = out.filter((t) => b.back.some((x) => x.toLowerCase() === t.person.toLowerCase())).map((t) => t.person);
  const stopWord = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
  const outFor = Math.max.apply(null, out.map((t) => t.minutes));
  return {
    top: '<button type="button" class="back" data-act="go" data-to="home" aria-label="Back without stopping">' + BACK + '<span>Back</span></button><div class="name"><div class="title" style="font-size:20px">Stop the trip</div><div class="sub">' + esc(trip.op + ' · ' + VIEW.jobWords(trip.job) + (trip.vehicle ? ' · ' + trip.vehicle : '')) + '</div></div>',
    body: errorBox() + '<div class="section"><div class="bigrow"><span class="grow small" style="font-size:16px">Out for</span>' + live(outFor, 'font-size:19px') + '</div>' +
      '<div class="step" style="padding-top:8px">1. Who is back? Untick anyone staying out.</div>' + out.map(row).join('') +
      (driverOut ? '<label class="field" style="padding-top:8px"><span class="step">2. Odometer back, in km (may be filled in later)</span><input type="text" class="input" inputmode="numeric" data-input="back-odo" autocomplete="off" value="' + esc(b.odo) + '"' + (driverBack ? '' : ' disabled') + '></label>' +
        '<div id="backline">' + backLine(s, b, trip, driverBack) + '</div>' + (driverBack ? '' : '<div class="small">The reading goes with the driver. It is filled in when ' + esc(driverOut.person) + ' is stopped, or later.</div>') : '') +
      '<label class="field" style="padding-top:8px"><span class="step">' + (driverOut ? '3' : '2') + '. What the trip was for (change it if needed)</span><textarea class="input" rows="2" data-input="back-note" style="padding-top:10px">' + esc(b.note) + '</textarea></label></div>',
    bar: '<button type="button" class="btn go" data-act="back-stop"' + (names.length ? '' : ' disabled') + ' style="width:100%">' + (names.length ? 'Stop for ' + esc(stopWord) : 'Pick who is back') + '</button><button type="button" class="btn" data-act="go" data-to="home" style="width:100%">Not yet: keep the trip running</button>', barClass: ''
  };
};
/* screen 6: one timer opened. Anyone at the phone may correct any timer, for now. What a correction does, and what is refused, is syntratime.js (editTimer); the screen holds the
   changes as a draft, shows what the timer would be with them (a trial: nothing is kept), and writes one correction when "Save the changes" is pressed. */
const timerNow = (s, id) => s.timers.find((t) => t.id === id) || null;
function trialEdit(s, id, set) {
  const T = timerNow(s, id);
  if (!Object.keys(set).length) return { T, problem: '' };
  try {
    const e = ST.editTimer(s.events, store.device, store.by() || '?', s.L, id, set, now());
    return { T: timerNow({ timers: ST.timersFrom(s.events.concat([e]), s.L, now()).timers }, id) || T, problem: '' };
  } catch (err) { return { T, problem: err.message }; }
}
const localClockOf = (iso) => ST.localClock(iso, zone());
function whenWords(iso, how, day0) {
  if (!iso) return 'running now';
  const d = ST.localDay(iso, zone()), what = how === 'check' ? 'by the end-of-day check' : how === 'typed' ? 'typed' : 'tapped';
  return (d !== day0 ? VIEW.dayName(d) + ', ' : '') + ST.showClock(iso, zone()) + '|' + what;
}
/* Correct this timer: Labels after Who. Beam saw cutting says which and that it was set at the start (no Change); the CNC says on how many sheets, with Change once it is stopped */
function labelsFact(T) {
  const b = T.labels; if (!b) return '';
  const words = ST.labelsWords(T), value = words.charAt(0).toUpperCase() + words.slice(1);
  const can = b.kind === 'sheets' && !T.running && b.of > 0;
  const how = b.kind === 'timer' ? 'set at the start' : T.running ? 'change it on the timer' : '';
  return '<div class="fact"><div class="fl">Labels</div><div class="fv grow">' + esc(value) + (how ? '<span class="how">' + esc(how) + '</span>' : '') + '</div>' +
    (can ? '<button type="button" class="btn" data-act="timer-pick-labels" style="min-height:44px;min-width:92px;font-size:15px">Change</button>' : '') + '</div>';
}
screens.timer = () => {
  const s = snap(), e = ui.edit, base = timerNow(s, e.id);
  if (!base) { ui.edit = null; ui.view = 'home'; return screens.home(); }
  const { T, problem } = trialEdit(s, e.id, e.set), day0 = ST.localDay(base.start, zone()), dirty = Object.keys(e.set).length > 0;
  const who = ST.whoOf(T);
  const fact = (label, value, act, how) => '<div class="fact"><div class="fl">' + label + '</div><div class="fv grow">' + (how ? '<span class="clk">' + esc(value) + '</span><span class="how">' + esc(how) + '</span>' : esc(value)) + '</div>' +
    (act ? '<button type="button" class="btn" data-act="' + act + '" style="min-height:44px;min-width:92px;font-size:15px">Change</button>' : '') + '</div>';
  const startW = whenWords(T.start, T.startHow, day0).split('|'), stopW = whenWords(T.stop, T.stopHow, day0).split('|');
  /* the To check box (mockup 7): why, the last check-in with what it confirms, and the answers: it is right; stop at the last check-in; for a long timer, delete (kept and listed, not counted) */
  const has = (k) => T.why.some((w) => w.why === k);
  const right = has('check') && T.stop ? ST.showClock(T.stop, zone()) + ' is right' : has('long') ? ST.showMinutes(T.minutes) + ' is right' : 'This is right';
  const checkin = T.checkin && !T.running ? '<div class="small" style="color:var(--fg)">Last check-in ' + esc(ST.showClock(T.checkin, zone())) + '. That is ' + esc(ST.showMinutes(T.confirmed)) + ' confirmed, and ' + esc(ST.showMinutes(T.unconfirmed)) + ' after it that nobody confirmed.</div>' : '';
  const why = T.toCheck ? '<div class="alert"><div class="label" style="color:var(--mark);font-size:15px">To check</div>' + T.why.map((w) => '<div class="small" style="color:var(--fg)">' + esc(w.text) + '</div>').join('') + checkin +
    '<button type="button" class="btn go" data-act="timer-right" style="flex:none">' + esc(right) + '</button>' +
    (T.checkin && T.checkin !== T.stop && !T.running ? '<button type="button" class="btn" data-act="timer-checkin-stop" style="flex:none;min-height:52px;font-size:16px">Stop at the last check-in, ' + esc(ST.showClock(T.checkin, zone())) + '</button>' : '') +
    (has('long') ? '<button type="button" class="btn warn" data-act="timer-mistake" style="flex:none;min-height:48px">Delete: keep it listed, do not count it</button>' : '') + '</div>' : '';
  const driver = T.trip && T.driver;
  const sum = (a, b) => '<div class="sumrow"><span>' + a + '</span><span class="time">' + esc(b) + '</span></div>';
  return {
    top: '<button type="button" class="back" data-act="timer-back" aria-label="Back without saving">' + BACK + '<span>Back</span></button><div class="name"><div class="title" style="font-size:20px">' + esc(who + ' · ' + T.op) + '</div><div class="sub">' + esc(VIEW.jobWords(T.job) + ' · ' + VIEW.dayName(day0)) + '</div></div>',
    body: errorBox() + (problem ? '<div class="note-error"><div>' + esc(problem) + '</div></div>' : '') + '<div class="section">' + (T.cancelled ? '<div class="alert"><div class="label" style="color:var(--mark);font-size:15px">Started by mistake</div><div class="small" style="color:var(--fg)">Kept and shown, and not counted.</div></div>' : why) +
      '<div class="facts">' + fact('Job', VIEW.jobWords(T.job), 'timer-pick-job') + fact('What', T.op, T.mode ? '' : 'timer-pick-op') +
      (T.mode === 'maintenance' ? fact('Machine', T.machine, 'timer-pick-machine') + fact('Kind', T.work, 'timer-pick-work') : '') +
      fact('Who', who, !s.names.length ? '' : T.trip ? 'timer-pick-who' : 'timer-pick-workers') + labelsFact(T) +
      fact('Started', startW[0], 'timer-pick-start', startW[1]) + fact('Stopped', stopW[0], T.running ? '' : 'timer-pick-stop', T.running ? '' : stopW[1]) +
      (driver ? fact('Odometer leaving', T.odoOut === null ? 'not filled in' : VIEW.showKm(T.odoOut) + ' km', 'timer-pick-odoOut') + fact('Odometer back', T.odoBack === null ? 'not filled in' : VIEW.showKm(T.odoBack) + ' km', 'timer-pick-odoBack') : '') + '</div>' +
      '<div class="bigrow" style="margin-top:8px"><span class="grow small" style="font-size:16px">Time</span><span class="time" style="font-size:19px">' + esc(ST.showMinutes(T.minutes)) + '</span></div>' +
      (T.workers.length > 1 ? '<div class="sums">' + T.workers.map((w) => sum(esc(w.name) + (w.paused ? ' (paused)' : ''), ST.showMinutes(w.minutes))).join('') + sum(T.workers.length + ' workers, combined', ST.showMinutes(T.combined)) + '</div>' : '') +
      (T.cnc ? '<div class="sums">' + sum('Cutting, ' + T.cnc.sheets + (T.cnc.sheets === 1 ? ' sheet' : ' sheets'), ST.showMinutes(T.cnc.cutting)) + sum('Loading and unloading', ST.showMinutes(T.cnc.loading)) + '</div>' : '') +
      '<label class="field" style="padding-top:8px"><span class="step">Note' + (T.trip ? ' (for the whole trip)' : '') + '</span><textarea class="input" rows="2" data-input="timer-note" style="padding-top:10px">' + esc('note' in e.set ? e.set.note : T.note) + '</textarea></label>' +
      (T.trip ? '' : '<label class="check"><input type="checkbox" data-input="timer-remake"' + (('remake' in e.set ? e.set.remake : T.remake) ? ' checked' : '') + '><span>Remake: redoing work already done</span></label>') + '</div>',
    bar: '<button type="button" class="btn go" data-act="timer-save"' + (dirty && !problem ? '' : ' disabled') + ' style="width:100%">Save the changes</button>' +
      (T.cancelled ? '<button type="button" class="btn" data-act="timer-unmistake" style="width:100%">Count it again</button>' : '<button type="button" class="btn warn" data-act="timer-mistake" style="width:100%">Started by mistake</button>'), barClass: ''
  };
};
/* screen 6b: time typed in afterwards, for work nobody timed. Start and How long give the stop (or the stop is given); the start and the stop are written together, both marked typed
   (syntratime.js: typedTimer). The screen shows a trial of what would be added, and keeps nothing until the button is pressed. A trip typed in afterwards is not on this screen. */
/* time typed in afterwards is for the plain operations in the shop: a trip is started and stopped as a trip, and the CNC and Maintenance are timed live on their own screens */
const afterOps = (L) => L.operations.filter((o) => !o.out && !o.mode);
function afterBase(s, a) {
  return Object.assign({ job: a.job === undefined ? null : a.job, jobTyped: !!a.jobTyped, op: a.op, workers: s.names.length ? a.who : undefined, note: a.note, remake: a.remake }, a.op && ST.labelsWay(s.L, a.op) ? { labels: a.labels } : {});
}
function afterTrial(s, a) {
  const f = afterBase(s, a), minutes = VIEW.parseLength(a.length), start = a.clock ? new Date(ST.atLocal(a.day, a.clock, zone())).toISOString() : null;
  if (!a.op) return { problem: '', ready: false };
  if (!start) return { problem: '', ready: false };
  if (String(a.length).trim() && minutes === null) return { problem: 'How long could not be read: type it like 2 h 30, 2:30 or 150.', ready: false };
  if (s.names.length && !a.who.length) return { problem: '', ready: false };
  if (a.op && ST.labelsWay(s.L, a.op) && typeof a.labels !== 'boolean') return { problem: '', ready: false };
  f.at = start;
  if (minutes !== null) f.minutes = minutes; else if (a.stopClock) f.until = new Date(ST.atLocal(a.day, a.stopClock, zone())).toISOString(); else return { problem: '', ready: false };
  try {
    const evs = ST.typedTimer(s.events, store.device, store.by() || '?', s.L, f, now()), T = ST.timersFrom(s.events.concat(evs), s.L, now()).timers.find((t) => t.id === evs[0].id);
    return { problem: '', ready: a.job !== undefined, evs, T, stop: evs[1].at };
  } catch (e) { return { problem: e.message, ready: false }; }
}
screens.after = () => {
  const s = snap(), a = ui.after, tr = afterTrial(s, a);
  const fact = (label, value, act, how, missing) => '<div class="fact"><div class="fl">' + label + '</div><div class="fv grow">' + (how ? '<span class="clk">' + esc(value) + '</span><span class="how">' + esc(how) + '</span>' : missing ? '<span class="small">' + esc(value) + '</span>' : esc(value)) + '</div>' +
    (act ? '<button type="button" class="btn" data-act="' + act + '" style="min-height:44px;min-width:92px;font-size:15px">' + (missing ? 'Pick' : 'Change') + '</button>' : '') + '</div>';
  const minutes = VIEW.parseLength(a.length), who = s.names.length ? VIEW.namesWords(a.who) : (store.by() || 'you');
  /* Stopped is worked out as soon as Started and How long (or a typed Stopped) are known: it is only a sum, so it does not wait for the job, what and who to be picked (owner's hand test 2, 22 Nov 2026) */
  const startMs = a.clock ? new Date(ST.atLocal(a.day, a.clock, zone())).getTime() : null, stopMs = a.stopClock ? new Date(ST.atLocal(a.day, a.stopClock, zone())).getTime() : null;
  const stopShown = startMs !== null && minutes !== null ? ST.showClock(new Date(startMs + minutes * 60000).toISOString(), zone()) : (stopMs !== null ? ST.showClock(new Date(stopMs).toISOString(), zone()) : null);
  const what = tr.T && tr.ready ? ST.showMinutes(tr.T.minutes) : null;
  return {
    top: '<button type="button" class="back" data-act="go" data-to="home" aria-label="Back without adding">' + BACK + '<span>Back</span></button><div class="name"><div class="title" style="font-size:20px">Add time after</div><div class="sub">For work nobody timed</div></div>',
    body: errorBox() + (tr.problem ? '<div class="note-error"><div>' + esc(tr.problem) + '</div></div>' : '') + '<div class="section"><div class="facts">' +
      fact('Job', a.job === undefined ? 'not picked yet' : VIEW.jobWords(a.job), 'after-pick-job', null, a.job === undefined) + fact('What', a.op || 'not picked yet', 'after-pick-op', null, !a.op) +
      fact('Who', who || 'not picked yet', s.names.length ? 'after-pick-who' : '', null, !who) +
      (a.op && ST.labelsWay(s.L, a.op) ? '<div class="fact"><div class="fl">Labels</div><div class="fv grow">' + (typeof a.labels === 'boolean' ? '' : '<span class="small">Labels put on the parts?</span>') + '</div>' + labelSeg(a.labels, false, 'after-labels', '') + '</div>' : '') +
      fact('Day', VIEW.dayName(a.day), 'after-pick-day') + fact('Started', a.clock ? ST.showClock(new Date(ST.atLocal(a.day, a.clock, zone())).toISOString(), zone()) : 'not set yet', 'after-pick-clock', a.clock ? 'typed' : null, !a.clock) +
      fact('How long', minutes !== null ? ST.showMinutes(minutes) : 'not set yet', 'after-pick-length', minutes !== null ? 'typed' : null, minutes === null) +
      fact('Stopped', stopShown || 'not set yet', 'after-pick-stop', stopShown ? (minutes !== null ? 'worked out from How long' : 'typed') : null, !stopShown) + '</div>' +
      '<label class="field" style="padding-top:8px"><span class="step">Note</span><textarea class="input" rows="2" data-input="after-note" style="padding-top:10px">' + esc(a.note) + '</textarea></label>' +
      '<label class="check"><input type="checkbox" data-input="after-remake"' + (a.remake ? ' checked' : '') + '><span>Remake: redoing work already done</span></label>' +
      (tr.ready && tr.T && tr.T.why.length ? '<div class="small amber">' + tr.T.why.map((w) => esc(w.text)).join(' ') + ' It will be marked to check.</div>' : '') + '</div>',
    bar: '<button type="button" class="btn go" data-act="after-add"' + (tr.ready ? '' : ' disabled') + ' style="width:100%">' + (what ? 'Add ' + esc(what) + (who ? ' for ' + esc(who) : '') : 'Add the time') + '</button><div class="small" style="text-align:center">It is marked as typed. A time still to come is refused.</div>', barClass: ''
  };
};
/* screen 3b: the names to pick on a timer, kept on this device (syntratime.js keeps what SyntraQuote wrote and what this device added or removed) */
screens.people = () => {
  const s = snap(), live = VIEW.runningNow(s.timers);
  const row = (n) => '<div class="prow"><div class="grow"><div class="who">' + esc(n) + '</div>' + (live.some((t) => t.workers.some((w) => w.name.toLowerCase() === n.toLowerCase())) ? '<div class="small good">on a timer now</div>' : '') + '</div>' +
    '<button type="button" class="btn warn" data-act="person-remove" data-name="' + esc(n) + '" style="min-width:92px;min-height:44px;font-size:15px">Remove</button></div>';
  return {
    top: '<button type="button" class="back" data-act="go" data-to="' + ui.from + '" aria-label="Back to ' + esc(ui.op) + '">' + BACK + '<span>Back</span></button><div class="name"><div class="title" style="font-size:20px">Add / remove a person</div><div class="sub">The names to pick on a timer</div></div>',
    body: errorBox() + '<div class="section"><div class="label">Add a person</div><div class="row" style="align-items:flex-end"><label class="field grow"><span class="step">Name</span>' +
      '<input type="text" class="input" id="newname" data-input="newname" autocomplete="off" value="' + esc(ui.newName) + '"></label>' +
      '<button type="button" class="btn go" data-act="person-add" style="min-width:92px">Add</button></div></div>' +
      '<div class="section" style="padding-top:14px"><div class="label">On the list: ' + s.names.length + '</div>' + (s.names.map(row).join('') || '<div class="small">No names yet. A timer is then in the name of whoever is signed in.</div>') +
      '<div class="small" style="padding-top:6px">Removing a name only takes it off the list to pick from. Time already recorded keeps the name, and a timer that is running carries on.</div></div>',
    bar: '<button type="button" class="btn go" data-act="go" data-to="' + ui.from + '" style="width:100%">Done: back to ' + esc(ui.op) + '</button>', barClass: ''
  };
};
/* ---- the task card (mockup 2), the CNC's card (mockup 3), and the Start screen (mockup 1) ---- */
/* a worker's own line on a task: their own time, and a Pause of their own. It is recorded, and it never changes the task's time. */
function workerLine(t, w) {
  return '<div class="wline"><span class="grow"><span class="wn">' + esc(w.name) + '</span>' + (w.paused ? '<span class="pz">' + esc(pausedWords(w.pausedAt)) + '</span>' : '') + '</span>' +
    '<span class="small">' + esc(ST.showMinutes(w.minutes)) + '</span>' +
    '<button type="button" class="btn mini" data-act="' + (w.paused ? 'w-resume' : 'w-pause') + '" data-id="' + esc(t.id) + '" data-name="' + esc(w.name) + '">' + (w.paused ? 'Resume' : 'Pause') + '</button></div>';
}
/* Labels, On | Off (owner, 21 Nov 2026; mockups 19 to 22): the page's own two-button switch. picked: true, false, or null (neither lit); act is the data-act each button carries */
function labelSeg(picked, locked, act, extra, wide) {
  return '<div class="seg" role="group" aria-label="Labels"' + (wide ? ' style="width:100%"' : '') + '>' + [[true, 'On'], [false, 'Off']].map(([k, t]) =>
    '<button type="button" class="btn' + (picked === k ? ' lit' : '') + '" data-act="' + act + '" data-to="' + (k ? 'on' : 'off') + '"' + (extra || '') + ' aria-pressed="' + (picked === k) + '"' + (locked ? ' disabled' : '') +
    ' style="' + (wide ? 'flex:1;' : '') + (locked ? 'opacity:.45' : '') + '">' + t + '</button>').join('') + '</div>';
}
const sheetsOf = (n) => n + (n === 1 ? ' sheet' : ' sheets');
/* the Labels line of a CNC card: what it says now, and the switch, which works only while Loading and unloading is running and the task is not paused */
function cncLabels(t) {
  const b = t.labels, c = t.cnc, can = c.now === 'loading' && !t.paused, word = b.now === null ? 'not asked' : b.now ? 'on' : 'off';
  const why = can ? (b.now === false ? 'off from this unload on, until turned back on' : b.now === null ? 'not asked: pick one' : 'on \u00b7 can be changed now') : word + ' \u00b7 ' + (t.paused ? 'the task is paused' : 'change it while loading and unloading');
  return '<div class="wline"><span class="grow"><span class="wn">Labels</span><span class="pz" style="color:' + (can ? 'var(--good)' : 'var(--muted)') + '">' + esc(why) + '</span></span>' + labelSeg(b.now, !can, 'cnc-labels', ' data-id="' + esc(t.id) + '"') + '</div>';
}
/* the CNC: two large buttons that say what the machine is doing (the one running lit in green with its own time), and its three totals */
function cncPart(t) {
  const c = t.cnc, cur = c.stretches[c.stretches.length - 1];
  const big = (part) => '<button type="button" class="cncbtn' + (c.now === part ? ' on' : '') + '" data-act="cnc" data-id="' + esc(t.id) + '" data-to="' + part + '" aria-pressed="' + (c.now === part) + '"><span class="cw">' + esc(ST.CNC_WORDS[part]) + '</span>' +
    (c.now === part ? (t.paused ? '<span class="small">paused</span>' : live(cur.minutes, 'color:var(--good)')) : '<span class="small">tap to switch</span>') + '</button>';
  const sum = (a, b, strong) => '<div class="sumrow' + (strong ? ' strong' : '') + '"><span>' + a + '</span><span class="time">' + esc(b) + '</span></div>';
  return '<div class="cncgrid">' + big('cutting') + big('loading') + '</div><div class="sums">' + sum('Cutting' + (c.sheets ? ', sheet ' + c.sheets : ''), ST.showMinutes(c.cutting)) +
    sum('Loading and unloading', ST.showMinutes(c.loading)) + (t.labels && t.labels.of ? sum('Labels put on', t.labels.labelled + ' of ' + sheetsOf(t.labels.of)) : '') + sum('CNC total', ST.showMinutes(t.minutes), true) + '</div>' +
    (t.labels && t.running ? cncLabels(t) : '');
}
/* Beam saw cutting: the card only says which, set at the start and never changed (a switch would let it be changed) */
function sawLabels(t) {
  const on = t.labels.on;
  return '<div class="wline"><span class="grow"><span class="wn">Labels</span><span class="pz" style="color:var(--muted)">set at the start \u00b7 to change it, stop and start a new timer</span></span><span style="font-size:16px;font-weight:600;padding-right:6px">' + (on === null ? 'not asked' : on ? 'On' : 'Off') + '</span></div>';
}
function taskCard(t) {
  const head = t.mode === 'cnc' ? 'The CNC' : t.mode === 'maintenance' ? t.machine + ' · ' + t.work : 'The task';
  return '<div class="tcard' + (t.paused ? ' paused' : '') + '" data-timer="' + esc(t.id) + '"><div class="thead"><div class="who grow">' + esc(head) + '</div>' + timeOf(t, '19px') + '</div>' +
    (t.cnc ? cncPart(t) : '') + (t.labels && t.labels.kind === 'timer' ? sawLabels(t) : '') + t.workers.map((w) => workerLine(t, w)).join('') + (t.note ? '<div class="note">' + esc(t.note) + '</div>' : '') +
    (t.cnc ? '<button type="button" class="btn quiet" data-act="cnc-undo" data-id="' + esc(t.id) + '"' + (t.cnc.lastSwitch ? '' : ' disabled') + '>Undo the last switch</button>' : '') +
    pauseStop(t, ' the task') + '<button type="button" class="linkbtn center" data-act="timer" data-id="' + esc(t.id) + '">Correct this timer</button></div>';
}
/* maintenance (mockup 6): which machine, then what kind of work; "Next" is the Start screen */
screens.maint = () => {
  const s = snap(), job = ui.job || { name: null }, m = ui.maint || { machine: null, work: null };
  const pick = (label, act, on) => '<button type="button" class="opbtn' + (on ? ' chosen" aria-pressed="true' : '') + '" data-act="' + act + '" data-name="' + esc(label) + '">' + (on ? CHK : '') + '<span>' + esc(label) + '</span></button>';
  return {
    top: '<button type="button" class="back" data-act="go" data-to="timed" aria-label="Back to what is timed">' + BACK + '<span>Back</span></button><div class="name"><div class="title" style="font-size:20px">' + esc(ui.op) + '</div><div class="sub">' + esc(VIEW.jobWords(job.name)) + '</div></div>',
    body: errorBox() + '<div class="section"><div class="step">1. Which machine?</div>' +
      (s.L.machines.length ? '<div class="cardgrid">' + s.L.machines.map((x) => pick(x, 'm-machine', m.machine === x)).join('') + '</div>' : '<div class="small">No machines are on the list yet. They are added in SyntraQuote: Settings, Shop time, Machines.</div>') +
      '<div class="step" style="padding-top:8px">2. What kind of work?</div><div class="cardgrid one">' + ST.MAINTENANCE_KINDS.map((x) => pick(x, 'm-work', m.work === x)).join('') + '</div>' +
      '<div class="small" style="padding-top:4px">The job stays "Shop, no job" unless you picked one.</div>' +
      '<button type="button" class="btn go" data-act="m-next" style="flex:none"' + (m.machine && m.work ? '' : ' disabled') + '>Next: who is working</button></div>',
    bar: mainBar(), barClass: barClass()
  };
};
/* screen 3, as changed on 21 Nov 2026: the tasks running on this operation, one card each, and the Start screen under them, the same for every operation, machines too */
screens.op = () => {
  const s = snap(), job = ui.job || { name: null }, f = ui.form, here = VIEW.opStatus(s.timers, job.name, ui.op).timers, m = ui.maint;
  const chip = (n) => { const on = f.who.some((x) => x.toLowerCase() === n.toLowerCase());
    return '<button type="button" class="opbtn' + (on ? ' chosen" aria-pressed="true' : '') + '" data-act="who" data-name="' + esc(n) + '">' + (on ? CHK : '') + '<span>' + esc(n) + '</span></button>'; };
  const oneSaw = ui.op === ST.LABELS_STARTER && !m && here.length > 0;      /* Beam saw cutting runs one timer at a time (owner, 22 Nov 2026): while it runs, its screen is the card alone */
  const way = ST.labelsWay(s.L, ui.op), alone = !s.names.length, me = store.by(), ready = alone || f.who.length > 0, labelled = !way || typeof f.labels === 'boolean';
  const stepNo = (n) => String(n - (alone ? 1 : 0));      /* alone, the names step is not asked */
  const labelsBox = !way ? '' : '<div style="display:flex;flex-direction:column;gap:6px;padding-top:4px"><div class="step">' + stepNo(2) + '. ' + (way === 'sheets' ? 'Labels put on while unloading?' : 'Labels put on the parts?') + '</div>' + labelSeg(f.labels, false, 'start-labels', '', true) +
    '<div class="small">' + (way === 'sheets' ? 'Pick one: nothing is picked for you. It holds for every sheet, and can be changed on the timer while loading and unloading.' : 'Pick one: nothing is picked for you. It is set once, for the whole timer.') + '</div></div>';       /* alone and not signed in: the tap says so in plain words, and offers the sign-in */
  return {
    top: '<button type="button" class="back" data-act="go" data-to="' + (m ? 'maint' : 'timed') + '" aria-label="Back">' + BACK + '<span>Back</span></button><div class="name"><div class="title" style="font-size:20px">' + esc(ui.op) + '</div><div class="sub">' + esc(VIEW.jobWords(job.name) + (m ? ' · ' + m.machine + ' · ' + m.work : '')) + '</div></div>',
    body: errorBox() + '<div class="section"><div class="label">Running here: ' + here.length + '</div>' + (here.length ? '<div class="cardgrid one">' + here.map(taskCard).join('') + '</div>' : '<div class="small">Nothing is running here yet.</div>') + '</div>' +
      (oneSaw ? '<div class="section small" style="padding-top:12px">One Beam saw cutting timer at a time. To start another, stop this one first.</div>' : '<div class="section" style="padding-top:12px"><div class="label">Add a timer</div>' +
      (alone ? '<div class="step">The timer is in your name' + (me ? ' (' + esc(me) + ')' : '') + '. Names to pick from can be added with Add / remove a person.</div>'
        : '<div class="step">1. Who is working? Pick one or more</div><div class="cardgrid">' + s.names.map(chip).join('') + '</div>') +
      '<button type="button" class="btn" data-act="go" data-to="people" data-from="op" style="min-height:44px;font-size:15px">Add / remove a person</button>' +
      labelsBox + '<label class="field" style="padding-top:4px"><span class="step">' + stepNo(way ? 3 : 2) + '. A note on what it is (you may leave it empty)</span><input type="text" class="input" data-input="note" autocomplete="off" value="' + esc(f.note) + '"></label>' +
      '<label class="check"><input type="checkbox" data-input="remake"' + (f.remake ? ' checked' : '') + '><span>Remake: redoing work already done</span></label>' +
      '<button type="button" class="btn go" data-act="start"' + (ready && labelled ? '' : ' disabled') + '>' + (!ready ? 'Pick who is working' : !labelled ? 'Pick Labels: On or Off' : alone ? 'Start the timer' : 'Start: ' + esc(VIEW.namesWords(f.who))) + '</button></div>'),
    bar: mainBar(), barClass: barClass()
  };
};

/* ---- screen 7: What happened, and the sign-in ---- */
screens.what = () => {
  const days = VIEW.logDays(store.log(), zone(), now()), n = store.pending();
  const line = (l) => '<div class="t">' + esc(l.clock) + '</div><div><button type="button" class="line' + (l.odd ? ' odd' : '') + '" data-act="line" data-i="' + l.index + '">' + esc(l.text) + '</button>' +
    (ui.open[l.index] && l.detail ? '<span class="detail">' + esc(l.detail) + '</span>' : '') + (ui.open[l.index] && l.timer && snap().timers.some((x) => x.id === l.timer) ? '<button type="button" class="btn" data-act="timer" data-id="' + esc(l.timer) + '" style="min-height:44px;margin-top:6px">Open this timer</button>' : '') + '</div>';
  const microsoft = '<section class="card"><div class="label">Microsoft</div><div class="row">' + dot(auth.signedIn ? 'good' : '') + '<div class="grow" id="who">' +
    (auth.signedIn ? 'Signed in' + (auth.name ? ' as ' + esc(auth.name) : '') : 'Not signed in') + '</div></div>' +
    (ui.notice ? '<div class="amber">' + esc(ui.notice) + '</div>' : '') +
    '<div class="small">' + (auth.signedIn ? 'Renews by itself. Timers work with or without it.' : 'Timers work without it: they are kept on this phone and sent after the next sign-in.') + '</div>' +
    (auth.signedIn || !CLIENT_ID ? '' : '<button type="button" class="btn go" data-act="signin">Sign in with Microsoft</button>') +
    (CLIENT_ID ? '' : '<div class="amber">Not set up yet: the registration with Microsoft is still to be done.</div>') + '</section>';
  const saved = '<section class="card"><div class="label">Saved</div><div class="row">' + dot(n ? 'wait' : 'good') + '<div class="grow ' + (n ? 'amber' : '') + '">' +
    (n ? n + (n === 1 ? ' record is' : ' records are') + ' waiting on this phone.' : 'All saved. Nothing waiting on this phone.') + '</div></div>' +
    '<div class="mono small" id="where">' + esc(ms.where().split('/').join(' / ')) + '</div></section>';
  const ns = NOTIFY.state();
  const notify = '<section class="card" id="notifycard"><div class="label">Notifications</div><div class="row">' + dot(ns === 'granted' ? 'good' : '') + '<div class="grow">' +
    (ns === 'granted' ? 'On: one for each open timer, with Check in.' : ns === 'default' ? 'Off.' : ns === 'denied' ? 'Blocked for this page in the phone\u2019s own settings.' : 'This phone\u2019s browser cannot show them.') + '</div></div>' +
    '<div class="small">' + (ns === 'denied' ? 'To use them, allow notifications for this page in the phone\u2019s settings, then open SyntraTime again. ' : '') + 'A notification can be swiped away; it comes back while SyntraTime is open. The hourly ring is dependable only while SyntraTime is open.</div>' +
    (ns === 'default' ? '<button type="button" class="btn" data-act="notify-allow">Show a notification for each open timer</button>' : '') + '</section>';
  const list = ui.earlier
    ? '<section class="card grow"><div class="label">Earlier days</div><div class="log">' + (days.earlier.length ? days.earlier.map((d) => '<div class="daynote">' + esc(d.label) + '</div>' + d.lines.map(line).join('')).join('') : '<div class="daynote" style="grid-column:1/-1;text-transform:none;letter-spacing:0;font-weight:400">Nothing from earlier days is kept on this phone.</div>') + '</div></section>'
    : '<section class="card grow"><div class="label">Today, newest first</div><div class="log">' + (days.today.length ? days.today.map(line).join('') : '<div style="grid-column:1/-1" class="small">Nothing has happened yet today.</div>') + '</div></section>';
  return {
    top: backButton('home', 'Back to the timers') + '<div class="name"><div class="title" style="font-size:20px">What happened</div><div class="sub">This phone is ' + esc(store.device) + '</div></div>',
    body: microsoft + saved + notify + list,
    bar: '<button type="button" class="btn' + (auth.signedIn ? '' : ' wide') + '" data-act="earlier">' + (ui.earlier ? 'Back to today' : 'Earlier days') + '</button>' +
      (auth.signedIn ? '<button type="button" class="btn" data-act="signout-ask">Sign out on this phone</button>' : '') + '<div class="note">' + esc(VERSION) + '</div>',
    barClass: 'two'
  };
};

/* ---- drawing ---- */
function render() {
  const a = document.activeElement;
  if (a && a.matches && a.matches('input[type=text],textarea') && !a.closest('#sheet')) { $('top').innerHTML = (screens[ui.view] || screens.home)().top; return; }       /* never take the keyboard away mid-word */
  const s = (screens[ui.view] || screens.home)();
  $('top').innerHTML = s.top; $('body').innerHTML = s.body;
  $('bar').className = 'bar' + (s.barClass ? ' ' + s.barClass : ''); $('bar').innerHTML = s.bar || ''; $('bar').hidden = !s.bar;
  if (s.after) s.after();
}
function go(view, patch) { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); ui.view = view; ui.earlier = false; ui.open = {}; ui.error = ''; if (patch) Object.assign(ui, patch); render(); $('body').scrollTop = 0; }
function sheet(markup) { $('sheet').innerHTML = '<div class="panel">' + markup + '</div>'; $('sheet').hidden = false; }
function closeSheet() { $('sheet').hidden = true; $('sheet').innerHTML = ''; }
/* a question that must be answered: Sign out, Remove and Delete ask first */
function ask(text, yesLabel, yesAct, data, noLabel) {
  sheet('<p>' + esc(text) + '</p><div class="two"><button type="button" class="btn" data-act="close">' + esc(noLabel || 'Not now') + '</button><button type="button" class="btn warn" data-act="' + yesAct + '"' +
    Object.entries(data || {}).map(([k, v]) => ' data-' + k + '="' + esc(v) + '"').join('') + '>' + esc(yesLabel) + '</button></div>');
}
function helpSheet() {
  const here = ui.view, order = HELP.SCREENS.map((s) => s[0]).sort((a, b) => (a === here ? -1 : b === here ? 1 : 0));
  sheet('<h2>Help</h2>' + order.map((id) => '<div class="label" style="margin-top:6px">' + esc(HELP.SCREENS.find((s) => s[0] === id)[1]) + '</div>' +
    HELP.forScreen(id).map((h) => '<details' + (id === here ? ' open' : '') + '><summary>' + esc(h.title) + '</summary>' + h.text.map((t) => '<p>' + esc(t) + '</p>').join('') + '</details>').join('')).join('') +
    '<button type="button" class="btn" data-act="close">Close</button>');
}

/* ---- taps ---- */
acts.go = (d) => { if (d.from) ui.from = d.from; if (d.to === 'after') ui.after = freshAfter(); go(d.to); };
acts.close = () => closeSheet();
acts['notify-allow'] = () => { closeSheet(); NOTIFY.ask().then(() => render()); };
acts.help = () => helpSheet();
acts.line = (d) => { ui.open[d.i] = !ui.open[d.i]; render(); };
acts.earlier = () => { ui.earlier = !ui.earlier; render(); $('body').scrollTop = 0; };
acts.signin = () => { ui.notice = ''; ms.signIn(false).catch((e) => { ui.notice = 'The sign-in could not start: ' + e.message; render(); }); };
acts['signout-ask'] = () => ask('Sign out on this phone? Nothing already tapped is lost: it stays on the phone and is sent after the next sign-in.', 'Sign out', 'signout', null, 'Stay signed in');
acts.signout = () => { closeSheet(); ms.signOut(); auth.signedIn = false; auth.name = ''; render(); };
acts['person-add'] = () => { const s = snap(), name = ui.newName; attempt(() => { record(ST.addPerson(s.events, store.device, store.by(), s.L, name, now())); ui.newName = ''; }); if ($('newname')) $('newname').focus(); };
acts['person-remove'] = (d) => { const s = snap(); attempt(() => record(ST.removePerson(s.events, store.device, store.by(), s.L, d.name, now()))); };
inputs.newname = (v) => { ui.newName = v; };
acts.going = (d) => { const s = snap(); attempt(() => record(ST.stillGoing(s.events, store.device, store.by(), s.L, d.id, d.check, now()))); };
acts['keep-stop'] = (d) => { const s = snap(); attempt(() => record(ST.editTimer(s.events, store.device, store.by(), s.L, d.id, { stop: d.at }, now()))); };
/* the trip form (screen 5) */
acts['trip-who'] = (d) => {
  const s = snap(), f = ui.trip, has = f.people.findIndex((x) => x.toLowerCase() === d.name.toLowerCase());
  if (has >= 0) { f.people.splice(has, 1); if (f.driver && f.driver.toLowerCase() === d.name.toLowerCase()) f.driver = null; render(); return; }
  const st = VIEW.nameStates(s.names, s.timers, ui.job.name, ui.op).find((n) => n.name === d.name);
  if (st && st.state === 'busy' && !f.stopOther) {
    /* a name already on another timer: syntratime.js refuses the start and says where; the screen asks first, as on screen 3 */
    try { ST.startTrip(s.events, store.device, store.by() || '?', s.L, { job: ui.job.name, jobTyped: !!ui.job.typed, op: ui.op, people: [d.name], driver: d.name, vehicle: ST.OWN_VEHICLE }, now()); }
    catch (e) { if (e.busy) { ask(e.message, /Pause /.test(e.message) ? 'Pause and start the trip' : 'Stop that timer and start the trip', 'trip-who-stop', { name: d.name }, 'Not now'); return; } }
  }
  f.people.push(d.name); render();
};
acts['trip-who-stop'] = (d) => { closeSheet(); ui.trip.people.push(d.name); ui.trip.stopOther = true; render(); };
acts['trip-driver'] = (d) => { ui.trip.driver = ui.trip.driver && ui.trip.driver.toLowerCase() === d.name.toLowerCase() ? null : d.name; render(); };
acts['trip-vehicle'] = (d) => { ui.trip.vehicle = ui.trip.vehicle && ui.trip.vehicle.toLowerCase() === d.name.toLowerCase() ? null : d.name; render(); };
inputs['trip-odo'] = (v) => { ui.trip.odo = v; };
inputs['trip-note'] = (v) => { ui.trip.note = v; };
acts['trip-start'] = () => {
  const s = snap(), f = ui.trip, job = ui.job || { name: null, typed: false}, alone = !s.names.length;
  try {
    ui.error = '';
    record(ST.startTrip(s.events, store.device, store.by(), s.L, { job: job.name, jobTyped: !!job.typed, op: ui.op, people: alone ? undefined : f.people, driver: f.driver || undefined, vehicle: f.vehicle, odoOut: odoValue(f.odo), note: f.note, stopOther: f.stopOther }, now()));
    ui.trip = null; ui.job = null; ui.search = ''; go('home'); sync(); maybeAskNotify();
  } catch (e) { ui.error = e.message; render(); }
};
acts['vehicle-add'] = () => { const s = snap(), name = ui.newVehicle; attempt(() => { record(ST.addVehicleHere(s.events, store.device, store.by(), s.L, name, now())); ui.newVehicle = ''; }); if ($('newvehicle')) $('newvehicle').focus(); };
acts['vehicle-remove'] = (d) => { const s = snap(); attempt(() => { record(ST.removeVehicleHere(s.events, store.device, store.by(), s.L, d.name, now())); if (ui.trip && ui.trip.vehicle && ui.trip.vehicle.toLowerCase() === d.name.toLowerCase()) ui.trip.vehicle = null; }); };
inputs.newvehicle = (v) => { ui.newVehicle = v; };
acts['back-stop'] = () => {
  const s = snap(), b = ui.back, tr = ST.tripsFrom(s.timers).find((x) => x.trip === b.trip), driverOut = s.timers.find((t) => t.trip === b.trip && t.running && t.driver);
  const driverBack = !!driverOut && b.back.some((x) => x.toLowerCase() === driverOut.person.toLowerCase());
  try {
    ui.error = ''; const evs = [];
    if (tr && String(b.note).trim() !== String(tr.note || '').trim()) evs.push(ST.editTimer(s.events, store.device, store.by(), s.L, tr.timers[0], { note: b.note }, now()));
    const base = s.events.concat(evs);
    evs.push.apply(evs, ST.stopTrip(base, store.device, store.by(), s.L, b.trip, { people: b.back, odoBack: driverBack ? odoValue(b.odo) : '' }, now()));
    record(evs); ui.back = null; go('home'); sync();
  } catch (e) { ui.error = e.message; render(); }
};
inputs['back-who'] = (v, el) => {
  const b = ui.back, n = el.dataset.name, i = b.back.findIndex((x) => x.toLowerCase() === n.toLowerCase());
  if (el.checked && i < 0) b.back.push(n); else if (!el.checked && i >= 0) b.back.splice(i, 1);
  render();
};
inputs['back-odo'] = (v) => { ui.back.odo = v; const s = snap(), b = ui.back, trip = ST.tripsFrom(s.timers).find((x) => x.trip === b.trip); if (trip && $('backline')) $('backline').innerHTML = backLine(s, b, trip, true); };
inputs['back-note'] = (v) => { ui.back.note = v; };
acts.timer = (d) => { ui.edit = { id: d.id, set: {}, from: ui.view }; go('timer'); };
acts['timer-back'] = () => { const from = ui.edit && ui.edit.from || 'home'; ui.edit = null; go(from === 'timer' ? 'home' : from); };
const editDone = () => { const from = ui.edit && ui.edit.from || 'home'; ui.edit = null; go(from === 'timer' ? 'home' : from); sync(); };
acts['timer-save'] = () => {
  const s = snap(), e = ui.edit;
  try { ui.error = ''; record(ST.editTimer(s.events, store.device, store.by(), s.L, e.id, e.set, now())); editDone(); } catch (err) { ui.error = err.message; render(); }
};
acts['timer-right'] = () => { const s = snap(), e = ui.edit; try { ui.error = ''; record(ST.editTimer(s.events, store.device, store.by(), s.L, e.id, { checked: true }, now())); editDone(); } catch (err) { ui.error = err.message; render(); } };
acts['timer-mistake'] = () => ask('Mark this timer as started by mistake? It is kept and shown, and it is not counted. You can count it again later.', 'Started by mistake', 'timer-mistake-yes', {}, 'Not now');
acts['timer-mistake-yes'] = () => { closeSheet(); const s = snap(), e = ui.edit; try { ui.error = ''; record(ST.editTimer(s.events, store.device, store.by(), s.L, e.id, { cancelled: true }, now())); editDone(); } catch (err) { ui.error = err.message; render(); } };
acts['timer-unmistake'] = () => { const s = snap(), e = ui.edit; try { ui.error = ''; record(ST.editTimer(s.events, store.device, store.by(), s.L, e.id, { cancelled: false }, now())); editDone(); } catch (err) { ui.error = err.message; render(); } };
inputs['timer-note'] = (v) => { ui.edit.set.note = v; $('bar').querySelector('[data-act=timer-save]').disabled = false; };
inputs['timer-remake'] = (v, el) => { ui.edit.set.remake = el.checked; render(); };
/* the pickers: each is a sheet; what is picked goes into the draft */
const pickRow = (label, act, extra) => '<button type="button" class="pick" data-act="' + act + '" data-name="' + esc(label) + '"' + (extra || '') + '><span class="grow">' + esc(label) + '</span></button>';
acts['timer-pick-job'] = () => {
  const s = snap(), c = VIEW.jobChoices(s.timers, s.L);
  sheet('<h2>Job</h2>' + pickRow(ST.SHOP_NO_JOB, 'timer-set-job', ' data-none="1"') + c.map((x) => pickRow(x.job, 'timer-set-job', x.listed ? '' : ' data-known="1"')).join('') +
    '<label class="field"><span class="step">Or type a job that is not on the list</span><input type="text" class="input" id="pickjob" data-input="pickjob" autocomplete="off"></label>' +
    '<div class="two"><button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn go" data-act="timer-set-job" data-typed="1">Use this name</button></div>');
};
inputs.pickjob = () => {};
acts['timer-set-job'] = (d) => {
  const e = ui.edit;
  if (d.typed) { const v = ($('pickjob').value || '').trim(); if (!v) return; e.set.job = v; e.set.jobTyped = true; }
  else if (d.none) { e.set.job = null; e.set.jobTyped = false; } else { e.set.job = d.name; e.set.jobTyped = !!d.known; }
  closeSheet(); render();
};
acts['timer-pick-op'] = () => {
  const s = snap(), T = timerNow(s, ui.edit.id), ops = s.L.operations.filter((o) => o.out === T.out && !o.mode);
  sheet('<h2>What</h2>' + ops.map((o) => pickRow(o.name, 'timer-set-op')).join('') + '<button type="button" class="btn" data-act="close">Cancel</button>');
};
acts['timer-set-op'] = (d) => { ui.edit.set.op = d.name; closeSheet(); render(); };
acts['timer-pick-who'] = () => { const s = snap(); sheet('<h2>Who</h2>' + s.names.map((n) => pickRow(n, 'timer-set-who')).join('') + '<button type="button" class="btn" data-act="close">Cancel</button>'); };
acts['timer-set-who'] = (d) => { ui.edit.set.person = d.name; closeSheet(); render(); };
/* who is working, picked in a sheet: one or more names, each tapped on or off, then Done (a timer's Who, and Add time after) */
function whoSheet(title, chosen, doneAct) {
  const names = snap().names; ui.picking = chosen.filter((x) => names.some((n) => n.toLowerCase() === x.toLowerCase()));
  ui.pickDraw = () => sheet('<h2>' + title + '</h2><div class="step">Pick one or more</div><div class="cardgrid">' + names.map((n) => { const on = ui.picking.some((x) => x.toLowerCase() === n.toLowerCase());
    return '<button type="button" class="opbtn' + (on ? ' chosen" aria-pressed="true' : '') + '" data-act="pick-who" data-name="' + esc(n) + '">' + (on ? CHK : '') + '<span>' + esc(n) + '</span></button>'; }).join('') + '</div>' +
    '<div class="two"><button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn go" data-act="' + doneAct + '"' + (ui.picking.length ? '' : ' disabled') + '>Done</button></div>');
  ui.pickDraw();
}
acts['pick-who'] = (d) => { const i = ui.picking.findIndex((x) => x.toLowerCase() === d.name.toLowerCase()); if (i >= 0) ui.picking.splice(i, 1); else ui.picking.push(d.name); ui.pickDraw(); };
acts['timer-pick-workers'] = () => { const s = snap(), T = trialEdit(s, ui.edit.id, ui.edit.set).T; whoSheet('Who is working', T.workers.map((w) => w.name), 'timer-set-workers'); };
acts['timer-set-workers'] = () => { ui.edit.set.workers = ui.picking.slice(); closeSheet(); render(); };
/* Labels, sheet by sheet: each sheet keeps the answer given while it was unloaded; each can be turned On or Off, and Done keeps the draft for Save the changes */
function labelsSheet() {
  const s = snap(), T = trialEdit(s, ui.edit.id, ui.edit.set).T, cuts = T.cnc.stretches.map((x, i) => [x, T.cnc.stretches[i + 1]]).filter(([x]) => x.what === 'cutting');
  const d = ui.labDraft;
  sheet('<h2>Labels, sheet by sheet</h2><p class="small">Each sheet keeps the answer given while it was unloaded.</p>' + d.map((on, i) => {
    const [cut, unload] = cuts[i], when = unload ? 'unloaded ' + ST.showClock(cut.stop, zone()) : 'cut ' + ST.showClock(cut.stop, zone()) + ', not unloaded';
    return '<div class="wline"><span class="grow"><span class="wn">Sheet ' + (i + 1) + '</span><span class="pz" style="color:var(--muted)">' + esc(when) + '</span></span>' + labelSeg(on, false, 'lab-sheet', ' data-n="' + i + '"') + '</div>';
  }).join('') + '<div class="two"><button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn go" data-act="timer-set-labels">Done</button></div>');
}
acts['timer-pick-labels'] = () => { const T = trialEdit(snap(), ui.edit.id, ui.edit.set).T; ui.labDraft = T.labels.sheets.map((x) => x.on === true); labelsSheet(); };
acts['lab-sheet'] = (d) => { ui.labDraft[+d.n] = d.to === 'on'; labelsSheet(); };
acts['timer-set-labels'] = () => { ui.edit.set.sheetLabels = ui.labDraft.slice(); ui.labDraft = null; closeSheet(); render(); };
acts['timer-pick-machine'] = () => { const s = snap(); sheet('<h2>Machine</h2>' + s.L.machines.map((n) => pickRow(n, 'timer-set-machine')).join('') + '<button type="button" class="btn" data-act="close">Cancel</button>'); };
acts['timer-set-machine'] = (d) => { ui.edit.set.machine = d.name; closeSheet(); render(); };
acts['timer-pick-work'] = () => sheet('<h2>Kind of work</h2>' + ST.MAINTENANCE_KINDS.map((n) => pickRow(n, 'timer-set-work')).join('') + '<button type="button" class="btn" data-act="close">Cancel</button>');
acts['timer-set-work'] = (d) => { ui.edit.set.work = d.name; closeSheet(); render(); };
/* "Stop at the last check-in": the stop corrected to the last moment anyone confirmed the work was going */
acts['timer-checkin-stop'] = () => { const s = snap(), e = ui.edit; try { ui.error = ''; record(ST.stopAtCheckin(s.events, store.device, store.by(), s.L, e.id, now())); editDone(); } catch (err) { ui.error = err.message; render(); } };
function pickTime(which) {
  const s = snap(), T = trialEdit(s, ui.edit.id, ui.edit.set).T, iso = T[which] || new Date(now()).toISOString();
  sheet('<h2>' + (which === 'start' ? 'Started' : 'Stopped') + '</h2><label class="field"><span class="step">Day</span><input type="date" class="input" id="pickday" value="' + esc(ST.localDay(iso, zone())) + '"></label>' +
    '<label class="field"><span class="step">Time</span><input type="time" class="input" id="pickclock" value="' + esc(localClockOf(iso)) + '"></label>' +
    '<div class="two"><button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn go" data-act="timer-set-time" data-which="' + which + '">Set</button></div>');
}
acts['timer-pick-start'] = () => pickTime('start');
acts['timer-pick-stop'] = () => pickTime('stop');
acts['timer-set-time'] = (d) => {
  const day = $('pickday').value, clock = $('pickclock').value; if (!day || !clock) return;
  ui.edit.set[d.which] = new Date(ST.atLocal(day, clock, zone())).toISOString(); closeSheet(); render();
};
function pickOdo(which) {
  const s = snap(), T = timerNow(s, ui.edit.id);
  sheet('<h2>' + (which === 'odoOut' ? 'Odometer leaving' : 'Odometer back') + '</h2><label class="field"><span class="step">In km</span><input type="text" class="input" inputmode="numeric" id="pickodo" value="' + esc(T[which] === null ? '' : String(T[which])) + '"></label>' +
    '<div class="two"><button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn go" data-act="timer-set-odo" data-which="' + which + '">Set</button></div>');
}
acts['timer-pick-odoOut'] = () => pickOdo('odoOut');
acts['timer-pick-odoBack'] = () => pickOdo('odoBack');
acts['timer-set-odo'] = (d) => { ui.edit.set[d.which] = odoValue($('pickodo').value); closeSheet(); render(); };
acts['after-labels'] = (d) => { ui.after.labels = d.to === 'on'; render(); };
acts['after-add'] = () => {
  const s = snap(), tr = afterTrial(s, ui.after);
  try {
    if (!tr.ready) throw new Error(tr.problem || 'Fill in what is missing first.');
    ui.error = ''; const evs = ST.typedTimer(s.events, store.device, store.by(), s.L, afterFields(s, ui.after), now());
    store.add(evs); store.note('Added ' + ST.showMinutes(tr.T.minutes) + ' after: ' + evs[0].op + ': ' + evs[0].workers.join(', ') + ', ' + VIEW.dayName(ST.localDay(evs[0].at, zone())), { detail: evs[0].id + ' start typed, ' + evs[1].id + ' stop typed', timer: evs[0].id });
    if (s.names.length) store.pref('who', ui.after.who.slice());
    ui.after = null; go('home'); sync();
  } catch (e) { ui.error = e.message; render(); }
};
function afterFields(s, a) {
  const f = Object.assign(afterBase(s, a), { at: new Date(ST.atLocal(a.day, a.clock, zone())).toISOString() });
  const m = VIEW.parseLength(a.length); if (m !== null) f.minutes = m; else f.until = new Date(ST.atLocal(a.day, a.stopClock, zone())).toISOString();
  return f;
}
inputs['after-note'] = (v) => { ui.after.note = v; };
inputs['after-remake'] = (v, el) => { ui.after.remake = el.checked; render(); };
acts['after-pick-job'] = () => {
  const s = snap(), c = VIEW.jobChoices(s.timers, s.L);
  sheet('<h2>Job</h2>' + pickRow(ST.SHOP_NO_JOB, 'after-set-job', ' data-none="1"') + c.map((x) => pickRow(x.job, 'after-set-job', x.listed ? '' : ' data-known="1"')).join('') +
    '<label class="field"><span class="step">Or type a job that is not on the list</span><input type="text" class="input" id="pickjob" data-input="pickjob" autocomplete="off"></label>' +
    '<div class="two"><button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn go" data-act="after-set-job" data-typed="1">Use this name</button></div>');
};
acts['after-set-job'] = (d) => {
  const a = ui.after;
  if (d.typed) { const v = ($('pickjob').value || '').trim(); if (!v) return; a.job = v; a.jobTyped = true; } else if (d.none) { a.job = null; a.jobTyped = false; } else { a.job = d.name; a.jobTyped = !!d.known; }
  closeSheet(); render();
};
acts['after-pick-op'] = () => { const s = snap(); sheet('<h2>What</h2>' + afterOps(s.L).map((o) => pickRow(o.name, 'after-set-op')).join('') + '<div class="small">A trip out of the shop is started and stopped as a trip. The CNC and Maintenance are timed live, on their own screens.</div><button type="button" class="btn" data-act="close">Cancel</button>'); };
acts['after-set-op'] = (d) => { ui.after.op = d.name; closeSheet(); render(); };
acts['after-pick-who'] = () => whoSheet('Who', ui.after.who, 'after-set-who');
acts['after-set-who'] = () => { ui.after.who = ui.picking.slice(); closeSheet(); render(); };
/* Day, Started, Stopped and How long are picked on the wheel (wheel.js; owner, 22 Nov 2026): the same three columns for each, a bar that stays and numbers that move under it */
function wheelSheet(title, kind, value, act) {
  sheet('<h2>' + esc(title) + '</h2><div id="wheelhost"></div><div class="two"><button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn go" data-act="' + act + '">Set</button></div>');
  ui.wheel = Wheel[kind]($('wheelhost'), value);
}
acts['after-pick-day'] = () => wheelSheet('Day', 'date', ui.after.day, 'after-set-day');
acts['after-set-day'] = () => { const v = ui.wheel && ui.wheel.value(); if (v) ui.after.day = v; closeSheet(); render(); };
acts['after-pick-clock'] = () => wheelSheet('Started', 'clock', ui.after.clock || '08:00', 'after-set-clock');
acts['after-set-clock'] = () => { const v = ui.wheel && ui.wheel.value(); if (v) ui.after.clock = v; closeSheet(); render(); };
acts['after-pick-stop'] = () => wheelSheet('Stopped', 'clock', ui.after.stopClock || '12:00', 'after-set-stop');
acts['after-set-stop'] = () => { const v = ui.wheel && ui.wheel.value(); if (v) { ui.after.stopClock = v; ui.after.length = ''; } closeSheet(); render(); };
acts['after-pick-length'] = () => wheelSheet('How long', 'length', VIEW.parseLength(ui.after.length) || 60, 'after-set-length');
acts['after-set-length'] = () => { const m = ui.wheel ? ui.wheel.value() : 0; ui.after.length = m > 0 ? String(m) : ''; if (m > 0) ui.after.stopClock = ''; closeSheet(); render(); };
acts.job = (d) => { ui.job = d.none ? { name: null, typed: false } : { name: d.name, typed: !!d.typed }; ui.search = ''; go('timed'); };       /* the search has done its work: the list is whole again next time */
acts.op = (d) => {
  const s = snap(), op = s.L.operations.find((o) => o.name === d.name); if (!op) return;
  if (op.out) { ui.op = op.name; ui.trip = freshTrip(); go('trip'); return; }
  /* no timer starts on the first tap, machines included (owner, 19 and 21 Nov 2026): every operation opens the Start screen; Maintenance asks for its machine and kind first */
  ui.op = op.name; ui.form = fresh();
  if (op.mode === 'maintenance') { ui.maint = { machine: null, work: null }; go('maint'); return; }
  ui.maint = null; go('op');
};
/* a running task tapped on the home screen opens its card: the workers with their own Pause, the CNC's buttons, and the Start screen for another timer there */
acts.open = (d) => {
  const t = snap().timers.find((x) => x.id === d.id); if (!t) return;
  ui.job = { name: t.job, typed: t.jobTyped }; ui.op = t.op; ui.form = fresh(); ui.maint = t.mode === 'maintenance' ? { machine: t.machine, work: t.work } : null;
  go('op');
};
acts['m-machine'] = (d) => { ui.maint.machine = d.name; render(); };
acts['m-work'] = (d) => { ui.maint.work = d.name; render(); };
acts['m-next'] = () => go('op');
acts.who = (d) => {
  const w = ui.form.who, i = w.findIndex((x) => x.toLowerCase() === d.name.toLowerCase()), names = snap().names;
  if (i >= 0) w.splice(i, 1); else w.push(d.name);
  w.sort((a, b) => names.indexOf(a) - names.indexOf(b));       /* named in the order of the list, whatever order they were tapped in */
  render();
};
/* Start. A second timer on the same operation and job asks first (mockup 5), and what is chosen is done as one action by syntratime.js. */
function startFields(s, second) {
  const job = ui.job || { name: null, typed: false }, f = ui.form;
  return Object.assign({ job: job.name, jobTyped: !!job.typed, op: ui.op, workers: s.names.length ? f.who : undefined, note: f.note, remake: f.remake }, ST.labelsWay(s.L, ui.op) ? { labels: f.labels } : {}, ui.maint || {}, second ? { second } : {});
}
function secondSheet(s, ids) {
  const first = s.timers.filter((t) => ids.includes(t.id)), t = first[0], many = first.length > 1, full = 'min-height:52px;font-size:16px;flex:none';
  sheet('<p><b>' + esc(ui.op) + ' is already running here.</b></p><p class="small">' + esc(many ? first.length + ' timers: ' + first.map((x) => ST.whoOf(x)).join('; ') : VIEW.jobWords(t.job) + ' · ' + ST.whoOf(t) + ' · ' + ST.showMinutes(t.minutes)) + '. What would you like to do?</p>' +
    '<button type="button" class="btn go" data-act="start" data-second="second" style="' + full + '">' + (many ? 'Start another timer' : 'Start a second timer') + '</button>' +
    '<button type="button" class="btn" data-act="start" data-second="stop" style="' + full + '">' + (many ? 'Stop them, then start this one' : 'Stop the first, then start this one') + '</button>' +
    '<button type="button" class="btn warn" data-act="start" data-second="cancel" style="' + full + '">' + (many ? 'Cancel them: they were started by mistake' : 'Cancel the first: it was started by mistake') + '</button>' +
    '<button type="button" class="btn" data-act="close" style="' + full + ';color:var(--muted)">Not now</button>');
}
acts.start = (d) => {
  const s = snap();
  try {
    ui.error = '';
    record(ST.startTimer(s.events, store.device, store.by(), s.L, startFields(s, d && d.second), now()));
    if (s.names.length) store.pref('who', ui.form.who.slice());
    ui.form = fresh(); closeSheet(); render(); sync(); maybeAskNotify();
  } catch (e) {
    if (e.same && !(d && d.second)) { secondSheet(s, e.same); return; }
    closeSheet(); ui.error = e.message; render();
  }
};
acts['start-labels'] = (d) => { ui.form.labels = d.to === 'on'; render(); };
acts['cnc-labels'] = (d) => { const s = snap(); attempt(() => record(ST.setLabels(s.events, store.device, store.by(), s.L, d.id, d.to === 'on', now()))); };
acts.stop = (d) => {
  const s = snap(), t = s.timers.find((x) => x.id === d.id);
  if (t && t.trip) {
    const out = s.timers.filter((x) => x.trip === t.trip && x.running && !x.cancelled);
    if (out.length > 1 || t.driver) { ui.back = { trip: t.trip, back: out.map((x) => x.person), odo: '', note: null }; go('tripstop'); return; }
  }
  attempt(() => record(ST.stopTimer(s.events, store.device, store.by(), s.L, d.id, {}, now())));
};
/* Pause and Resume: the whole task, or one worker on it */
const doTo = (fn) => (d) => { const s = snap(); attempt(() => record(fn(s, d))); };
acts.pause = doTo((s, d) => ST.pauseTimer(s.events, store.device, store.by(), s.L, d.id, null, now()));
acts.resume = doTo((s, d) => ST.resumeTimer(s.events, store.device, store.by(), s.L, d.id, null, now()));
acts['w-pause'] = doTo((s, d) => ST.pauseTimer(s.events, store.device, store.by(), s.L, d.id, d.name, now()));
acts['w-resume'] = doTo((s, d) => ST.resumeTimer(s.events, store.device, store.by(), s.L, d.id, d.name, now()));
/* the CNC's two buttons: a tap on the one that is not running switches to it; the one running is already on */
acts.cnc = (d) => { const s = snap(), t = s.timers.find((x) => x.id === d.id); if (!t || !t.cnc || t.cnc.now === d.to) return; attempt(() => record(ST.switchCnc(s.events, store.device, store.by(), s.L, d.id, d.to, now()))); };
acts['cnc-undo'] = doTo((s, d) => ST.undoSwitch(s.events, store.device, store.by(), s.L, d.id, now()));
/* the end-of-day check of this phone (mockup 9): On / Off, and its time. Turning it off asks first. */
const eodSet = (change) => { const s = snap(); closeSheet(); attempt(() => record(ST.setEndOfDay(s.events, store.device, store.by(), change, now()))); };
acts['eod-on'] = () => { const s = snap(); if (!ST.endOfDayOf(s.events, store.device, now()).on) eodSet({ on: true }); };
acts['eod-off'] = () => {
  const s = snap(), e = VIEW.endOfDay(s.events, store.device, now(), zone()); if (!e.on) return;
  sheet('<p>Turn the end-of-day check off on this phone?</p><p class="small">Nothing will ask at ' + esc(e.clock) + '. A forgotten timer then runs until midnight asks. You can turn it on again here at any time.</p>' +
    '<div class="two"><button type="button" class="btn" data-act="close">Keep it on</button><button type="button" class="btn warn" data-act="eod-off-yes">Turn it off</button></div>');
};
acts['eod-off-yes'] = () => eodSet({ on: false });
acts['eod-time'] = () => { const s = snap();
  sheet('<h2>End-of-day check</h2><label class="field"><span class="step">The time this phone asks "still going?"</span><input type="time" class="input" id="pickclock" value="' + esc(ST.endOfDayOf(s.events, store.device, now()).at) + '"></label>' +
    '<p class="small">It is for the timers started on this phone. Midnight always asks, whatever is set here.</p><div class="two"><button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn go" data-act="eod-time-set">Set</button></div>'); };
acts['eod-time-set'] = () => { const v = $('pickclock').value; if (!v) return; const s = snap(); if (ST.endOfDayOf(s.events, store.device, now()).at === v) { closeSheet(); return; } eodSet({ at: v }); };
inputs.search = (v) => { ui.search = v; $('jobs').innerHTML = jobsMarkup(); };
inputs.note = (v) => { ui.form.note = v; };
inputs.remake = (v, el) => { ui.form.remake = el.checked; };
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.matches && ev.target.matches('#newname')) { acts['person-add'](); return; }
  if (ev.key === 'Enter' && ev.target.matches && ev.target.matches('#newvehicle')) { acts['vehicle-add'](); return; }
  if (ev.key !== 'Enter' || !ev.target.matches || !ev.target.matches('#search')) return;
  const s = snap(), c = VIEW.jobChoices(s.timers, s.L), n = VIEW.newJob(c, ui.search), shown = VIEW.filterJobs(c, ui.search);
  if (shown.length === 1) acts.job({ name: shown[0].job, typed: shown[0].listed ? '' : '1' }); else if (n && !shown.length) acts.job({ name: n, typed: '1' });
});
/* the time on a running timer moves by itself, with seconds, so it can be seen to be going (owner, 19 Nov 2026). The seconds are worked out from the timer's start, each second,
   without reading the diaries again; every 15 seconds the screen is looked at properly: a timer that has stopped (the end-of-day check) leaves the list */
function tickSeconds() {
  for (const el of document.querySelectorAll('[data-ms]')) el.textContent = ST.showElapsed((Number(el.dataset.ms) + now() - Number(el.dataset.at)) / 60000);
}
let beat = 0;
function tick() {
  if (!$('sheet').hidden) return;
  const a = document.activeElement, typing = a && a.matches && a.matches('input[type=text],textarea');
  if ((ui.view === 'home' || ui.view === 'op') && !typing) { render(); return; }      /* looked at properly: a timer the check has stopped leaves the list, and each worker's own minutes move on */
  if (ui.view === 'home') $('top').innerHTML = screens.home().top;
}
setInterval(() => { if (document.hidden) return; tickSeconds(); if (++beat % 15 === 0) tick(); }, 1000);
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]'); if (!el || el.disabled) return;
  const f = acts[el.dataset.act]; if (f) { ev.preventDefault(); f(el.dataset, el, ev); }
});
document.addEventListener('input', (ev) => { const el = ev.target.closest('[data-input]'); if (el && inputs[el.dataset.input]) inputs[el.dataset.input](el.value, el); });

/* the family's start-up screen (owner, 21 Nov 2026; mockup 10): the same screen, for the same length of time, as SyntraQuote's (src/ui.js): the mark drawn on inside a dial,
   a line sweeping round it, the parts named one by one with a segment lit for each, then READY. A tap skips it; it stays still when the phone asks for less motion. */
const SPLASH_MS = 4000, SPLASH_STEPS = ['Sign-in', 'Jobs', 'Operations', 'Names', 'Timers', 'Saved'];
function splash() {
  if ($('splash')) return;
  try { if (localStorage.getItem('syntratime.splash') === 'off') return; } catch (e) { /* no storage: show it */ }
  let ticks = ''; for (let i = 0; i < 72; i++) { const a = i * 5 * Math.PI / 180, r1 = 122, r2 = i % 6 ? 117 : 112; ticks += '<line x1="' + (130 + r1 * Math.sin(a)).toFixed(1) + '" y1="' + (130 - r1 * Math.cos(a)).toFixed(1) + '" x2="' + (130 + r2 * Math.sin(a)).toFixed(1) + '" y2="' + (130 - r2 * Math.cos(a)).toFixed(1) + '"/>'; }
  const mk = '<svg viewBox="0 0 32 32" fill="none" stroke-linecap="round" aria-hidden="true"><path class="sp-draw" pathLength="1" d="M22.6 9.4A9 9 0 1 0 22.6 22.6" stroke="var(--mark)" stroke-width="2.6"/><path class="sp-draw" pathLength="1" d="M15.6 16H24.4" stroke="var(--mark-bar)" stroke-width="2"/><circle class="sp-pip" cx="24.4" cy="16" r="1.9" fill="var(--mark-bar)"/></svg>';
  const el = document.createElement('div'); el.id = 'splash'; el.setAttribute('role', 'status');
  el.innerHTML = '<i class="sp-c tl"></i><i class="sp-c tr"></i><i class="sp-c bl"></i><i class="sp-c br"></i><div class="sp-in"><div class="sp-dial"><svg viewBox="0 0 260 260" aria-hidden="true"><g class="sp-ticks">' + ticks + '</g><circle class="sp-ring" cx="130" cy="130" r="104"/><circle class="sp-arc" cx="130" cy="130" r="104" pathLength="100" transform="rotate(-90 130 130)"/></svg><span class="sp-mark">' + mk + '</span></div>'
    + '<b>SyntraTime</b><em>Start it. Stop it. Know it.</em><div class="sp-st" id="splashSt"></div><div class="sp-seg">' + '<i></i>'.repeat(SPLASH_STEPS.length) + '</div></div>'
    + '<div class="foot"><span>' + esc(VERSION.toUpperCase()) + '</span><span>Tap to skip</span><span></span></div>';
  document.body.appendChild(el);
  const st = el.querySelector('#splashSt'), seg = [...el.querySelectorAll('.sp-seg i')], still = matchMedia('(prefers-reduced-motion: reduce)').matches, T = [];
  const say = (txt, ready) => { st.classList.remove('in'); void st.offsetWidth; st.textContent = txt; st.classList.toggle('ready', !!ready); st.classList.add('in'); };
  if (still) { seg.forEach((x) => x.classList.add('on')); say('READY', true); el.classList.add('done'); }
  else {
    void el.getBoundingClientRect(); getComputedStyle(el.querySelector('.sp-arc')).strokeDashoffset;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('go')));
    const step = (SPLASH_MS - 900) / (SPLASH_STEPS.length + 1);
    SPLASH_STEPS.forEach((n, i) => T.push(setTimeout(() => { if (el.isConnected) { say(n.toUpperCase()); seg[i].classList.add('on'); } }, 300 + i * step)));
    T.push(setTimeout(() => { if (el.isConnected) say('READY', true); }, 300 + SPLASH_STEPS.length * step));
  }
  const gone = () => { T.forEach(clearTimeout); el.classList.add('out'); setTimeout(() => el.remove(), 380); el.removeEventListener('click', gone); };
  T.push(setTimeout(gone, SPLASH_MS)); el.addEventListener('click', gone);
}

/* ---- who is signed in, and sending ---- */
async function refreshAuth() {
  const w = await ms.who();
  auth.signedIn = w.signedIn; auth.checked = true;
  if (w.name) { auth.name = w.name; store.setBy(w.name); } else if (!w.signedIn) auth.name = '';
  else auth.name = auth.name || store.by() || '';
  return auth;
}
let syncing = false, syncAgain = false;
async function sync() {
  if (syncing) { syncAgain = true; return; }        /* a tap made during a trip to OneDrive gets a second trip straight after it, not a wait for the next check */
  syncing = true;
  try {
    do {
      syncAgain = false;
      await refreshAuth();
      if (!auth.signedIn && !store.pending()) return;
      await store.sync();
      render();
    } while (syncAgain);
  } finally { syncing = false; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
/* the page is exactly as high as the phone shows it, so the bottom bar is never under the phone's own buttons or toolbar: 100dvh is taller than what is seen on some phones (owner, 22 Nov 2026) */
const fitHeight = () => document.documentElement.style.setProperty('--vh', Math.round((window.visualViewport && window.visualViewport.height) || innerHeight) + 'px');
fitHeight(); addEventListener('resize', fitHeight); addEventListener('orientationchange', fitHeight); if (window.visualViewport) window.visualViewport.addEventListener('resize', fitHeight);
addEventListener('online', () => sync());
addEventListener('storage', (e) => { if (e.key === 'syntratime.tokens') refreshAuth().then(render); });        /* a sign-in finished in the other window shows here at once */
setInterval(() => { if (!document.hidden) sync(); }, 60000);
setInterval(() => NOTIFY.refresh(), 60000);        /* the notifications are looked at once a minute, in front or behind, for as long as the phone keeps the page alive */
document.addEventListener('visibilitychange', () => { if (!document.hidden) NOTIFY.drain().then(() => NOTIFY.refresh()); });

(async () => {
  let back = null;
  try { back = await ms.comeBack(); } catch (e) { ui.notice = e.message; ui.view = 'what'; }
  if (back === 'in' || back === 'choose') ui.view = 'what';
  await refreshAuth();
  render();
  if (back === null && !auth.signedIn && ms.maybeSilent()) return;       /* Microsoft is being tried by itself: the page comes back from it */
  NOTIFY.init();
  if (back === null) splash();                                           /* not on the way back from the sign-in: he has just seen it */
  sync();
})();
window.__time = { ST, VIEW, store, ms, ui, auth, render, go, sync, now, tick, tickSeconds, snap, record, splash, NOTIFY };
})();
