// Y214 Hub — remote-driven Home Assistant dashboard for the Samsung TV (Tizen web app).
// v1.2: ONE simple page — Rooms (one tile per room, toggles every light in it) · Cooling · Scenes · Music (Spotify).
// HA is reached over its WebSocket API (works from an app origin). The access token is NOT in this app: it is fetched at start from the
// laptop service (http://192.168.3.96:8099/ha-token, answers only the TV) and belongs to a limited, non-admin HA user.
// Only light / fan / climate / scene / script / media_player.spotify are ever called — never switches or plugs.
(function () {
  'use strict';
  var HUBQ = (location.search.match(/[?&]hub=([^&]+)/) || [])[1];            // dev/test override only (never set on the TV)
  var HUB = HUBQ ? decodeURIComponent(HUBQ) : 'http://192.168.3.96:8099';
  var DEMO = /[?&]demo\b/.test(location.search);
  var SPOTIFY = 'media_player.spotify';
  var keysSeen = 0;
  // diagnostics: tiny beacons to the hub service so a failure on the TV is visible from the PC (LAN only)
  function beacon(section, data) { try { fetch(HUB + '/probe', { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ section: 'hub.' + section, data: data }) }).catch(function () {}); } catch (e) {} }
  window.addEventListener('error', function (e) { beacon('error', { msg: e.message, at: (e.filename || '') + ':' + e.lineno }); });
  window.addEventListener('unhandledrejection', function (e) { beacon('rejection', String(e.reason)); });

  var states = {}, entArea = {}, ws = null, nextId = 1, pending = {}, selKey = '', canDemo = false, model = {}, refillTimer = null;
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function dom(eid) { return eid.split('.')[0]; }
  function nameOf(eid) { var s = states[eid]; return (s && s.attributes && s.attributes.friendly_name) || eid; }
  function setStatus(t, cls) { var s = $('status'); s.textContent = t; s.className = cls || ''; }
  var toastTimer = null;
  function toast(t) { var e = $('toast'); e.textContent = t; e.className = 'show'; clearTimeout(toastTimer); toastTimer = setTimeout(function () { e.className = ''; }, 1800); }

  // ---------- clock ----------
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function tick() { var d = new Date(); $('clock').textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); $('date').textContent = DAYS[d.getDay()] + ' ' + d.getDate(); }
  setInterval(tick, 15000); tick();

  // ---------- HA websocket ----------
  function request(msg) {
    return new Promise(function (resolve, reject) {
      var id = nextId++; msg.id = id; pending[id] = { resolve: resolve, reject: reject };
      ws.send(JSON.stringify(msg)); setTimeout(function () { if (pending[id]) { delete pending[id]; reject(new Error('timeout')); } }, 15000);
    });
  }
  // call a service on one entity id or a list of them
  function call(domain, service, eids, data, label) {
    var list = [].concat(eids);
    if (DEMO) { toast(domain + '.' + service + ' → ' + (label || nameOf(list[0]))); return Promise.resolve(); }
    var m = { type: 'call_service', domain: domain, service: service, target: { entity_id: list } };
    if (data) m.service_data = data;
    return request(m).then(function () { toast((label || nameOf(list[0])) + ' ✓'); }).catch(function (e) { toast('Failed: ' + e.message); });
  }
  function connect() {
    setStatus('connecting…', '');
    if (DEMO) { loadDemo(); setStatus('demo data', 'ok'); render(); return; }
    var ctl = new AbortController(); setTimeout(function () { ctl.abort(); }, 5000);
    fetch(HUB + '/ha-token', { cache: 'no-store', signal: ctl.signal }).then(function (r) { if (!r.ok) throw new Error('token service ' + r.status); return r.json(); })
      .then(function (cfg) { beacon('token', { ok: true, ws: cfg.ws }); open(cfg); })
      .catch(function (e) { beacon('token', { ok: false, err: String(e) }); canDemo = true; setStatus('cannot reach the hub service (' + e.message + ') — retrying', 'bad'); showMsg('Cannot reach the laptop hub service. Retrying every 6 s…   Press OK to preview the layout with demo data.'); setTimeout(connect, 6000); });
  }
  function open(cfg) {
    ws = new WebSocket(cfg.ws);
    ws.onmessage = function (ev) {
      var m = JSON.parse(ev.data);
      if (m.type === 'auth_required') { ws.send(JSON.stringify({ type: 'auth', access_token: cfg.token })); }
      else if (m.type === 'auth_invalid') { beacon('auth', 'invalid'); setStatus('HA rejected the TV token', 'bad'); showMsg('Home Assistant rejected the TV token.'); }
      else if (m.type === 'auth_ok') { beacon('auth', 'ok'); start(); }
      else if (m.type === 'result' && pending[m.id]) { var p = pending[m.id]; delete pending[m.id]; m.success ? p.resolve(m.result) : p.reject(new Error((m.error && m.error.message) || 'error')); }
      else if (m.type === 'event' && m.event && m.event.event_type === 'state_changed') { onChanged(m.event.data); }
    };
    ws.onclose = function () { setStatus('disconnected — retrying', 'bad'); setTimeout(connect, 5000); };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }
  function start() {
    Promise.all([request({ type: 'get_states' }), request({ type: 'subscribe_events', event_type: 'state_changed' })]).then(function (r) {
      r[0].forEach(function (s) { states[s.entity_id] = s; });
      return loadAreas();
    }).then(function () { beacon('loaded', { states: Object.keys(states).length, areaMapped: Object.keys(entArea).length }); setStatus('connected', 'ok'); render(); }).catch(function (e) { beacon('loadfail', String(e)); setStatus('load failed: ' + e.message, 'bad'); });
  }
  function loadAreas() {   // best effort: areas group the lights into rooms; non-admin users may not be allowed some of these
    var areas = {}, devArea = {};
    return request({ type: 'config/area_registry/list' }).then(function (a) { a.forEach(function (x) { areas[x.area_id] = x.name; }); }).catch(function () {})
      .then(function () { return request({ type: 'config/device_registry/list' }).then(function (d) { d.forEach(function (x) { if (x.area_id) devArea[x.id] = x.area_id; }); }).catch(function () {}); })
      .then(function () { return request({ type: 'config/entity_registry/list_for_display' }).then(function (r) {
        (r.entities || []).forEach(function (e) {
          if (e.hb || e.ec) { entArea[e.ei] = '\u0000hidden'; return; }
          var aid = e.ai || (e.di && devArea[e.di]); if (aid && areas[aid]) entArea[e.ei] = areas[aid];
        });
      }).catch(function () {}); });
  }
  function onChanged(d) {
    var had = !!states[d.entity_id];
    if (d.new_state) states[d.entity_id] = d.new_state; else delete states[d.entity_id];
    var dm = dom(d.entity_id);
    if (!(dm === 'light' || dm === 'climate' || dm === 'fan' || dm === 'scene' || dm === 'script' || d.entity_id === SPOTIFY)) return;
    if (had !== !!d.new_state) { renderKeepSel(); return; }          // an entity appeared / disappeared
    clearTimeout(refillTimer); refillTimer = setTimeout(refillAll, 120);   // many lights can change at once — redraw the tiles once
  }

  // ---------- model: what the page shows ----------
  function eligible(eid) { var s = states[eid]; return !!s && entArea[eid] !== '\u0000hidden'; }
  function buildModel() {
    var secs = [], lights = Object.keys(states).filter(function (e) { return dom(e) === 'light' && eligible(e) && !/_segment_\d+$/.test(e); }), byArea = {};   // Govee "Segment 001…" sub-lights are not counted
    lights.forEach(function (e) { var a = (entArea[e] && entArea[e] !== '\u0000hidden') ? entArea[e] : 'Other'; (byArea[a] = byArea[a] || []).push(e); });
    var rooms = [];
    if (lights.length) rooms.push({ key: 'room|*', kind: 'room', name: 'All lights', eids: lights });
    Object.keys(byArea).sort(function (a, b) { return a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b); }).forEach(function (a) { rooms.push({ key: 'room|' + a, kind: 'room', name: a.replace(/\s*\([A-Za-z]{1,4}\)\s*$/, ''), eids: byArea[a] }); });   // "Living Room (LR)" → "Living Room"
    if (rooms.length) secs.push({ title: 'Rooms', tiles: rooms });
    if (states[SPOTIFY]) secs.push({ title: 'Music', tiles: [{ key: 'ent|' + SPOTIFY, kind: 'ent', eid: SPOTIFY, name: 'Spotify' }, { key: 'x|everywhere', kind: 'everywhere', name: 'Play on Everywhere' }] });
    var cool = Object.keys(states).filter(function (e) { return (dom(e) === 'climate' || dom(e) === 'fan') && eligible(e); })
      .sort(function (a, b) { return (dom(a) === dom(b) ? 0 : dom(a) === 'climate' ? -1 : 1) || nameOf(a).localeCompare(nameOf(b)); })
      .map(function (e) { return { key: 'ent|' + e, kind: 'ent', eid: e, name: nameOf(e) }; });
    if (cool.length) secs.push({ title: 'Cooling', tiles: cool });
    var sc = Object.keys(states).filter(function (e) { return (dom(e) === 'scene' || dom(e) === 'script') && eligible(e); })
      .sort(function (a, b) { return (dom(a) === dom(b) ? 0 : dom(a) === 'scene' ? -1 : 1) || nameOf(a).localeCompare(nameOf(b)); })
      .map(function (e) { return { key: 'ent|' + e, kind: 'ent', eid: e, name: nameOf(e) }; });
    if (sc.length) secs.push({ title: 'Scenes', tiles: sc });
    model = {}; secs.forEach(function (s) { s.tiles.forEach(function (t) { model[t.key] = t; }); });
    return secs;
  }

  // ---------- rendering ----------
  function showMsg(t) { var g = $('grid'); g.textContent = ''; g.appendChild(el('div', 'msg', t)); }
  function addMini(t, key, label, act, cls) { var m = el('div', 'mini nav ' + cls, label); m.dataset.kind = 'mini'; m.dataset.key = key; m.dataset.act = act; t.appendChild(m); }
  function fillTile(t, tile) {
    var cls = 'off', s, a, st = '', sub = '';
    t.textContent = '';
    if (tile.kind === 'room') {
      var on = tile.eids.filter(function (e) { return states[e] && states[e].state === 'on'; }).length;
      cls = on ? 'on' : 'off'; st = on ? (tile.eids.length > 1 ? on + ' of ' + tile.eids.length + ' on' : 'on') : 'off';
    } else if (tile.kind === 'everywhere') {
      cls = 'off music'; st = 'Echo speakers';
    } else {
      s = states[tile.eid]; if (!s) return; a = s.attributes || {}; st = s.state;
      cls = s.state === 'unavailable' ? 'unavailable' : (['on', 'playing', 'cleaning', 'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only'].indexOf(s.state) >= 0 ? 'on' : 'off');
      var d = dom(tile.eid);
      if (d === 'climate') { sub = (a.current_temperature != null ? a.current_temperature + '°' : '') + (a.temperature != null ? '  →  ' + a.temperature + '°' : ''); }
      else if (d === 'fan' && a.percentage != null && s.state === 'on') { sub = a.percentage + '%'; }
      else if (d === 'scene' || d === 'script') { st = d === 'scene' ? 'scene' : 'script'; cls = 'off'; }
      else if (tile.eid === SPOTIFY) { cls += ' music'; sub = a.media_title ? String(a.media_title) + (a.media_artist ? ' · ' + a.media_artist : '') : ''; if (st === 'paused' || st === 'idle' || st === 'off') st = st === 'off' ? 'not active' : st; }
    }
    t.className = 'tile nav ' + cls + (selKey === tile.key ? ' sel' : '');
    if (tile.kind === 'ent' && dom(tile.eid) === 'climate') t.className += ' lowmini';      // AC buttons sit bottom-right so the room name keeps the full width
    var nm = el('div', 'name', tile.name); if (tile.eid === SPOTIFY) nm.style.maxWidth = '215px'; t.appendChild(nm);
    if (sub) t.appendChild(el('div', 'sub', sub));
    t.appendChild(el('div', 'state', st));
    if (tile.kind === 'ent' && dom(tile.eid) === 'climate') { addMini(t, tile.key, '+', 'up', 'm1'); addMini(t, tile.key, '−', 'down', 'm2'); }
    if (tile.eid === SPOTIFY) { addMini(t, tile.key, '⏭', 'next', 'm1'); addMini(t, tile.key, '⏮', 'prev', 'm2'); }
    if (selKey && t.dataset.key === selKey) t.classList.add('sel');
  }
  function refillAll() {
    Array.prototype.forEach.call(document.querySelectorAll('.tile'), function (t) { var tile = model[t.dataset.key]; if (!tile) return; var keepSel = t.classList.contains('sel'); fillTile(t, tile); if (keepSel) t.classList.add('sel'); });
    mark(curEl());
  }
  function render() {
    var g = $('grid'); g.textContent = '';
    var secs = buildModel(), count = 0;
    secs.forEach(function (sec) {
      g.appendChild(el('div', 'area', sec.title));
      var row = el('div', 'row'); g.appendChild(row);
      sec.tiles.forEach(function (tile) { var t = el('div', 'tile nav'); t.dataset.kind = 'tile'; t.dataset.key = tile.key; fillTile(t, tile); row.appendChild(t); count++; });
    });
    beacon('render', { tiles: count });
    if (!count) showMsg('Nothing to show here.');
    mark();
  }
  function renderKeepSel() { var keep = selKey; render(); if (keep) { selKey = keep; mark(); } }

  // ---------- spatial navigation ----------
  function navEls() { return Array.prototype.slice.call(document.querySelectorAll('.nav')); }
  function keyOf(e) { return e.dataset.kind === 'mini' ? 'mini|' + e.dataset.key + '|' + e.dataset.act : e.dataset.key; }
  function curEl() { var all = navEls(); for (var i = 0; i < all.length; i++) if (all[i].classList.contains('sel')) return all[i]; return null; }
  function mark(target) {
    navEls().forEach(function (e) { e.classList.remove('sel'); });
    var all = navEls(), t = target;
    if (!t) { for (var i = 0; i < all.length; i++) { if (keyOf(all[i]) === selKey) { t = all[i]; break; } } }
    if (!t) t = document.querySelector('.tile');
    if (t) { t.classList.add('sel'); selKey = keyOf(t); if (document.querySelector('.tile') === t) $('grid').scrollTop = 0; else t.scrollIntoView({ block: 'center' }); }
  }
  function move(dir) {
    var cur = curEl(), all = navEls(); if (!cur) { mark(); return; }
    var c = cur.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2, best = null, bestScore = 1e9;
    all.forEach(function (o) {
      if (o === cur) return; var r = o.getBoundingClientRect(); if (!r.width) return;
      var ox = r.left + r.width / 2, oy = r.top + r.height / 2, dx = ox - cx, dy = oy - cy, along, across;
      if (dir === 'right') { along = dx; across = Math.abs(dy); } else if (dir === 'left') { along = -dx; across = Math.abs(dy); }
      else if (dir === 'down') { along = dy; across = Math.abs(dx); } else { along = -dy; across = Math.abs(dx); }
      if (along < 10) return;
      var score = along + across * 2.2; if (score < bestScore) { bestScore = score; best = o; }
    });
    if (best) mark(best);
  }
  function everywhere() {
    var s = states[SPOTIFY], src = s && ((s.attributes && s.attributes.source_list) || []).filter(function (x) { return /everywhere/i.test(x); })[0];
    if (DEMO) { toast('Spotify → Everywhere'); return; }
    if (!src) { toast('Spotify has no "Everywhere" speaker right now'); return; }
    call('media_player', 'select_source', SPOTIFY, { source: src }, 'Spotify → ' + src).then(function () { setTimeout(function () { request({ type: 'call_service', domain: 'media_player', service: 'media_play', target: { entity_id: [SPOTIFY] } }).catch(function () {}); }, 900); });
  }
  function activate() {
    var cur = curEl(); if (!cur) return;
    if (cur.dataset.kind === 'mini') {
      var tile = model[cur.dataset.key], eid = tile && tile.eid, act = cur.dataset.act, s = eid && states[eid];
      if (!s) return;
      if (dom(eid) === 'climate') { var a = s.attributes || {}, step = a.target_temp_step || 1, t = (a.temperature != null ? a.temperature : (a.current_temperature || 24)) + (act === 'up' ? step : -step); call('climate', 'set_temperature', eid, { temperature: t }); }
      else if (eid === SPOTIFY) call('media_player', act === 'next' ? 'media_next_track' : 'media_previous_track', eid, null, 'Spotify');
      return;
    }
    var tl = model[cur.dataset.key]; if (!tl) return;
    if (tl.kind === 'room') { var anyOn = tl.eids.some(function (e) { return states[e] && states[e].state === 'on'; }); call('light', anyOn ? 'turn_off' : 'turn_on', tl.eids, null, tl.name); return; }
    if (tl.kind === 'everywhere') { everywhere(); return; }
    var e2 = tl.eid, d = dom(e2), st = states[e2];
    if (d === 'fan') call('fan', 'toggle', e2);
    else if (d === 'climate') call('climate', st.state === 'off' ? 'turn_on' : 'turn_off', e2);
    else if (d === 'scene') call('scene', 'turn_on', e2);
    else if (d === 'script') call('script', 'turn_on', e2);
    else if (e2 === SPOTIFY) call('media_player', 'media_play_pause', e2, null, 'Spotify');
  }
  document.addEventListener('keydown', function (e) {
    var k = e.keyCode; if (keysSeen < 25) { keysSeen++; beacon('key', { code: k, sel: selKey }); }
    if (k === 37) { move('left'); e.preventDefault(); } else if (k === 39) { move('right'); e.preventDefault(); }
    else if (k === 38) { move('up'); e.preventDefault(); } else if (k === 40) { move('down'); e.preventDefault(); }
    else if (k === 13) { if (canDemo && !DEMO) { DEMO = true; canDemo = false; connect(); } else activate(); e.preventDefault(); }
    else if (k === 10009 || k === 27) { try { tizen.application.getCurrentApplication().exit(); } catch (x) {} }
  });

  // ---------- voice: Bixby (hold the remote's MIC button) → Samsung VoiceInteraction callbacks ----------
  // The remote's mic belongs to Bixby; apps get STRUCTURED commands, not audio: ontitleselection(title) when you say the name of an on-screen
  // item, onselection(n) for "the first one" / "this one", onnavigation(...) for left/right/up/down/next/previous. Same actions as pressing OK.
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function selectTileEl(key) { var t = document.querySelector('.tile[data-key="' + key + '"]'); if (t) mark(t); return t; }
  function voiceSelectTitle(title) {
    var q = norm(title); if (!q) return false;
    var found = null;
    Object.keys(model).forEach(function (key) { if (found) return; var n = norm(model[key].name); if (n === q || (n && (n.indexOf(q) >= 0 || q.indexOf(n) >= 0))) found = key; });
    if (!found) { toast('🎤 "' + title + '" — nothing with that name'); return false; }
    if (!selectTileEl(found)) return false;
    toast('🎤 ' + model[found].name); activate(); return true;
  }
  function visibleTiles() { return Array.prototype.slice.call(document.querySelectorAll('.tile')).filter(function (t) { var r = t.getBoundingClientRect(); return r.width && r.bottom > 0 && r.top < 1080; }); }
  function setupVoice() {
    var vi = window.webapis && webapis.voiceinteraction;
    if (!vi) { beacon('voice', 'webapis.voiceinteraction not available'); return; }
    try {
      var cb = {};   // log EVERY callback Bixby may call (unknown ones return false so the TV keeps its normal behaviour)
      ['onchangeappstate', 'onplay', 'onpause', 'onfastforward', 'onrewind', 'onchangeprevioustrack', 'onchangenexttrack', 'onrestart', 'onskipbackward', 'onskipforward',
        'onsetplayposition', 'onchangesubtitlemode', 'onchangeshufflemode', 'onchangescreenfitmode', 'onzoom', 'onrotate', 'onchange360mode', 'onchangerepeatmode',
        'onadditiontolist', 'onremovalfromlist', 'onplaylist', 'onbrowselist', 'onskipad'].forEach(function (name) {
        cb[name] = function () { var a = Array.prototype.slice.call(arguments).map(String); beacon('voice.' + name, a); toast('🎤 ' + name.replace(/^on/, '') + (a.length ? ' ' + a.join(',') : '')); return false; };
      });
      var handled = {
        onupdatestate: function () { beacon('voice.onupdatestate', {}); return 'List'; },
        onrequestcontentcontext: function () {
          var items = [];
          visibleTiles().forEach(function (t) { var tl = model[t.dataset.key]; if (!tl) return; var r = t.getBoundingClientRect(), n = tl.name; items.push(vi.buildVoiceInteractionContentContextItem(Math.round(r.left), Math.round(r.top), n, [n.toLowerCase()], t.classList.contains('sel'))); });
          beacon('voice.context', { items: items.length }); return vi.buildVoiceInteractionContentContextResponse(items);
        },
        ontitleselection: function (title) { beacon('voice.title', { title: title }); toast('🎤 title: ' + title); return voiceSelectTitle(title); },
        onselection: function (n) {
          beacon('voice.selection', { n: n }); toast('🎤 selection ' + n); var v = visibleTiles();
          if (n === 0) { activate(); return true; } var t = n === -1 ? v[v.length - 1] : v[n - 1]; if (!t) return false; mark(t); activate(); return true;
        },
        onnavigation: function (nav) {
          beacon('voice.nav', { nav: String(nav) }); toast('🎤 ' + String(nav));
          var map = { NAV_LEFT: 'left', NAV_RIGHT: 'right', NAV_UP: 'up', NAV_DOWN: 'down', NAV_NEXT: 'right', NAV_PREVIOUS: 'left' };
          if (map[nav]) { move(map[nav]); return true; } return false;
        }
      };
      Object.keys(handled).forEach(function (k) { cb[k] = handled[k]; });
      cb.onrequestcontentcontext = (function (orig) { return function () { var r = orig(); toast('🎤 listening — say a room or tile name'); return r; }; })(cb.onrequestcontentcontext || function () { return '[]'; });
      vi.setCallback(cb);
      vi.listen(); beacon('voice', 'listening');
    } catch (e) { beacon('voice', { error: String(e) }); }
  }

  // ---------- demo data (local layout test: index.html?demo) ----------
  function loadDemo() {
    var S = function (id, state, name, a) { states[id] = { entity_id: id, state: state, attributes: Object.assign({ friendly_name: name }, a || {}) }; };
    S('light.lr_ceiling', 'on', 'LR ceiling', { brightness: 200 }); S('light.lr_nano', 'on', 'Nanoleaf wall', { brightness: 120 }); S('light.lr_lamp', 'off', 'LR lamp'); S('light.tv_lights', 'on', 'TV Lights');
    S('light.mbr_main', 'off', 'Master main'); S('light.mbr_bed', 'on', 'Bed light', { brightness: 80 }); S('light.hall', 'off', 'Hall LED strip'); S('light.kitchen', 'on', 'Kitchen', { brightness: 255 });
    S('climate.ac1', 'cool', 'Living room AC', { current_temperature: 25.5, temperature: 24, target_temp_step: 0.5 }); S('climate.ac2', 'off', 'Bedrooms AC', { current_temperature: 27, temperature: 24 });
    S('fan.lr_fan', 'on', 'Tower fan', { percentage: 66 }); S('scene.movie', 'scening', 'Movie night'); S('scene.sunset', 'scening', 'Sunset'); S('script.leaving', 'off', 'Leaving home'); S('script.sleep', 'off', 'Sleep mode');
    S(SPOTIFY, 'playing', 'Spotify', { media_title: 'Hotel California', media_artist: 'Eagles', source_list: ['Everywhere', 'Living Room speaker'] });
    ['light.lr_ceiling', 'light.lr_nano', 'light.lr_lamp', 'light.tv_lights'].forEach(function (e) { entArea[e] = 'Living Room'; });
    ['light.mbr_main', 'light.mbr_bed'].forEach(function (e) { entArea[e] = 'Master Room'; }); entArea['light.kitchen'] = 'Kitchen'; entArea['light.hall'] = 'Hall';
  }

  beacon('boot', { v: '1.2.1', ua: navigator.userAgent, href: location.href, viewport: innerWidth + 'x' + innerHeight });
  showMsg('Connecting to Home Assistant…'); connect(); setupVoice();
})();
