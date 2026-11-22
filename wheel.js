/* wheel.js: the scroll wheel for picking a time, a length of time or a day (owner, 22 Nov 2026, chat "SyntraTime 12"; the look and the behaviour were agreed as a working mockup).
   One picker for all three, so it is learnt once: columns of numbers that move under a bar that stays where it is.
     a time      hour, minutes, am or pm            Wheel.clock(host, '08:30', onChange)
     how long    hours, minutes                     Wheel.length(host, 90, onChange)
     a day       month, day, year                   Wheel.date(host, '2026-11-22', onChange)
   Each gives back { value(), set(value) }. value() is 'HH:MM' (24 hours), minutes, or 'YYYY-MM-DD', the shapes the rest of SyntraTime already uses, so no sum changes.
   How it behaves: the bar in the middle stays and the numbers move under it; one turn of the mouse wheel moves one number, slowly and smoothly (a short ease, not a jump); a wheel stops at its
   first and its last number and never goes round; a number tapped moves to the bar; a finger drags the wheel and it settles on a number; the arrow keys work too. The day column shortens
   itself for a short month. The look comes from the page: it reads --wheel-bar, --wheel-ink, --wheel-bg, --wheel-fg, --wheel-muted and --wheel-line (the page sets them once).
   The pure parts (the parts of a clock, a length and a day, and the days in a month) are tested in Node (tests/node/wheel.test.js); the drawing is tested in the browser (tests/ui/u29_wheel.py). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Wheel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => (n < 10 ? '0' : '') + n;
const range = (a, b, two) => { const r = []; for (let i = a; i <= b; i++) r.push(two ? pad(i) : String(i)); return r; };
/* the days in a month (month 0 to 11) of a year */
const daysIn = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/* ---- the pure parts ---- */
/* 'HH:MM' (24 hours) into what the three columns show: hour 1 to 12, minutes 0 to 59, pm 0 or 1 */
function clockParts(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')), h24 = m ? Math.min(23, Number(m[1])) : 8, mi = m ? Math.min(59, Number(m[2])) : 0;
  return { h: h24 % 12 === 0 ? 12 : h24 % 12, mi, pm: h24 >= 12 ? 1 : 0 };
}
const partsClock = (p) => pad((p.h % 12) + (p.pm ? 12 : 0)) + ':' + pad(p.mi);
/* a number of minutes into hours and minutes (up to 12 hours; more is kept at 12 h 59) and back */
function lengthParts(minutes) { const n = Math.max(0, Math.min(12 * 60 + 59, Math.round(Number(minutes) || 0))); return { h: Math.floor(n / 60), mi: n % 60 }; }
const partsLength = (p) => p.h * 60 + p.mi;
/* 'YYYY-MM-DD' into year, month 0 to 11 and day */
function dayParts(ymd) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '')); return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null; }
const partsDay = (p) => String(p.y).padStart(4, '0') + '-' + pad(p.m + 1) + '-' + pad(Math.min(p.d, daysIn(p.y, p.m)));
/* the years on the wheel: two before this year and one after, and always the year being shown */
function yearsFor(shown, thisYear) { const lo = Math.min(shown, thisYear - 2), hi = Math.max(shown, thisYear + 1); const r = []; for (let y = lo; y <= hi; y++) r.push(y); return r; }

