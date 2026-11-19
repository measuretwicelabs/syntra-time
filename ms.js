/* ms.js: signing in to Microsoft, and the three calls on the Time folder in OneDrive that store.js sends and reads with (SyntraTime, the phone page).

   Carried over from the proof page (17 and 18 Nov 2026), which the owner tried on his phone. It holds no secret and no data of his. The registration's number (CLIENT_ID, in
   index.html) is public: it opens nothing by itself. The sign-in is Microsoft's own page, with a code that only the phone that asked can use (PKCE). What Microsoft hands back is
   kept on the phone, in this page's own storage, and goes only to Microsoft. What the page asks for is files only (Files.ReadWrite) and to stay signed in (offline_access).

   Three faults the real phone showed that the pretend Microsoft had hidden, all kept fixed (plan, section 6b): the way back from Microsoft is opened twice (in Microsoft's window
   and in the installed page), so the note of a sign-in is kept until the pass has arrived; the page may not ask Microsoft "who am I" with a files-only permission, so the name is read
   from his OneDrive; an installed page keeps showing its old copy until it is refreshed (that last one is for the service worker, not built yet).
   A sign-in lasts 24 hours at most; after that the page tries Microsoft once by itself when it opens (nothing is typed), and shows "Not signed in" only if Microsoft wants him to
   choose. Timers never need it: every record is kept on the phone first (store.js). */
