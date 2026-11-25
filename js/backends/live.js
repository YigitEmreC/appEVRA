// Live backend: talks to Home Assistant over its WebSocket API, the same API
// Home Assistant's own website uses. Sign-in uses Home Assistant's normal
// login page, so no password or long-lived token is stored in the app.

const TOKENS_KEY = 'smarthome.auth';
const OAUTH_STATE_KEY = 'smarthome.oauthState';

const clientId = () => location.origin + '/';
const redirectUri = () => location.origin + location.pathname;

function readJson(storage, key) {
  try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; }
}
function writeJson(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
}

export function signOut() {
  try { localStorage.removeItem(TOKENS_KEY); } catch { /* storage blocked */ }
}

async function tokenRequest(hassUrl, params) {
  const res = await fetch(hassUrl + '/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  if (!res.ok) throw new Error(`giriş reddedildi (${res.status})`);
  return res.json();
}

// Is Home Assistant really there and willing to sign this app in? Asked before
// leaving the app for its login page, so nobody lands on an error page instead
// (a Cloudflare "tunnel error" when the house's Pi is off or not set up yet, or a
// browser "can't reach this page"):
//   'ok'           Home Assistant answered the sign-in endpoint and allows this app
//                  (an unknown request type, so nothing happens there)
//   'not-ready'    something answers, but not Home Assistant allowing this app: the
//                  tunnel has no running Pi behind it, or cors_allowed_origins lacks this app
//   'unreachable'  nothing answers at all (wrong address, no internet, hub off at home)
export async function reachable(hassUrl) {
  const attempt = async (opts) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    try { return await fetch(hassUrl + '/auth/token', { ...opts, cache: 'no-store', signal: ctrl.signal }); } finally { clearTimeout(timer); }
  };
  try {
    const res = await attempt({ method: 'POST', body: new URLSearchParams({ grant_type: 'evra_reachability_check' }) });
    if (res.status < 500) return 'ok';
  } catch { /* unreadable: see below */ }
  try {
    await attempt({ method: 'GET', mode: 'no-cors' });
    return 'not-ready';
  } catch {
    return 'unreachable';
  }
}

// Returns a valid access token, refreshing it or sending the user to Home
// Assistant's login page when needed.
export async function getAccessToken(hassUrl, { interactive = true } = {}) {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  if (code) {
    const returnedState = url.searchParams.get('state');
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    let expected = null;
    try { expected = sessionStorage.getItem(OAUTH_STATE_KEY); } catch { /* storage blocked */ }
    if (expected && expected === returnedState) {
      const t = await tokenRequest(hassUrl, { grant_type: 'authorization_code', code, client_id: clientId() });
      const tokens = { hassUrl, access_token: t.access_token, refresh_token: t.refresh_token, expires: Date.now() + t.expires_in * 1000 };
      writeJson(localStorage, TOKENS_KEY, tokens);
      return tokens.access_token;
    }
  }

  const saved = readJson(localStorage, TOKENS_KEY);
  if (saved && saved.hassUrl === hassUrl) {
    if (Date.now() < saved.expires - 60000) return saved.access_token;
    try {
      const t = await tokenRequest(hassUrl, { grant_type: 'refresh_token', refresh_token: saved.refresh_token, client_id: clientId() });
      const tokens = { ...saved, access_token: t.access_token, expires: Date.now() + t.expires_in * 1000 };
      writeJson(localStorage, TOKENS_KEY, tokens);
      return tokens.access_token;
    } catch (e) {
      if (/refused \(4\d\d\)/.test(e.message)) signOut();
      else throw e;
    }
  }

  if (!interactive) throw new Error('giriş yapılmadı');
  // Only leave the app for the login page if Home Assistant answers. Otherwise the
  // browser lands on a "can't reach this page" error and every reload does it again.
  // Evra keeps trying (open() schedules another attempt), so it connects by itself
  // once the house answers.
  const there = await reachable(hassUrl);
  if (there === 'unreachable') {
    throw new Error(`${hassUrl} adresine ulaşılamıyor. İnternet bağlantısını ve Ayarlar → Bağlantı'daki adresi kontrol edin.`);
  }
  if (there === 'not-ready') {
    throw new Error(`evinizin merkezi henüz yanıt vermiyor (${new URL(hassUrl).host}). Pi kapalı ya da hâlâ kuruluyor olabilir, ya da Home Assistant bu uygulamaya henüz izin vermiyor (cors_allowed_origins). Evra denemeye devam ediyor.`);
  }
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  try { sessionStorage.setItem(OAUTH_STATE_KEY, state); } catch { /* storage blocked */ }
  const auth = new URL(hassUrl + '/auth/authorize');
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('client_id', clientId());
  auth.searchParams.set('redirect_uri', redirectUri());
  auth.searchParams.set('state', state);
  location.assign(auth.toString());
  return new Promise(() => {});
}

