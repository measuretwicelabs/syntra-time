/* store.js: what the phone keeps, and how it sends it (SyntraTime, the phone page; Linework docs/QUOTES_PLAN.md, section 6b; syntraquote docs/DATA.md, "SyntraTime").

   Every record is kept on the phone first and sent when the phone can reach OneDrive (owner, 18 Nov 2026: starting and stopping a timer never needs the sign-in or a signal,
   so a lapsed sign-in can delay a record but never lose one). This file is only the keeping and the sending: it holds no sum and no rule about hours. Every rule
   (the timers, the checks, the totals, the files and their names) is in syntratime.js, which this file calls.

   It knows nothing about screens or Microsoft. It is given a storage (the phone's own, or a pretend one in Node) and a drive: three small calls on the Time folder,
   get(path), put(path, text) and list(folder), each path inside the Time folder. A drive call that cannot be done throws an error with .kind: 'offline' (no signal),
   'signin' (Microsoft asks for a sign-in) or 'other' (OneDrive refused, in its own words). Tested in Node (tests/node/timestore.test.js) with a pretend drive. */
(function (root, make) {
  const S = make(typeof module === 'object' && module.exports ? require('./syntratime.js') : root.ST);
  if (typeof module === 'object' && module.exports) module.exports = S;
  else root.STORE = S;
})(typeof self !== 'undefined' ? self : this, function (ST) {
'use strict';

/* the page's own keys: the proof page's "syntratime.log" held something else, so the new log has a new name */
/* the diary and the lists changed shape on 21 Nov 2026 (version 2: one timer per task with its workers), so they are kept under new names and the phone takes a new device id: it starts
   a new diary and can never write over the old one. What was tapped before stays in OneDrive, untouched. The name signed in and What happened are kept as they were. */
const KEYS = { device: 'syntratime.device2', by: 'syntratime.by', own: 'syntratime.events2', saved: 'syntratime.saved2', others: 'syntratime.others2',
  etags: 'syntratime.etags2', lists: 'syntratime.lists2', what: 'syntratime.what', prefs: 'syntratime.prefs' };
/* kept from the other devices' diaries however old they are: a device's end-of-day setting (its timers follow it), and the names and vehicles added or removed on it */
const LASTING = ['eod', 'names', 'vehicles'];
const WINDOW_DAYS = 7;        /* how many days of the other devices' diaries the phone reads: a timer cannot run past a midnight unanswered, so a week is far more than it needs */
const LOG_KEEP = 1500;        /* lines of "What happened" kept on the phone */
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.([A-Z2-9]{4})\.json$/;

function createStore(deps) {
  const storage = deps.storage, clock = deps.now || (() => Date.now());
  const read = (k, d) => { try { const v = JSON.parse(storage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const write = (k, v) => storage.setItem(k, JSON.stringify(v));
  let device = read(KEYS.device, null);
  if (!device || !/^[A-Z2-9]{4}$/.test(device)) { device = ST.newDeviceId(); write(KEYS.device, device); }
  let by = read(KEYS.by, null), own = read(KEYS.own, []), others = read(KEYS.others, []), saved = new Set(read(KEYS.saved, [])),
    etags = read(KEYS.etags, {}), lists = read(KEYS.lists, null), log = read(KEYS.what, []), prefs = read(KEYS.prefs, {});
  let busy = null, again = false, failing = null, listsBad = '';
  const iso = () => new Date(clock()).toISOString();

  function note(text, more) {
    log.push({ at: iso(), text, detail: more && more.detail || '', odd: !!(more && more.odd), timer: more && more.timer || null });
    if (log.length > LOG_KEEP) log = log.slice(-LOG_KEEP);
    write(KEYS.what, log);
  }
  const events = () => own.concat(others);
  const pending = () => own.filter((e) => !saved.has(e.id)).length;
  function add(evs, text, detail) {
    const list = Array.isArray(evs) ? evs : [evs];
    if (!list.length) return;
    for (const e of list) own.push(e);
    write(KEYS.own, own);
    if (text) note(text, { detail: detail || list.map((e) => e.id + ' ' + e.type).join(', ') });
  }
  function setBy(name) { if (typeof name === 'string' && name.trim() && name.trim() !== by) { by = name.trim(); write(KEYS.by, by); } }
  const currentLists = () => lists || ST.starterLists();

  /* the files that still hold something not sent: each is the device's diary for one day, whole */
  function waitingFiles() {
    return ST.dayFiles(own, device, '').filter((f) => f.data.events.some((e) => !saved.has(e.id)));
  }
  function failed(e, count) {
    const kind = e && e.kind || 'other';
    const words = kind === 'offline' ? 'No signal' : kind === 'signin' ? 'Not signed in to Microsoft' : 'OneDrive did not take it';
    const what = count === 1 ? '1 record kept on the phone' : count + ' records kept on the phone';
    if (failing !== kind) {
      note(words + (count ? ': ' + what : '') + (kind === 'other' ? '. ' + (e && e.message || '') : ''), { odd: true, detail: (e && e.message) || '' });
      failing = kind;
    }
    return { ok: false, kind, error: (e && e.message) || '', sent: 0, read: 0 };
  }
  const cutoffDay = () => new Date(clock() - WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const months = () => { const a = new Date(clock()).toISOString().slice(0, 7), b = new Date(clock() - WINDOW_DAYS * 86400000).toISOString().slice(0, 7); return a === b ? [a] : [b, a]; };

  async function syncOnce() {
    const drive = deps.drive, rep = { ok: true, sent: 0, read: 0, lists: false, kind: null, error: '' };
    if (!drive) return rep;
    const before = pending();
    try {
      /* 1. send what waits, whole day files */
      const files = waitingFiles();
      for (const f of files) {
        await drive.put(f.path, JSON.stringify(f.data, null, 2) + '\n');
        for (const e of f.data.events) saved.add(e.id);
        write(KEYS.saved, [...saved]);
      }
      rep.sent = before - pending();
      if (files.length) {
        const n = rep.sent === 1 ? '1 record' : rep.sent + ' records';
        note(failing === 'offline' ? 'Signal back: ' + n + ' sent' : failing === 'signin' ? 'Signed in again: ' + n + ' sent' : failing === 'other' ? 'OneDrive took it again: ' + n + ' sent' : 'Saved today\'s diary to OneDrive',
          { detail: files.map((f) => f.path).join(', ') });
      } else if (failing) note(failing === 'offline' ? 'Signal back' : failing === 'signin' ? 'Signed in again' : 'OneDrive answers again');
      failing = null;
      /* 2. the lists SyntraQuote writes */
      const t = await drive.get(ST.PLACES.lists);
      if (t != null) {
        try {
          const r = ST.readFile(t);
          if (r.kind !== 'lists') throw new Error('This is not the lists file of SyntraTime.');
          const bad = ST.checkLists(r.data);
          if (bad.length) throw new Error(bad[0]);
          if (JSON.stringify(r.data) !== JSON.stringify(lists)) {
            lists = r.data; write(KEYS.lists, lists); rep.lists = true;
            const d = r.data, c = (n, one, many) => n + ' ' + (n === 1 ? one : many);
            note('Lists read from SyntraQuote: ' + [c(d.jobs.length, 'job', 'jobs'), c(d.operations.length, 'operation', 'operations'), c(d.names.length, 'name', 'names'), c(d.vehicles.length, 'vehicle', 'vehicles')].join(', '),
              { detail: ST.PLACES.lists + ', written ' + (d.written || 'no date') });
          }
          listsBad = '';
        } catch (e) { if (listsBad !== e.message) note('The lists from SyntraQuote could not be used: ' + e.message, { odd: true, detail: ST.PLACES.lists }); listsBad = e.message; }       /* said once, not at every look */
      }
      /* 3. the other devices' diaries of the last days (this phone's own diary is its own) */
      const cut = cutoffDay(); let changed = false;
      for (const m of months()) {
        const folder = ST.PLACES.records + '/' + m;
        for (const item of await drive.list(folder)) {
          const hit = DAY_FILE.exec(item.name || '');
          if (!hit || hit[1] < cut || hit[2] === device) continue;
          const path = folder + '/' + item.name;
          if (etags[path] && etags[path] === item.eTag) continue;
          const text = await drive.get(path);
          if (text == null) continue;
          try {
            const r = ST.readFile(text);
            if (r.kind !== 'day') throw new Error('This is not a SyntraTime day file.');
            const bad = ST.checkDay(r.data);
            const good = r.data.events.filter((e) => ST.eventProblems(e).length === 0);
            if (bad.length) note('A diary has something not right, and the rest of it was read: ' + path, { odd: true, detail: bad.join(' ') });
            const m2 = ST.mergeEvents(others, good);
            if (m2.clashes.length) note('A diary says something different from what the phone had: ' + m2.clashes.join(', '), { odd: true, detail: path });
            others = m2.events; changed = true; rep.read++;
            if (item.eTag) etags[path] = item.eTag;
          } catch (e) { note('A diary could not be read: ' + path, { odd: true, detail: e.message }); if (item.eTag) { etags[path] = item.eTag; write(KEYS.etags, etags); } }       /* said once: it is looked at again only when the file changes */
        }
      }
      if (changed) {
        others = others.filter((e) => e.made.slice(0, 10) >= cut || LASTING.includes(e.type));
        write(KEYS.others, others); write(KEYS.etags, etags);
      }
      return rep;
    } catch (e) {
      if (!e || !e.kind) { note('Something went wrong while sending: ' + (e && e.message || e), { odd: true }); return Object.assign(rep, { ok: false, kind: 'other', error: String(e && e.message || e) }); }
      return Object.assign(rep, failed(e, pending()));
    }
  }
  /* one trip to OneDrive at a time; a call made during one is answered by a second trip straight after it */
  async function sync() {
    if (busy) { again = true; return busy; }
    busy = (async () => { let r; do { again = false; r = await syncOnce(); } while (again); return r; })();
    try { return await busy; } finally { busy = null; }
  }

  /* small things this phone remembers between visits, such as the worker picked last time (owner, 21 Nov 2026: the Start screen comes filled in with it) */
  function pref(name, value) { if (value === undefined) return prefs[name]; prefs[name] = value; write(KEYS.prefs, prefs); return value; }

  return { device, KEYS, events, add, pending, note, sync, lists: currentLists, setBy, by: () => by, pref, waiting: () => waitingFiles().length,
    log: () => log.slice(), mine: () => own.slice(), hasLists: () => !!lists, windowDays: WINDOW_DAYS };
}

return { createStore, KEYS, WINDOW_DAYS };
});