(function (root) {
'use strict';
const AUTHORITY = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';     /* consumers: a personal Microsoft account, as the owner's OneDrive is */
const SCOPE = 'Files.ReadWrite offline_access';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const K = { tok: 'syntratime.tokens', folder: 'syntratime.folder', pkce: 'syntratime.pkce', had: 'syntratime.had', tried: 'syntratime.tried' };
const SILENT_EVERY = 6 * 3600 * 1000;       /* the page tries a sign-in by itself at most once in six hours, so it can never loop */

function create(cfg) {
  const note = cfg.note || (() => {}), HERE = location.origin + location.pathname;
  const get = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const put = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const windowName = () => (matchMedia('(display-mode: standalone)').matches ? 'app' : 'browser');
  const b64url = (bytes) => btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const pathOf = (p) => p.split('/').map(encodeURIComponent).join('/');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const fail = (kind, message) => Object.assign(new Error(message), { kind });

  /* the Syntra folder inside OneDrive: given once in the link that sets the page up (#folder=...), then remembered on the phone. Time is the folder inside it. */
  function folder() {
    const m = /[#&]folder=([^&]*)/.exec(location.hash);
    if (m) { const f = decodeURIComponent(m[1]).replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''); if (f) put(K.folder, f); history.replaceState(null, '', HERE); }
    return get(K.folder) || 'Syntra';
  }
  const timePath = (rel) => folder() + '/Time' + (rel ? '/' + rel : '');

  /* ---- signing in: Microsoft's own page, then back here with a code that only this phone can turn into a pass ---- */
  async function signIn(silent) {
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48))), state = b64url(crypto.getRandomValues(new Uint8Array(12)));
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    /* kept in the page's lasting storage, not the tab's: on a phone Microsoft's page may open in another window than the one that asked, and the way back must still find it */
    put(K.pkce, { verifier, state, at: Date.now(), silent: !!silent });
    note(silent ? 'Trying Microsoft by itself: no tap needed' : 'Sign-in started: opening Microsoft', { detail: windowName() });
    location.assign(AUTHORITY + '/authorize?' + new URLSearchParams({ client_id: cfg.clientId, response_type: 'code', redirect_uri: HERE, response_mode: 'query', scope: SCOPE,
      code_challenge: challenge, code_challenge_method: 'S256', state, prompt: silent ? 'none' : 'select_account' }));
  }
  async function token(params) {
    let r; try { r = await fetch(AUTHORITY + '/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(Object.assign({ client_id: cfg.clientId, scope: SCOPE }, params)) }); }
    catch (e) { throw fail('offline', 'Microsoft could not be reached for the pass (' + (e && e.message || 'no connection') + ').'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw fail('other', j.error_description ? String(j.error_description).split('\n')[0].split('Trace ID')[0].trim() : 'Microsoft did not let the sign-in through.');
    const t = { access: j.access_token, refresh: j.refresh_token || (get(K.tok) || {}).refresh || null, until: Date.now() + (j.expires_in || 3600) * 1000 - 60000 };
    put(K.tok, t); put(K.had, true); return t;
  }
  /* Back from Microsoft with ?code=... or ?error=...: finish the sign-in, then clean the address. The way back can be opened twice on a phone (see the top), so a window that finds the other
     has already finished the sign-in says nothing. Gives 'in', 'choose' (the try by itself was not enough: Microsoft wants him to choose) or null (not a way back). */
  async function comeBack() {
    const q = new URLSearchParams(location.search); if (!q.has('code') && !q.has('error')) return null;
    history.replaceState(null, '', HERE);
    const saved = get(K.pkce), silent = !!(saved && saved.silent);
    if (q.has('error')) {
      localStorage.removeItem(K.pkce);
      if (silent && /interaction_required|login_required|account_selection_required|consent_required/.test(q.get('error'))) { note('Microsoft wants a tap to sign in: it was not done by itself', { detail: q.get('error') }); return 'choose'; }
      throw fail('other', q.get('error') === 'access_denied' ? 'The sign-in was cancelled.' : (q.get('error_description') || 'Microsoft refused the sign-in.').split('\n')[0]);
    }
    const fresh = saved && saved.state === q.get('state') && Date.now() - saved.at < 15 * 60000;
    const why = fresh ? '' : !saved ? 'no note of the sign-in' : saved.state !== q.get('state') ? 'the note is of another sign-in' : 'the note is too old';
    try {
      if (!fresh) throw fail('other', 'The sign-in did not start on this phone, or took too long. Press Sign in again.');
      await token({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: HERE, code_verifier: saved.verifier });
      localStorage.removeItem(K.pkce);
      note(silent ? 'Signed in again by itself, no tap needed' : 'Signed in to Microsoft', { detail: windowName() + (why ? ', ' + why : '') });
      return 'in';
    } catch (e) {
      for (let i = 0; i < 6 && !get(K.tok); i++) await wait(500);       /* the other window may be finishing it at this moment */
      if (get(K.tok)) { localStorage.removeItem(K.pkce); return 'in'; }
      note('The sign-in was not finished: ' + e.message, { odd: true, detail: windowName() + (why ? ', ' + why : '') });
      throw e;
    }
  }
  /* a pass that still works: the one kept, or a fresh one from Microsoft without asking him again */
  async function pass() {
    const t = get(K.tok); if (!t) return null;
    if (t.until > Date.now()) return t.access;
    if (!t.refresh) return null;
    try { return (await token({ grant_type: 'refresh_token', refresh_token: t.refresh })).access; }
    catch (e) { if (e.kind === 'offline') return t.access; localStorage.removeItem(K.tok); return null; }
  }
  /* Who is signed in is read from his OneDrive itself, which the page is allowed to see (it may not ask Microsoft "who am I": that needs a permission the page does not ask for). */
  async function who() {
    const a = await pass(); if (!a) return { signedIn: false, name: '' };
    let name = '';
    try { const r = await fetch(GRAPH + '/me/drive?$select=owner', { headers: { authorization: 'Bearer ' + a } }); if (r.ok) { const d = await r.json(); name = (d.owner && d.owner.user && d.owner.user.displayName) || ''; } }
    catch (e) { /* no signal: signed in, name not read this time */ }
    return { signedIn: true, name };
  }
  /* once, when the page opens with no usable pass, and he has signed in before: let Microsoft try by itself. Never more than once in six hours. */
  function maybeSilent() {
    if (!get(K.had) || get(K.tok) || get(K.pkce)) return false;
    const last = get(K.tried) || 0; if (Date.now() - last < SILENT_EVERY) return false;
    put(K.tried, Date.now()); signIn(true); return true;
  }
  function signOut() { localStorage.removeItem(K.tok); localStorage.removeItem(K.pkce); put(K.tried, Date.now()); note('Signed out on this phone: records kept on the phone wait for the next sign-in'); }

  /* ---- the Time folder in OneDrive: store.js sends and reads through these. Paths are inside the Time folder. ---- */
  async function call(path, opt, as) {
    const a = await pass(); if (!a) throw fail('signin', 'Sign in with Microsoft first.');
    let r; try { r = await fetch(GRAPH + path, Object.assign({}, opt, { headers: Object.assign({ authorization: 'Bearer ' + a }, (opt && opt.headers) || {}) })); }
    catch (e) { throw fail('offline', 'No connection.'); }
    if (r.status === 404 && as !== 'put') return null;
    if (r.status === 401) { localStorage.removeItem(K.tok); throw fail('signin', 'Microsoft asks you to sign in again.'); }
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw fail('other', (j.error && j.error.message) || 'OneDrive answered with an error (' + r.status + ').'); }
    return as === 'text' ? r.text() : r.json();
  }
  const drive = {
    get: (rel) => call('/me/drive/root:/' + pathOf(timePath(rel)) + ':/content', {}, 'text'),
    put: (rel, text) => call('/me/drive/root:/' + pathOf(timePath(rel)) + ':/content?@microsoft.graph.conflictBehavior=replace', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: text }, 'put'),
    async list(rel) {
      const out = []; let url = '/me/drive/root:/' + pathOf(timePath(rel)) + ':/children?$select=name,eTag&$top=200';
      for (let i = 0; i < 10 && url; i++) { const j = await call(url, {}, 'json'); if (!j) return out; for (const v of j.value || []) out.push({ name: v.name, eTag: v.eTag || '' }); url = j['@odata.nextLink'] ? j['@odata.nextLink'].replace(GRAPH, '') : null; }
      return out;
    }
  };
  return { signIn, comeBack, pass, who, maybeSilent, signOut, folder, drive, where: () => folder() + '/Time', signedInNow: () => !!get(K.tok) };
}
root.MS = { create };
})(typeof self !== 'undefined' ? self : this);