export function createLiveBackend(hassUrl) {
  let ws = null;
  let nextId = 1;
  const pending = new Map();
  let emit = () => {};
  let setStatus = () => {};
  let retry = 0;
  let retryTimer = null;
  let pingTimer = null;
  let closedByUs = false;
  let token = null;
  let registryTimer = null;
  let entitiesSub = null;          // the subscribe_entities subscription's id
  const entityCache = new Map();   // entity_id -> its full state, for applying the diffs

  // subscribe_entities messages: {a: added or replaced (whole, compressed), c: changed
  // (diffs: "+" new or changed fields, "-" removed attributes), r: removed entity ids}.
  // Compressed keys: s state, a attributes, c context, lc last changed, lu last updated
  // (times in seconds; lu is left out when it equals lc).
  const iso = (sec) => new Date(sec * 1000).toISOString();
  function fromCompressed(entityId, x) {
    const lc = iso(x.lc);
    return { entity_id: entityId, state: x.s, attributes: x.a || {}, last_changed: lc, last_updated: x.lu ? iso(x.lu) : lc, context: typeof x.c === 'string' ? { id: x.c } : x.c || null };
  }
  function applyCompressed(ev) {
    if (!ev) return;
    const first = entityCache.size === 0;
    if (ev.a) for (const [id, x] of Object.entries(ev.a)) entityCache.set(id, fromCompressed(id, x));
    if (first && ev.a) {
      emit({ type: 'all', states: [...entityCache.values()] });
    } else if (ev.a) {
      for (const id of Object.keys(ev.a)) emit({ type: 'update', entity_id: id, state: entityCache.get(id) });
    }
    if (ev.c) {
      for (const [id, diff] of Object.entries(ev.c)) {
        const old = entityCache.get(id);
        if (!old) continue;
        const next = { ...old, attributes: { ...old.attributes } };
        const add = diff['+'];
        if (add) {
          if ('s' in add) next.state = add.s;
          if (add.a) Object.assign(next.attributes, add.a);
          if (add.c) next.context = typeof add.c === 'string' ? { id: add.c } : add.c;
          if (add.lc) { next.last_changed = iso(add.lc); next.last_updated = next.last_changed; }
          if (add.lu) next.last_updated = iso(add.lu);
        }
        for (const key of diff['-']?.a || []) delete next.attributes[key];
        entityCache.set(id, next);
        emit({ type: 'update', entity_id: id, state: next });
      }
    }
    for (const id of ev.r || []) {
      entityCache.delete(id);
      emit({ type: 'update', entity_id: id, state: null });
    }
  }

  async function loadRegistries() {
    const [devices, areas, entities, floors] = await Promise.all([
      send({ type: 'config/device_registry/list' }),
      send({ type: 'config/area_registry/list' }),
      send({ type: 'config/entity_registry/list' }),
      // Floors (Home Assistant 2024.4+); older ones have none, which means one floor.
      send({ type: 'config/floor_registry/list' }).catch(() => []),
    ]);
    emit({ type: 'registry', devices, areas, entities, floors });
  }

  // REST calls carry the access token themselves. It lasts 30 minutes, while the websocket
  // stays signed in from when it connected, so a token taken at connect time is refused
  // (401) later on. Each call takes a current one, and a refused call is retried once with
  // a freshly refreshed token.
  async function authedFetch(url, opts = {}) {
    const go = async () => {
      try { token = await getAccessToken(hassUrl, { interactive: false }); } catch { /* the old one, then */ }
      return fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` } });
    };
    let res = await go();
    if (res.status === 401) {
      const saved = readJson(localStorage, TOKENS_KEY);
      if (saved && saved.hassUrl === hassUrl) writeJson(localStorage, TOKENS_KEY, { ...saved, expires: 0 });
      res = await go();
    }
    return res;
  }

  // Sets up Home Assistant's "HTML5 Push Notifications" integration through its own setup
  // form, the way a person would in Settings › Devices & services › Add integration. Its form
  // asks for a contact e-mail (sent to the push services with each message: Evra support's,
  // not the person's) and a VAPID private key, which is made here: a new P-256 key, its
  // private part as base64url. Needs an admin account in Home Assistant.
  async function setUpHtml5() {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
    const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey);
    let flow;
    try {
      flow = await rest('POST', 'config/config_entries/flow', { handler: 'html5', show_advanced_options: false });
    } catch (e) {
      if (/401|403|unauthori|admin/i.test(e.message)) throw new Error('bildirim hizmetini kurmak için Home Assistant yönetici hesabıyla bağlanın');
      throw new Error(`Home Assistant bildirim hizmetini kuramadı (${e.message}). Home Assistant güncellenmeli ya da Evra desteğine yazın`);
    }
    if (flow?.type === 'abort') return; // already there
    const data = {};
    for (const f of flow?.data_schema || []) {
      if (/mail/i.test(f.name)) data[f.name] = 'info@evrasmarthome.com';
      else if (/prv|priv|key/i.test(f.name)) data[f.name] = d;
    }
    if (!Object.keys(data).length) Object.assign(data, { vapid_email: 'info@evrasmarthome.com', vapid_prv_key: d });
    const done = await rest('POST', `config/config_entries/flow/${flow.flow_id}`, data);
    if (done?.type === 'form') {
      try { await rest('DELETE', `config/config_entries/flow/${flow.flow_id}`); } catch { /* it times out */ }
      throw new Error(`Home Assistant bildirim hizmetini kuramadı (${Object.values(done.errors || {}).join(', ') || 'form'})`);
    }
  }

  async function rest(method, path, body) {
    const res = await authedFetch(`${hassUrl}/api/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = `${res.status}`;
      try { const j = await res.json(); msg = j.message || j.error || msg; } catch { /* not JSON */ }
      throw new Error(msg);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  function send(msg, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) { reject(new Error('bağlı değil')); return; }
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ ...msg, id }));
      setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); reject(new Error('Home Assistant yanıt vermedi')); }
      }, timeoutMs);
    });
  }

  function schedule() {
    clearTimeout(retryTimer);
    const delay = Math.min(30000, 1000 * 2 ** retry);
    retry += 1;
    retryTimer = setTimeout(open, delay);
  }

  function startPing() {
    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      send({ type: 'ping' }, 10000).catch(() => { try { ws.close(); } catch { /* already closed */ } });
    }, 30000);
  }

  async function open() {
    setStatus({ mode: 'live', state: retry ? 'reconnecting' : 'connecting', message: hassUrl });
    try {
      token = await getAccessToken(hassUrl);
    } catch (e) {
      setStatus({ mode: 'live', state: 'error', message: `Giriş yapılamadı: ${e.message}` });
      schedule();
      return;
    }
    try {
      ws = new WebSocket(hassUrl.replace(/^http/, 'ws') + '/api/websocket');
    } catch (e) {
      setStatus({ mode: 'live', state: 'error', message: `Geçersiz adres: ${e.message}` });
      return;
    }

    ws.onmessage = async (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: token }));
      } else if (m.type === 'auth_invalid') {
        signOut();
        setStatus({ mode: 'live', state: 'error', message: 'Home Assistant girişi reddetti. Giriş yapmak için yeniden bağlanın.' });
        closedByUs = true;
        ws.close();
      } else if (m.type === 'auth_ok') {
        retry = 0;
        setStatus({ mode: 'live', state: 'connecting', message: 'Durumlar yükleniyor' });
        try {
          // States: subscribe_entities, the compressed stream Home Assistant's own frontend
          // uses. The first message has every state, later ones only what changed, so the
          // Pi, the network and the phone do much less than with state_changed events
          // (which repeat the whole old and new state every time). Older Home Assistant
          // without it: the full states and state_changed events, as before.
          entityCache.clear();
          entitiesSub = nextId;
          try {
            await send({ type: 'subscribe_entities' });
          } catch {
            entitiesSub = null;
            const all = await send({ type: 'get_states' });
            emit({ type: 'all', states: all });
            await send({ type: 'subscribe_events', event_type: 'state_changed' });
          }
          await loadRegistries();
          for (const ev of ['device_registry_updated', 'area_registry_updated', 'entity_registry_updated', 'floor_registry_updated']) {
            await send({ type: 'subscribe_events', event_type: ev });
          }
          setStatus({ mode: 'live', state: 'connected', message: `Home Assistant ${m.ha_version}` });
          startPing();
        } catch (e) {
          setStatus({ mode: 'live', state: 'error', message: e.message });
          ws.close();
        }
      } else if (m.type === 'event' && entitiesSub !== null && m.id === entitiesSub) {
        applyCompressed(m.event);
      } else if (m.type === 'event' && m.event && m.event.event_type === 'state_changed') {
        const d = m.event.data;
        emit({ type: 'update', entity_id: d.entity_id, state: d.new_state });
      } else if (m.type === 'event' && m.event && /_registry_updated$/.test(m.event.event_type)) {
        clearTimeout(registryTimer);
        registryTimer = setTimeout(() => loadRegistries().catch(() => {}), 400);
      } else if (m.type === 'result' || m.type === 'pong') {
        const p = pending.get(m.id);
        if (!p) return;
        pending.delete(m.id);
        if (m.type === 'pong' || m.success) p.resolve(m.result);
        else p.reject(new Error((m.error && m.error.message) || 'istek başarısız'));
      }
    };

    ws.onclose = () => {
      clearInterval(pingTimer);
      for (const p of pending.values()) p.reject(new Error('bağlantı koptu'));
      pending.clear();
      if (closedByUs) return;
      setStatus({ mode: 'live', state: 'reconnecting', message: 'Bağlantı koptu, yeniden deneniyor' });
      schedule();
    };
  }

  function onVisible() {
    if (document.visibilityState === 'visible' && !closedByUs && (!ws || ws.readyState === WebSocket.CLOSED)) {
      retry = 0;
      open();
    }
  }

  return {
    mode: 'live',
    hassUrl,
    connect(onMessage, onStatus) {
      emit = onMessage;
      setStatus = onStatus;
      closedByUs = false;
      document.addEventListener('visibilitychange', onVisible);
      open();
    },
    disconnect() {
      closedByUs = true;
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      document.removeEventListener('visibilitychange', onVisible);
      if (ws) ws.close();
    },
    callService(domain, service, data = {}, target) {
      const msg = { type: 'call_service', domain, service, service_data: data };
      if (target) msg.target = target;
      return send(msg);
    },
    async fetchHistory(ids, startIso, endIso) {
      const res = await send({
        type: 'history/history_during_period',
        start_time: startIso, end_time: endIso, entity_ids: ids,
        minimal_response: true, no_attributes: true,
      }, 30000);
      const out = {};
      for (const id of ids) {
        out[id] = (res[id] || []).map((r) => [new Date((r.lu ?? r.lc) * 1000).toISOString(), r.s]);
      }
      return out;
    },
    async fetchAutomationConfig(configId) {
      const res = await authedFetch(`${hassUrl}/api/config/automation/config/${encodeURIComponent(configId)}`);
      if (res.status === 404) return null; // there's no such automation
      if (!res.ok) throw new Error(`Home Assistant ${res.status} ile yanıt verdi`);
      return res.json();
    },
    automationEditorUrl(configId) {
      return `${hassUrl}/config/automation/edit/${encodeURIComponent(configId)}`;
    },

    // ---- automations ----
    saveAutomation(configId, config) {
      return rest('POST', `config/automation/config/${encodeURIComponent(configId)}`, config);
    },
    deleteAutomation(configId) {
      return rest('DELETE', `config/automation/config/${encodeURIComponent(configId)}`);
    },

    // ---- rooms ----
    createArea(name) { return send({ type: 'config/area_registry/create', name }); },
    renameArea(areaId, name) { return send({ type: 'config/area_registry/update', area_id: areaId, name }); },
    deleteArea(areaId) { return send({ type: 'config/area_registry/delete', area_id: areaId }); },
    // ---- floors (a room's floor_id; rooms without one are on the ground floor) ----
    createFloor(name, level) { return send({ type: 'config/floor_registry/create', name, level }); },
    deleteFloor(floorId) { return send({ type: 'config/floor_registry/delete', floor_id: floorId }); },
    setAreaFloor(areaId, floorId) { return send({ type: 'config/area_registry/update', area_id: areaId, floor_id: floorId || null }); },

    // ---- backups (Home Assistant 2025.1+: Settings > System > Backups) ----
    backupInfo() { return send({ type: 'backup/info' }); },
    backupConfig() { return send({ type: 'backup/config/info' }); },
    backupAgents() { return send({ type: 'backup/agents/info' }); },
    backupConfigure(patch) { return send({ type: 'backup/config/update', ...patch }); },
    backupNow() { return send({ type: 'backup/generate_with_automatic_settings' }, 30000); },

    // ---- devices ----
    updateDevice(deviceId, patch) { return send({ type: 'config/device_registry/update', device_id: deviceId, ...patch }); },
    // Reconnecting a device that dropped off (js/device-health.js). Its own connection (config
    // entry) is reloaded, so Home Assistant looks for it again: a Wi-Fi bulb after the router
    // restarted, an ESPHome module, a Shelly. A Zigbee device is asked to report in instead;
    // reloading Zigbee itself would restart every Zigbee device in the home.
    async reconnectDevice(device, ids = []) {
      const update = () => (ids.length ? send({ type: 'call_service', domain: 'homeassistant', service: 'update_entity', target: { entity_id: ids } }, 20000).catch(() => {}) : null);
      const zha = (device?.identifiers || []).find((i) => i[0] === 'zha');
      if (zha) {
        try { await send({ type: 'zha/devices/reconfigure', ieee: zha[1] }, 30000); } catch { /* a sleeping battery device answers when woken */ }
        await update();
        return { how: 'zigbee' };
      }
      // TP-Link / Tapo: first look for it on the network, the way opening the Tapo app does
      // (a bulb the router "forgot" at night answers and is reachable again). Home Assistant's
      // own TP-Link setup does this search when it's started without an address; the setup
      // is closed again right away, nothing is added.
      if ((device?.identifiers || []).some((i) => i[0] === 'tplink')) {
        let flowId = null;
        try {
          const flow = await rest('POST', 'config/config_entries/flow', { handler: 'tplink', show_advanced_options: false });
          flowId = flow?.flow_id || null;
          if (flowId && flow.step_id === 'user') await rest('POST', `config/config_entries/flow/${flowId}`, { host: '' });
        } catch { /* only the reload then */ }
        if (flowId) { try { await rest('DELETE', `config/config_entries/flow/${flowId}`); } catch { /* it times out by itself */ } }
      }
      let reloaded = false;
      for (const entryId of device?.config_entries || []) {
        try { await rest('POST', `config/config_entries/entry/${entryId}/reload`); reloaded = true; } catch { /* the service below */ }
      }
      if (!reloaded) {
        try { await send({ type: 'call_service', domain: 'homeassistant', service: 'reload_config_entry', target: { device_id: device.id } }, 60000); reloaded = true; } catch { /* only a refresh then */ }
      }
      await update();
      return { how: reloaded ? 'reloaded' : 'refreshed' };
    },
    async refreshDevice(device, ids = []) {
      if (ids.length) await send({ type: 'call_service', domain: 'homeassistant', service: 'update_entity', target: { entity_id: ids } }, 20000);
    },
    // How Home Assistant's connections for this device are doing (loaded, setup_retry …).
    async connectionInfo(device) {
      const want = new Set(device?.config_entries || []);
      if (!want.size) return [];
      const all = await send({ type: 'config_entries/get' });
      return (all || []).filter((e) => want.has(e.entry_id)).map((e) => ({ domain: e.domain, title: e.title, state: e.state, reason: e.reason || '' }));
    },
    // Evra's own data (the person's scenes and remotes), kept in Home Assistant for this
    // user, so it's the same on every screen they sign in on (js/appdata.js).
    async getAppData(key) { const r = await send({ type: 'frontend/get_user_data', key: `evra_${key}` }); return r?.value ?? null; },
    setAppData(key, value) { return send({ type: 'frontend/set_user_data', key: `evra_${key}`, value }); },
    // Home Assistant's actions, to find IR modules that can send any code (esphome.<module>_send_raw).
    listServices() { return send({ type: 'get_services' }); },
    // The hub's home location, which its own weather and sunrise/sunset follow (needs an admin login).
    setHomeLocation(latitude, longitude) { return send({ type: 'config/core/update', latitude: Number(latitude), longitude: Number(longitude) }); },
    // Removing always succeeds while Home Assistant is connected, also for a device that
    // is offline, never finished pairing or can't be reached ("Failed to fetch"):
    //   1. Zigbee: the hub forgets it (it asks the device to leave; an unreachable device
    //      is forgotten anyway, which can take a while, so this waits for the registry);
    //   2. otherwise each integration drops it, or its own connection (config entry) is
    //      deleted when it's the only device on it (TP-Link, ESPHome, Shelly, cameras);
    //   3. if it's still there (a shared account such as Smart Life, or Home Assistant
    //      refused), it's switched off in the registry: hidden everywhere in Evra and
    //      dead until it's paired again.
    // Returns { hidden: true } in case 3.
    async removeDevice(deviceId, device) {
      const list = () => send({ type: 'config/device_registry/list' });
      const gone = async (waitMs = 0) => {
        const until = Date.now() + waitMs;
        for (;;) {
          try { if (!(await list()).some((d) => d.id === deviceId)) return true; } catch { /* asked again below */ }
          if (Date.now() >= until) return false;
          await new Promise((r) => setTimeout(r, 2000));
        }
      };
      const zha = (device?.identifiers || []).find((i) => i[0] === 'zha');
      if (zha) {
        try { await send({ type: 'call_service', domain: 'zha', service: 'remove', service_data: { ieee: zha[1] } }, 60000); } catch { /* checked below */ }
        if (await gone(30000)) return {};
      }
      // Newer Home Assistant (2026.11+) removes a device in one command; the per-connection
      // command below is deprecated there (removed in 2027.9) but still the only one before.
      try {
        await send({ type: 'config/device_registry/remove', device_id: deviceId });
        if (await gone(3000)) return {};
      } catch { /* an older Home Assistant, or the integration refused: the old way below */ }
      for (const entryId of device?.config_entries || []) {
        try {
          await send({ type: 'config/device_registry/remove_config_entry', device_id: deviceId, config_entry_id: entryId });
          continue;
        } catch { /* the integration can't remove single devices */ }
        // Deleting the whole connection is fine when this is its only device, never when
        // it's shared (a Tuya or Smart Life account would take every other device with it).
        let others = 1;
        try { others = (await list()).filter((d) => d.id !== deviceId && (d.config_entries || []).includes(entryId)).length; } catch { /* keep it */ }
        if (others) continue;
        for (let attempt = 0; attempt < 2; attempt++) {
          try { await rest('DELETE', `config/config_entries/entry/${entryId}`); break; } catch { /* once more, then step 3 */ }
        }
      }
      if (await gone(3000)) return {};
      await send({ type: 'config/device_registry/update', device_id: deviceId, disabled_by: 'user' });
      return { hidden: true };
    },

    // ---- notifications on this device (js/push.js) ----
    // Home Assistant's "HTML5 Push Notifications" integration. Its public key
    // signs the browser's push subscription; registering makes a notify entity.
    // Not set up yet: Evra sets it up by itself (setUpHtml5 below), then asks again.
    async pushKey() {
      const ask = () => send({ type: 'notify/html5/appkey' });
      try {
        return await ask();
      } catch (e) {
        if (!/unknown command/i.test(e.message)) throw e;
      }
      await setUpHtml5();
      // The integration needs a moment to start before it answers.
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        try { return await ask(); } catch (e) { if (!/unknown command/i.test(e.message)) throw e; }
      }
      throw new Error('Home Assistant bildirim hizmetini kurdu ama henüz başlatmadı; bir dakika sonra tekrar deneyin');
    },
    pushRegister(subscription, name) {
      const browser = /firefox/i.test(navigator.userAgent) ? 'firefox' : 'chrome'; // the only two Home Assistant accepts
      return rest('POST', 'notify.html5', { subscription, browser, name });
    },
    pushUnregister(subscription) { return rest('DELETE', 'notify.html5', { subscription }); },

    // ---- pairing ----
    permitJoin(seconds) {
      return send({ type: 'call_service', domain: 'zha', service: 'permit', service_data: { duration: seconds } });
    },
    stopJoin() {
      return send({ type: 'call_service', domain: 'zha', service: 'permit', service_data: { duration: 0 } }).catch(() => {});
    },
    flowStart(handler) {
      return rest('POST', 'config/config_entries/flow', { handler, show_advanced_options: false });
    },
    flowSubmit(flowId, data) {
      return rest('POST', `config/config_entries/flow/${flowId}`, data);
    },
    flowAbort(flowId) {
      return rest('DELETE', `config/config_entries/flow/${flowId}`).catch(() => {});
    },
    // Where a setup stands now: after a progress step, a sign-in in another tab,
    // or to continue one Home Assistant started itself.
    flowGet(flowId) {
      return rest('GET', `config/config_entries/flow/${flowId}`);
    },
    // Setups waiting because Home Assistant found a device on the network by itself.
    async flowProgress(handler) {
      const all = await send({ type: 'config_entries/flow/progress' });
      return (all || []).filter((f) => f.handler === handler);
    },
    // The integration's own texts for its setup: step titles and descriptions, field
    // names and help, errors and stop reasons (keys like component.<domain>.config.…).
    async flowTranslations(domain) {
      const r = await send({ type: 'frontend/get_translations', language: 'tr', category: 'config', integration: [domain] });
      return r?.resources || {};
    },
    matterCommission(code) {
      return send({ type: 'matter/commission', code }, 120000);
    },
    integrationUrl(domain) {
      return `${hassUrl}/config/integrations/dashboard/add?domain=${encodeURIComponent(domain)}`;
    },
  };
}