/* ---- the drawing (browser only) ---- */
const ROW = 40;            /* the height of a number, in pixels; five show, the middle one is under the bar */
const CSS = '.wh{box-sizing:content-box;position:relative;display:flex;height:' + ROW * 5 + 'px;border:1px solid var(--wheel-line,#25303a);border-radius:10px;overflow:hidden;background:var(--wheel-bg,transparent);color:var(--wheel-fg,inherit);touch-action:pan-y}' +
  '.wh-bar{position:absolute;left:4px;right:4px;top:' + ROW * 2 + 'px;height:' + ROW + 'px;background:var(--wheel-bar,#4ea2ff);border-radius:8px;z-index:0;pointer-events:none}' +
  '.wh-col{position:relative;z-index:1;flex:1;min-width:0;height:100%;overflow-y:scroll;scrollbar-width:none;scroll-snap-type:y mandatory;overscroll-behavior:contain;padding:' + ROW * 2 + 'px 0;box-sizing:border-box;outline:none;-webkit-tap-highlight-color:transparent}' +
  '.wh-col::-webkit-scrollbar{display:none}' +
  '.wh-col+.wh-col{border-left:1px solid var(--wheel-line,#25303a)}' +
  '.wh-it{height:' + ROW + 'px;line-height:' + ROW + 'px;text-align:center;scroll-snap-align:center;font-size:17px;color:var(--wheel-muted,#8594a1);cursor:pointer;user-select:none;-webkit-user-select:none;white-space:nowrap}' +
  '.wh-it.sel{color:var(--wheel-ink,#06121e);font-weight:600}' +
  '.wh-col:focus-visible{box-shadow:inset 0 0 0 2px var(--wheel-bar,#4ea2ff)}' +
  '.wh-fade{position:absolute;left:0;right:0;height:' + ROW * 1.5 + 'px;z-index:2;pointer-events:none}' +
  '.wh-fade.t{top:0;background:linear-gradient(var(--wheel-bg,transparent),transparent)}.wh-fade.b{bottom:0;background:linear-gradient(transparent,var(--wheel-bg,transparent))}';
function css() { if (typeof document === 'undefined' || document.getElementById('wheel-css')) return; const s = document.createElement('style'); s.id = 'wheel-css'; s.textContent = CSS; document.head.appendChild(s); }

/* one column: items (words), the one shown, and what to tell when it changes. It never goes round: it stops at the first number and at the last. */
function column(items, index, label, onChange) {
  const c = document.createElement('div');
  c.className = 'wh-col'; c.tabIndex = 0; c.setAttribute('role', 'spinbutton'); c.setAttribute('aria-label', label);
  let list = items, cur = index, acc = 0, last = 0, anim = null, settle = null;
  const clamp = (i) => Math.max(0, Math.min(list.length - 1, i));
  const mark = (i) => { const k = c.children; for (let j = 0; j < k.length; j++) k[j].className = 'wh-it' + (j === i ? ' sel' : ''); c.setAttribute('aria-valuenow', list[i]); };
  function build(its, ix) {
    list = its; cur = clamp(ix); c.innerHTML = '';
    its.forEach((t, i) => { const d = document.createElement('div'); d.className = 'wh-it'; d.textContent = t; d.addEventListener('click', () => go(i)); c.appendChild(d); });
    mark(cur); c.scrollTop = cur * ROW;
  }
  /* move to number i with a short ease (about a quarter of a second); the snapping is off while it moves, and back on at the end */
  function go(i, quiet) {
    i = clamp(i); if (anim) cancelAnimationFrame(anim);
    c.style.scrollSnapType = 'none';
    const from = c.scrollTop, to = i * ROW, t0 = performance.now(), dur = from === to ? 0 : 260;
    const step = (n) => { const p = dur ? Math.min(1, (n - t0) / dur) : 1, e = 1 - Math.pow(1 - p, 3); c.scrollTop = from + (to - from) * e; if (p < 1) anim = requestAnimationFrame(step); else { c.scrollTop = to; c.style.scrollSnapType = ''; anim = null; } };
    step(t0);
    if (i !== cur) { cur = i; mark(i); if (!quiet) onChange(i); }
  }
  /* the mouse wheel: one notch, one number, and not faster than about fourteen a second */
  c.addEventListener('wheel', (e) => {
    e.preventDefault(); const now = performance.now(); acc += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
    if (Math.abs(acc) >= 40 && now - last > 70) { go(cur + (acc > 0 ? 1 : -1)); acc = 0; last = now; }
  }, { passive: false });
  /* a finger (or a drag with the scroll bars hidden): follow it, and tell what the wheel settles on */
  c.addEventListener('scroll', () => {
    if (anim) return; const i = clamp(Math.round(c.scrollTop / ROW)); if (i !== cur) { cur = i; mark(i); }
    clearTimeout(settle); settle = setTimeout(() => { const j = clamp(Math.round(c.scrollTop / ROW)); onChange(j); }, 90);
  });
  c.addEventListener('keydown', (e) => {
    const d = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 }[e.key]; if (d) { e.preventDefault(); go(cur + d); } else if (e.key === 'Home') { e.preventDefault(); go(0); } else if (e.key === 'End') { e.preventDefault(); go(list.length - 1); }
  });
  c.rebuild = build; c.place = () => { c.scrollTop = cur * ROW; }; c.index = () => cur; c.goto = go; c.count = () => list.length;
  build(items, index);
  return c;
}
/* the frame: the columns side by side, the bar behind the middle row, and the soft fade at the top and the bottom */
function frame(host, cols) {
  css(); host.innerHTML = ''; const w = document.createElement('div'); w.className = 'wh';
  const bar = document.createElement('div'); bar.className = 'wh-bar'; w.appendChild(bar);
  cols.forEach((c) => w.appendChild(c));
  ['t', 'b'].forEach((k) => { const f = document.createElement('div'); f.className = 'wh-fade ' + k; w.appendChild(f); });
  host.appendChild(w); cols.forEach((c) => c.place());      /* the position is set once the wheel is on the page: before that a scroll position is not kept */
  return w;
}
const noop = () => {};

