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

  async function loadRegistries() {
    const [devices, areas, entities] = await Promise.all([
      send({ type: 'config/device_registry/list' }),
      send({ type: 'config/area_registry/list' }),
      send({ type: 'config/entity_registry/list' }),
    ]);
    emit({ type: 'registry', devices, areas, entities });
  }

  async function rest(method, path, body) {
    const res = await fetch(`${hassUrl}/api/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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
          const all = await send({ type: 'get_states' });
          emit({ type: 'all', states: all });
          await loadRegistries();
          await send({ type: 'subscribe_events', event_type: 'state_changed' });
          for (const ev of ['device_registry_updated', 'area_registry_updated', 'entity_registry_updated']) {
            await send({ type: 'subscribe_events', event_type: ev });
          }
          setStatus({ mode: 'live', state: 'connected', message: `Home Assistant ${m.ha_version}` });
          startPing();
        } catch (e) {
          setStatus({ mode: 'live', state: 'error', message: e.message });
          ws.close();
        }
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
      const res = await fetch(`${hassUrl}/api/config/automation/config/${encodeURIComponent(configId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.ok ? res.json() : null;
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

    // ---- devices ----
    updateDevice(deviceId, patch) { return send({ type: 'config/device_registry/update', device_id: deviceId, ...patch }); },
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
    async pushKey() {
      try {
        return await send({ type: 'notify/html5/appkey' });
      } catch (e) {
        if (/unknown command/i.test(e.message)) {
          throw new Error('Önce Home Assistant\'a "HTML5 Push Notifications" entegrasyonunu ekleyin (Ayarlar › Cihazlar ve Servisler › Entegrasyon Ekle)');
        }
        throw e;
      }
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
