/* notify.js: the notifications of the open timers (owner, 21 Nov 2026; mockup 8; Linework docs/QUOTES_PLAN.md, the end of section 6b). One notification for each open timer, gone
   when the timer stops, ringing once an hour, each with a Check in button; a paused timer's says paused and has no button.

   What each one says is worked out in view.js (notices) from the timers syntratime.js gives; this file decides which to put up, which to take down and which to ring (plan, tested in
   Node: tests/node/timenotify.test.js), and does it through the page's service worker (sw.js). It holds no sum and no rule about hours.

   The honest limits of a phone page (time/README.md): a notification can be swiped away, and it comes back the next time the page looks, about once a minute while SyntraTime is
   open; the hourly ring and the minutes shown are kept up only while the phone keeps the page alive, so with SyntraTime closed a notification stays as it last was and does not ring.
   Check in works with the page closed: the service worker keeps the tap, and the page writes it down when it is next opened. */
(function (root, make) {
  const N = make(root);
  if (typeof module === 'object' && module.exports) module.exports = N; else root.NOTIFYLIB = N;
})(typeof self !== 'undefined' ? self : this, function (root) {
'use strict';
const HOUR = 3600000, DB = 'syntratime-sw', STORE = 'checkins';

/* what to do now. showing: the tags already up; notices: what should be up (view.js); rang: when each was last rung { tag: ms }; now.
   A notification rings (sound, a new heads-up) when an hour has gone by since its timer started, since the last check-in, or since it last rang, whichever is latest: so a tap on
   Check in quiets it for an hour. A paused timer never rings. A timer that has stopped has its notification taken down. Gives { show: [ { notice, ring } ], close: [tags], rang }. */
function plan(showing, notices, rang, now) {
  const out = { show: [], close: showing.filter((t) => !notices.some((n) => n.tag === t)), rang: {} };
  for (const n of notices) {
    const last = Math.max(Date.parse(n.quietFrom) || 0, (rang && rang[n.tag]) || 0), ring = !n.paused && now - last >= HOUR;
    out.rang[n.tag] = ring ? now : ((rang && rang[n.tag]) || 0);
    out.show.push({ notice: n, ring });
  }
  return out;
}

/* the check-ins the service worker kept while the page was closed: taken out, oldest first, and the store emptied */
function takeQueue() {
  return new Promise((res) => {
    let r; try { r = root.indexedDB.open(DB, 1); } catch (e) { res([]); return; }
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { autoIncrement: true });
    r.onerror = () => res([]);
    r.onsuccess = () => {
      const db = r.result, tx = db.transaction(STORE, 'readwrite'), st = tx.objectStore(STORE), all = st.getAll();
      all.onsuccess = () => { st.clear(); };
      tx.oncomplete = () => { db.close(); res(all.result || []); };
      tx.onerror = () => { db.close(); res([]); };
    };
  });
}

/* the page's side. deps: notices() (what should be up), zone(), now(), pref(name, value) (kept on the phone), checkin(timers, at) (write a check-in down) */
function create(deps) {
  const supported = typeof root.Notification !== 'undefined' && typeof root.navigator !== 'undefined' && 'serviceWorker' in root.navigator;
  let reg = null, busy = false, again = false;
  const state = () => (supported ? root.Notification.permission : 'unsupported');        /* default (not asked yet) | granted | denied | unsupported */
  async function drain() { for (const e of await takeQueue()) deps.checkin(e.timers, e.at); }
  async function refresh() {
    if (!reg || state() !== 'granted') return;
    if (busy) { again = true; return; }
    busy = true;
    try {
      do {
        again = false;
        const notices = deps.notices(), showing = (await reg.getNotifications()).filter((n) => /^timer-/.test(n.tag));
        const p = plan(showing.map((n) => n.tag), notices, deps.pref('rang') || {}, deps.now());
        for (const n of showing) if (p.close.includes(n.tag)) n.close();
        for (const s of p.show) {
          const n = s.notice, old = showing.find((x) => x.tag === n.tag);
          if (old && !s.ring && old.body === n.body) continue;                             /* nothing new to say */
          await reg.showNotification(n.title, { tag: n.tag, body: n.body, icon: 'icon-192.png', badge: 'icon-192.png', requireInteraction: true, renotify: s.ring, silent: !s.ring,
            actions: n.paused ? [] : [{ action: 'checkin', title: 'Check in' }],
            data: { timers: n.timers, zone: deps.zone(), title: n.title, who: n.who, url: root.location.href.split('#')[0].split('?')[0] } });
        }
        deps.pref('rang', p.rang);
      } while (again);
    } catch (e) { /* the phone would not show it: the timers themselves are not touched */ } finally { busy = false; }
  }
  async function init() {
    if (!supported) return;
    try { reg = await root.navigator.serviceWorker.register('sw.js'); await root.navigator.serviceWorker.ready; } catch (e) { reg = null; return; }
    root.navigator.serviceWorker.addEventListener('message', (ev) => { const m = ev.data || {}; if (m.type === 'checkin') { deps.checkin(m.timers, m.at); refresh(); } });
    await drain(); await refresh();
  }
  /* the phone's own question, asked after ours (app.js asks once, in plain words) */
  async function ask() {
    if (!supported) return 'unsupported';
    let r = state(); try { r = await root.Notification.requestPermission(); } catch (e) { /* refused to ask */ }
    if (!reg) await init(); else await refresh();
    return r;
  }
  return { supported, state, init, refresh, drain, ask };
}
return { plan, create, takeQueue, HOUR };
});