function clock(host, hhmm, onChange) {
  const p = clockParts(hhmm), fire = onChange || noop;
  const cH = column(range(1, 12), p.h - 1, 'Hour', () => fire(value())), cM = column(range(0, 59, true), p.mi, 'Minutes', () => fire(value())), cA = column(['AM', 'PM'], p.pm, 'AM or PM', () => fire(value()));
  const value = () => partsClock({ h: cH.index() + 1, mi: cM.index(), pm: cA.index() });
  frame(host, [cH, cM, cA]);
  const api = { value, set(v) { const q = clockParts(v); cH.goto(q.h - 1, true); cM.goto(q.mi, true); cA.goto(q.pm, true); } };
  host.wheel = api; return api;
}
function length(host, minutes, onChange) {
  const p = lengthParts(minutes), fire = onChange || noop;
  const cH = column(range(0, 12), p.h, 'Hours', () => fire(value())), cM = column(range(0, 59, true), p.mi, 'Minutes', () => fire(value()));
  const value = () => partsLength({ h: cH.index(), mi: cM.index() });
  frame(host, [cH, cM]);
  const api = { value, set(v) { const q = lengthParts(v); cH.goto(q.h, true); cM.goto(q.mi, true); } };
  host.wheel = api; return api;
}
function date(host, ymd, onChange, thisYear) {
  const p = dayParts(ymd) || { y: (thisYear || new Date().getFullYear()), m: 0, d: 1 }, fire = onChange || noop, ty = thisYear || new Date().getFullYear();
  const years = yearsFor(p.y, ty);
  const cD = column(range(1, daysIn(p.y, p.m)), p.d - 1, 'Day', () => fire(value()));
  const fix = () => { const y = years[cY.index()], m = cM.index(), n = daysIn(y, m); if (cD.count() !== n) cD.rebuild(range(1, n), Math.min(cD.index(), n - 1)); };
  const cM = column(MONTHS, p.m, 'Month', () => { fix(); fire(value()); }), cY = column(years.map(String), years.indexOf(p.y), 'Year', () => { fix(); fire(value()); });
  const value = () => partsDay({ y: years[cY.index()], m: cM.index(), d: cD.index() + 1 });
  frame(host, [cM, cD, cY]);
  const api = { value, set(v) { const q = dayParts(v); if (!q) return; cY.goto(Math.max(0, years.indexOf(q.y)), true); cM.goto(q.m, true); cD.rebuild(range(1, daysIn(q.y, q.m)), q.d - 1); } };
  host.wheel = api; return api;
}

return { MONTHS, ROW, daysIn, clockParts, partsClock, lengthParts, partsLength, dayParts, partsDay, yearsFor, clock, length, date };
});
