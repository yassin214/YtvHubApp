// Y214 Hub — remote-driven Home Assistant dashboard for the Samsung TV (Tizen web app).
// HA is reached over its WebSocket API (works from an app origin). The access token is NOT in this app: it is fetched at start from the
// laptop service (http://192.168.3.96:8099/ha-token, answers only the TV) and belongs to a limited, non-admin HA user.
// Only light / fan / climate / scene / script / media_player / vacuum / lock entities are shown — never switches or plugs.
(function () {
  'use strict';
  var HUBQ = (location.search.match(/[?&]hub=([^&]+)/) || [])[1];            // dev/test override only (never set on the TV)
  var HUB = HUBQ ? decodeURIComponent(HUBQ) : 'http://192.168.3.96:8099';
  var DEMO = /[?&]demo\b/.test(location.search);
  var keysSeen = 0;
  // diagnostics: tiny beacons to the hub service so a failure on the TV is visible from the PC (LAN only)
  function beacon(section, data) { try { fetch(HUB + '/probe', { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ section: 'hub.' + section, data: data }) }).catch(function () {}); } catch (e) {} }
  window.addEventListener('error', function (e) { beacon('error', { msg: e.message, at: (e.filename || '') + ':' + e.lineno }); });
  window.addEventListener('unhandledrejection', function (e) { beacon('rejection', String(e.reason)); });
  var PAGES = [
    { id: 'lights',  title: 'Lights',   domains: ['light'] },
    { id: 'climate', title: 'Climate',  domains: ['climate', 'fan'] },
    { id: 'scenes',  title: 'Scenes',   domains: ['scene', 'script'] },
    { id: 'media',   title: 'Media',    domains: ['media_player'] },
    { id: 'home',    title: 'Robots & Locks', domains: ['vacuum', 'lock'] }
  ];
  var states = {}, entArea = {}, page = 'lights', ws = null, nextId = 1, pending = {}, selEid = null, selKind = 'tile', canDemo = false;
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function dom(eid) { return eid.split('.')[0]; }
  function nameOf(eid) { var s = states[eid]; return (s && s.attributes && s.attributes.friendly_name) || eid; }
  function setStatus(t, cls) { var s = $('status'); s.textContent = t; s.className = cls || ''; }
  var toastTimer = null;
  function toast(t) { var e = $('toast'); e.textContent = t; e.className = 'show'; clearTimeout(toastTimer); toastTimer = setTimeout(function () { e.className = ''; }, 1800); }

  // ---------- clock ----------
  function tick() { var d = new Date(); $('clock').textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  setInterval(tick, 15000); tick();

  // ---------- HA websocket ----------
  function request(msg) {
    return new Promise(function (resolve, reject) {
      var id = nextId++; msg.id = id; pending[id] = { resolve: resolve, reject: reject };
      ws.send(JSON.stringify(msg)); setTimeout(function () { if (pending[id]) { delete pending[id]; reject(new Error('timeout')); } }, 15000);
    });
  }
  function call(domain, service, eid, data) {
    if (DEMO) { toast(domain + '.' + service + ' → ' + nameOf(eid)); return; }
    var m = { type: 'call_service', domain: domain, service: service, target: { entity_id: eid } };
    if (data) m.service_data = data;
    request(m).then(function (r) { toast(nameOf(eid) + ' ✓'); }).catch(function (e) { toast('Failed: ' + e.message); });
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
  function loadAreas() {   // best effort: areas make the lists readable; non-admin users may not be allowed some of these
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
    if (d.new_state) states[d.entity_id] = d.new_state; else delete states[d.entity_id];
    var domains = pageDef().domains; if (domains.indexOf(dom(d.entity_id)) < 0) return;
    var t = document.querySelector('.tile[data-eid="' + d.entity_id + '"]');
    if (t && d.new_state) fillTile(t, d.entity_id); else if (!t || !d.new_state) renderKeepSel();
  }

  // ---------- rendering ----------
  function pageDef() { for (var i = 0; i < PAGES.length; i++) if (PAGES[i].id === page) return PAGES[i]; return PAGES[0]; }
  function showMsg(t) { var g = $('grid'); g.textContent = ''; g.appendChild(el('div', 'msg', t)); }
  function drawTabs() {
    var t = $('tabs'); t.textContent = '';
    PAGES.forEach(function (p) { var b = el('div', 'tab nav' + (p.id === page ? ' active' : ''), p.title); b.dataset.kind = 'tab'; b.dataset.page = p.id; t.appendChild(b); });
  }
  function eligible(eid) {
    var s = states[eid]; if (!s || entArea[eid] === '\u0000hidden') return false;
    if (dom(eid) === 'media_player' && (s.state === 'unavailable' || s.state === 'unknown' || s.state === 'off' || s.state === 'standby')) return false;
    return true;
  }
  function fillTile(t, eid) {
    var s = states[eid], a = s.attributes || {}, d = dom(eid);
    t.className = 'tile nav ' + (s.state === 'unavailable' ? 'unavailable' : (['on', 'playing', 'cleaning', 'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only', 'unlocked'].indexOf(s.state) >= 0 ? 'on' : 'off')) + (selEid === eid && selKind === 'tile' ? ' sel' : '');
    t.textContent = '';
    t.appendChild(el('div', 'name', nameOf(eid)));
    var st = s.state; if (d === 'light' && s.state === 'on' && a.brightness) st = 'on · ' + Math.round(a.brightness / 2.55) + '%';
    t.appendChild(el('div', 'state', st));
    if (d === 'climate') {
      t.appendChild(el('div', 'detail', (a.current_temperature != null ? a.current_temperature + '°' : '') + (a.temperature != null ? ' → ' + a.temperature + '°' : '')));
      [['−', 'm2', 'down'], ['+', 'm1', 'up']].forEach(function (x) { var m = el('div', 'mini nav ' + x[1], x[0]); m.dataset.kind = 'mini'; m.dataset.eid = eid; m.dataset.act = x[2]; if (selKind === 'mini' && selEid === eid + '|' + x[2]) m.classList.add('sel'); t.appendChild(m); });
    } else if (d === 'media_player') {
      t.appendChild(el('div', 'detail', a.media_title ? String(a.media_title).slice(0, 18) : ''));
      [['−', 'm2', 'voldown'], ['+', 'm1', 'volup']].forEach(function (x) { var m = el('div', 'mini nav ' + x[1], x[0]); m.dataset.kind = 'mini'; m.dataset.eid = eid; m.dataset.act = x[2]; t.appendChild(m); });
    } else if (d === 'fan' && a.percentage != null && s.state === 'on') { t.appendChild(el('div', 'detail', a.percentage + '%')); }
  }
  function render() {
    drawTabs();
    var g = $('grid'); g.textContent = '';
    var doms = pageDef().domains, groups = {}, count = 0;
    Object.keys(states).filter(function (e) { return doms.indexOf(dom(e)) >= 0 && eligible(e); }).forEach(function (e) {
      var area = (entArea[e] && entArea[e] !== '\u0000hidden') ? entArea[e] : 'Other'; (groups[area] = groups[area] || []).push(e); count++;
    });
    beacon('render', { page: page, tiles: count });
    if (!count) { showMsg('Nothing to show here.'); }
    Object.keys(groups).sort(function (a, b) { return a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b); }).forEach(function (area) {
      g.appendChild(el('div', 'area', area));
      var row = el('div', 'row'); g.appendChild(row);
      groups[area].sort(function (a, b) { return nameOf(a).localeCompare(nameOf(b)); }).forEach(function (eid) {
        var t = el('div', 'tile nav'); t.dataset.kind = 'tile'; t.dataset.eid = eid; fillTile(t, eid); row.appendChild(t);
      });
    });
    ensureSel();
  }
  function renderKeepSel() { var keep = selEid, kind = selKind; render(); if (keep) { selEid = keep; selKind = kind; mark(); } }

  // ---------- spatial navigation ----------
  function navEls() { return Array.prototype.slice.call(document.querySelectorAll('.nav')); }
  function keyOf(e) { return e.dataset.kind === 'tab' ? 'tab|' + e.dataset.page : e.dataset.kind === 'mini' ? 'mini|' + e.dataset.eid + '|' + e.dataset.act : 'tile|' + e.dataset.eid; }
  function curEl() { var all = navEls(); for (var i = 0; i < all.length; i++) if (all[i].classList.contains('sel')) return all[i]; return null; }
  function mark(target) {
    navEls().forEach(function (e) { e.classList.remove('sel'); });
    var all = navEls(), t = target;
    if (!t) { for (var i = 0; i < all.length; i++) { var k = keyOf(all[i]); if (k === selKey) { t = all[i]; break; } } }
    if (!t) t = document.querySelector('.tile') || document.querySelector('.tab.active');
    if (t) { t.classList.add('sel'); selKey = keyOf(t); if (t.dataset.kind !== 'tab') t.scrollIntoView({ block: 'center' }); else $('grid').scrollTop = 0; }
  }
  var selKey = 'tab|lights';
  function ensureSel() { mark(); }
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
  function activate() {
    var cur = curEl(); if (!cur) return; var kind = cur.dataset.kind;
    if (kind === 'tab') { page = cur.dataset.page; selKey = 'tab|' + page; render(); return; }
    var eid = cur.dataset.eid, d = dom(eid), s = states[eid];
    if (kind === 'mini') {
      var act = cur.dataset.act;
      if (d === 'climate') { var a = s.attributes || {}, step = a.target_temp_step || 1, t = (a.temperature != null ? a.temperature : (a.current_temperature || 24)) + (act === 'up' ? step : -step); call('climate', 'set_temperature', eid, { temperature: t }); }
      else if (d === 'media_player') call('media_player', act === 'up' ? 'volume_up' : 'volume_down', eid);
      return;
    }
    if (d === 'light') call('light', 'toggle', eid);
    else if (d === 'fan') call('fan', 'toggle', eid);
    else if (d === 'climate') call('climate', s.state === 'off' ? 'turn_on' : 'turn_off', eid);
    else if (d === 'scene') call('scene', 'turn_on', eid);
    else if (d === 'script') call('script', 'turn_on', eid);
    else if (d === 'media_player') call('media_player', 'media_play_pause', eid);
    else if (d === 'vacuum') call('vacuum', (s.state === 'cleaning') ? 'return_to_base' : 'start', eid);
    else if (d === 'lock') toast('Locks are view-only on the TV');
  }
  document.addEventListener('keydown', function (e) {
    var k = e.keyCode; if (keysSeen < 25) { keysSeen++; beacon('key', { code: k, sel: selKey }); }
    if (k === 37) { move('left'); e.preventDefault(); } else if (k === 39) { move('right'); e.preventDefault(); }
    else if (k === 38) { move('up'); e.preventDefault(); } else if (k === 40) { move('down'); e.preventDefault(); }
    else if (k === 13) { if (canDemo && !DEMO) { DEMO = true; canDemo = false; connect(); } else activate(); e.preventDefault(); }
    else if (k === 10009 || k === 27) { try { tizen.application.getCurrentApplication().exit(); } catch (x) {} }
  });

  // ---------- demo data (local layout test: index.html?demo) ----------
  function loadDemo() {
    var S = function (id, state, name, a) { states[id] = { entity_id: id, state: state, attributes: Object.assign({ friendly_name: name }, a || {}) }; };
    S('light.lr_ceiling', 'on', 'LR ceiling', { brightness: 200 }); S('light.lr_nano', 'on', 'Nanoleaf wall', { brightness: 120 }); S('light.lr_lamp', 'off', 'LR lamp');
    S('light.mbr_main', 'off', 'Master main'); S('light.mbr_bed', 'on', 'Bed light', { brightness: 80 }); S('light.hall', 'off', 'Hall LED strip'); S('light.kitchen', 'on', 'Kitchen', { brightness: 255 });
    S('climate.ac1', 'cool', 'AC1', { current_temperature: 25.5, temperature: 24, target_temp_step: 0.5 }); S('climate.ac2', 'off', 'AC2', { current_temperature: 27, temperature: 24 });
    S('fan.lr_fan', 'on', 'LR fan', { percentage: 66 }); S('scene.movie', 'scening', 'Movie night'); S('scene.sunset', 'scening', 'Sunset'); S('script.leaving', 'off', 'Leaving home'); S('script.sleep', 'off', 'Sleep mode');
    S('media_player.lr_tv', 'playing', 'Living room TV', { media_title: 'Planet Earth' }); S('media_player.echo', 'idle', 'Echo Dot'); S('vacuum.roborock', 'docked', 'Roborock'); S('lock.front', 'locked', 'Front door');
    ['light.lr_ceiling', 'light.lr_nano', 'light.lr_lamp', 'fan.lr_fan', 'media_player.lr_tv'].forEach(function (e) { entArea[e] = 'Living room'; });
    ['light.mbr_main', 'light.mbr_bed'].forEach(function (e) { entArea[e] = 'Master bedroom'; }); entArea['light.kitchen'] = 'Kitchen';
  }

  // tab switching with left/right when a tab is selected is handled by spatial nav; start
  // page switch helper for the demo screenshots: index.html?demo&page=climate
  var pm = location.search.match(/page=(\w+)/); if (pm) { page = pm[1]; selKey = 'tab|' + page; }
  beacon('boot', { v: '1.0.1', ua: navigator.userAgent, href: location.href, viewport: innerWidth + 'x' + innerHeight });
  drawTabs(); showMsg('Connecting to Home Assistant…'); connect();
})();
