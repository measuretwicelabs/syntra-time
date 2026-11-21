/* sw.js: SyntraTime's service worker, the page's first (owner, 21 Nov 2026; Linework docs/QUOTES_PLAN.md, the end of section 6b). It is here for one thing: the notifications of
   the open timers. The page puts one up for each open timer (notify.js); this file answers a tap on one, which the phone may deliver while the page is closed.

   "Check in" on a notification says the work is still going. With SyntraTime open, the page is told and writes the check-in in its diary at once. With it closed, the tap is
   kept here (in the browser's own small store on this phone) with the moment it was made, and the page writes it down when it is next opened. Either way the notification
   stays, saying when the last check-in was. A tap on the notification itself brings SyntraTime to the front.

   It keeps no copy of the page and answers no request, so the page is always the newest one. It holds no sum and no rule about hours: those are syntratime.js's.
   What a page like this cannot do (said plainly in time/README.md): ring by itself while it is closed, or stop a notification from being swiped away. */
(function (root, make) {
  const SW = make(root);
  if (typeof module === 'object' && module.exports) module.exports = SW;
})(typeof self !== 'undefined' ? self : this, function (root) {
'use strict';
const DB = 'syntratime-sw', STORE = 'checkins';

/* a clock time as the page says it, in the shop's zone: "1:55 pm" */
function clock(ms, zone) {
  try {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: zone || 'America/Edmonton', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms));
    const h = Number(p.find((x) => x.type === 'hour').value) % 24, m = p.find((x) => x.type === 'minute').value;
    return (h % 12 || 12) + ':' + m + (h < 12 ? ' am' : ' pm');
  } catch (e) { return ''; }
}
/* what a notification says once Check in has been tapped on it */
const checkedBody = (who, at, zone) => (who ? who + '\n' : '') + 'Still working on it? Last check-in ' + clock(at, zone);

/* a tap on a notification. deps: now(), pages() (the open SyntraTime pages), keep(entry) (remember a check-in for the page), show(title, options), open(url) */
async function onClick(event, deps) {
  const n = event.notification, d = n.data || {}, pages = await deps.pages();
  if (event.action === 'checkin') {
    const at = deps.now(), entry = { timers: d.timers || [], at: new Date(at).toISOString() };
    if (pages.length) pages[0].postMessage({ type: 'checkin', timers: entry.timers, at: entry.at });      /* one page writes it down, once */
    else await deps.keep(entry);
    await deps.show(d.title || n.title, { tag: n.tag, body: checkedBody(d.who, at, d.zone), icon: 'icon-192.png', badge: 'icon-192.png', requireInteraction: true, renotify: false, silent: true,
      actions: [{ action: 'checkin', title: 'Check in' }], data: d });
    return 'checkin';
  }
  if (pages.length && pages[0].focus) { await pages[0].focus(); return 'focus'; }
  await deps.open(d.url || './');
  return 'open';
}

/* the browser's own small store on this phone: check-ins tapped while the page was closed wait here for it */
function openDb() {
  return new Promise((res, rej) => { const r = root.indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE, { autoIncrement: true }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function keep(entry) {
  const db = await openDb();
  await new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).add(entry); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  db.close();
}

if (root && root.addEventListener && root.registration) {
  const real = { now: () => Date.now(), pages: () => root.clients.matchAll({ type: 'window', includeUncontrolled: true }), keep,
    show: (title, options) => root.registration.showNotification(title, options), open: (url) => root.clients.openWindow(url) };
  root.addEventListener('install', () => root.skipWaiting());                         /* a new copy of this file takes over at once */
  root.addEventListener('activate', (e) => e.waitUntil(root.clients.claim()));
  root.addEventListener('notificationclick', (e) => e.waitUntil(onClick(e, real)));
}
return { onClick, clock, checkedBody, DB, STORE };
});
