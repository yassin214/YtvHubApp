// Y214 Hub v2.2 — remote-driven Home Assistant dashboard for the Samsung TV (Tizen web app).
// Pages: Now (suggestions from your habits, what is on, quick routines) · Rooms · Devices (every light on its own, by brand, + the robot) · Cooling · Music · Scenes · Insights (your habits, drawn) · Health (what needs attention).
// v2.2.0 (04.11.26, operator board): Devices page (on/off, brightness, tone/effect per light, grouped by brand), Roborock tile, Living Room theme (felt blues + white diamond panels), EN / Arabic toggle (RTL).
// HA is reached over its WebSocket API. The access token is NOT in this app: it is fetched at start from the laptop service
// (http://192.168.3.96:8099/ha-token, answers only the TV) and belongs to a limited, non-admin HA user.
// Your habits (private) are fetched from the same laptop service (/habits.json, LAN only) — they are never part of this public app.
// Only light / fan / climate / vacuum / scene / script / media_player.spotify are ever CALLED — never switches or plugs; scenes/scripts that touch sockets are hidden.
(function () {
  'use strict';
  function fitScreen() {
    document.body.style.zoom = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  }
  fitScreen(); window.addEventListener('resize', fitScreen);
  var VERSION = '2.7.1';
  var HUBQ = (location.search.match(/[?&]hub=([^&]+)/) || [])[1];            // dev/test override only (never set on the TV)
  var HUB = HUBQ ? decodeURIComponent(HUBQ) : 'http://192.168.3.96:8099';
  var DEMO = /[?&]demo\b/.test(location.search);
  var SPOTIFY = 'media_player.spotify';
  var PAGES = [{ id: 'now', name: 'Now', key: 403 }, { id: 'rooms', name: 'Rooms', key: 404 }, { id: 'devices', name: 'Devices' }, { id: 'cool', name: 'Cooling', key: 405 }, { id: 'music', name: 'Music', key: 406 },
    { id: 'scenes', name: 'Scenes' }, { id: 'cameras', name: 'Cameras' }, { id: 'energy', name: 'Energy' }, { id: 'insights', name: 'Insights' }, { id: 'security', name: 'Security' }, { id: 'health', name: 'Health' }];
  // ---------- language: English / Arabic (toggle tab in the header; remembered on the TV) ----------
  var LANG = (function () { try { return localStorage.getItem('y214hub.lang') || 'en'; } catch (e) { return 'en'; } })();
  var AR = { 'Doorbell snapshot':'صورة جرس الباب','Snapshot unavailable':'الصورة غير متاحة','House map':'خريطة المنزل','Live view':'بث مباشر','On / Off':'تشغيل / إيقاف', 'Target':'الهدف', 'Live feed unavailable':'البث المباشر غير متاح', 'OK for live view':'اضغط للبث المباشر', 'Connecting live feed':'جار الاتصال بالبث المباشر', 'Lighting':'الإضاءة','Climate':'التكييف','Security':'الأمان','Media':'الوسائط','Home':'الرئيسية','No reading':'لا توجد قراءة','Demo camera':'كاميرا تجريبية',
    Cameras: 'الكاميرات', Energy: 'الطاقة', Power: 'القدرة', 'Energy meters': 'عدادات الطاقة',
    'OK for snapshot': 'اضغط لعرض الصورة', 'Snapshot unavailable': 'الصورة غير متاحة',
    'Demo camera': 'كاميرا تجريبية', 'Loading snapshot': 'جار تحميل الصورة',
    'Now': 'الآن', 'Rooms': 'الغرف', 'Devices': 'الأجهزة', 'Cooling': 'التبريد', 'Music': 'الموسيقى', 'Scenes': 'المشاهد', 'Insights': 'العادات', 'Health': 'الحالة',
    'on': 'يعمل', 'off': 'مطفأ', 'unavailable': 'غير متصل', 'scene': 'مشهد', 'script': 'إجراء', 'playing': 'يشغّل', 'paused': 'متوقف مؤقتاً', 'idle': 'خامل', 'not active': 'غير نشط',
    'docked': 'في القاعدة', 'cleaning': 'ينظّف', 'returning': 'يعود للقاعدة', 'charging': 'يشحن', 'error': 'خطأ', 'cool': 'تبريد', 'heat': 'تدفئة', 'auto': 'تلقائي', 'dry': 'تجفيف', 'fan_only': 'مروحة',
    'All lights': 'كل الأضواء', 'Other': 'أخرى', 'Living Room': 'غرفة المعيشة', 'Master Bedroom': 'غرفة النوم الرئيسية', 'Guest Bedroom': 'غرفة الضيوف', 'Kitchen': 'المطبخ', 'Hall': 'الصالة',
    'Corridor': 'الممر', 'Laundry Room': 'غرفة الغسيل', 'Master Bathroom': 'الحمام الرئيسي', 'Guest Bathroom': 'حمام الضيوف', 'Master Room': 'غرفة النوم الرئيسية',
    'Rooms — OK toggles the lights, ＋ − dim them': 'الغرف — موافق يشغّل/يطفئ الأضواء، ☀ ☾ للسطوع',
    'Robot — OK start / pause, ⌂ back to dock': 'الروبوت — موافق تشغيل / إيقاف، ⌂ العودة للقاعدة',
    'Play on - one tap switches where Spotify plays': 'التشغيل على — ضغطة واحدة لتغيير مكان سبوتيفاي',
    'Scenes & routines': 'المشاهد والإجراءات', 'On right now': 'يعمل الآن', 'Quick routines': 'إجراءات سريعة', 'lights': 'أضواء', 'tap to play here': 'اضغط للتشغيل هنا',
    'playing here': 'يشغّل هنا', 'selected': 'محدد', 'all Echo speakers together': 'كل سماعات إيكو معاً', 'Nothing to show here.': 'لا يوجد ما يُعرض هنا.', 'battery': 'البطارية'
  };
  var AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  function T(s) { return LANG === 'ar' && AR[s] ? AR[s] : s; }
  function applyLang() { var h = document.documentElement; h.setAttribute('lang', LANG); h.setAttribute('dir', LANG === 'ar' ? 'rtl' : 'ltr'); }
  function toggleLang() { LANG = LANG === 'ar' ? 'en' : 'ar'; try { localStorage.setItem('y214hub.lang', LANG); } catch (e) {} applyLang(); tick(); selKey = 'lang'; render(); beacon('lang', LANG); }
  var HIDE_RX = /socket|plug|outlet|room_devices|volume_recovery|exposure_build|ac_off_warning|ac_off_fan_on|vacuum_away/i;   // internal helpers + anything that could touch plugs
  var keysSeen = 0;
  function beacon(section, data) { try { fetch(HUB + '/probe', { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ section: 'hub.' + section, data: data }) }).catch(function () {}); } catch (e) {} }
  window.addEventListener('error', function (e) { beacon('error', { msg: e.message, at: (e.filename || '') + ':' + e.lineno }); });
  window.addEventListener('unhandledrejection', function (e) { beacon('rejection', String(e.reason)); });

  var entDev = {}, entPlat = {}, entLab = {}, devInfo = {};
  var states = {}, entArea = {}, ws = null, nextId = 1, pending = {}, selKey = '', canDemo = false, model = {}, refillTimer = null, habits = null, habitsErr = '';
  var page = (location.search.match(/[?&]page=(\w+)/) || [])[1] || 'now';
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function dom(eid) { return eid.split('.')[0]; }
  function rawName(eid) { var s = states[eid]; return (s && s.attributes && s.attributes.friendly_name) || eid; }
  function nameOf(eid) {var n=rawName(eid); return LANG==='ar' ? arabicDevice(n) : n;}
  function display(s) {return LANG==='ar' ? (AR[s]||arabicDevice(s)) : s;}
  function ringViews(){
    return Object.keys(states).filter(e=>dom(e)==='camera' && eligible(e) && (entPlat[e]==='ring'||/_live_view$/.test(e)) && !/last_recording/.test(e)).sort();
  }
  function setStatus(t, cls) { var s = $('status'); s.textContent = t; s.className = cls || ''; }
  var toastTimer = null;
  function toast(t) { var e = $('toast'); e.textContent = t; e.className = 'show'; clearTimeout(toastTimer); toastTimer = setTimeout(function () { e.className = ''; }, 1800); }
  function pad2(n) { return ('0' + n).slice(-2); }
  function fmtH(h) { if (h == null) return '–'; var hh = Math.floor(h), mm = Math.round((h - hh) * 60); if (mm === 60) { hh++; mm = 0; } return pad2(hh % 24) + ':' + pad2(mm); }
  function daypart(h) { if (h == null) h = new Date().getHours(); return h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 17 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : 'night'; }

  // ---------- clock ----------
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function tick() { var d = new Date(); $('clock').textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes()); $('date').textContent = (LANG === 'ar' ? AR_DAYS : DAYS)[d.getDay()] + ' ' + d.getDate(); }
  setInterval(tick, 15000); tick();

  // ---------- HA websocket ----------
  var cameraEvents = {}, stopCamera;
  function request(msg) {
    return new Promise(function (resolve, reject) {
      var id = nextId++; msg.id = id; pending[id] = { resolve: resolve, reject: reject };
      ws.send(JSON.stringify(msg)); setTimeout(function () { if (pending[id]) { delete pending[id]; reject(new Error('timeout')); } }, 15000);
    });
  }
  function call(domain, service, eids, data, label) {
    var list = [].concat(eids);
    if (DEMO) { toast(domain + '.' + service + ' → ' + (label || nameOf(list[0]))); return Promise.resolve(); }
    var m = { type: 'call_service', domain: domain, service: service, target: { entity_id: list } };
    if (data) m.service_data = data;
    return request(m).then(function () { toast((label || nameOf(list[0])) + ' ✓'); }).catch(function (e) { toast('Failed: ' + e.message); });
  }
  function connect() {
    setStatus('connecting…', '');
    if (DEMO) { loadDemo(); habits = demoHabits(); setStatus('demo data', 'ok'); render(); return; }
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
      else if (m.type === 'event' && cameraEvents[m.id]) { cameraEvents[m.id](m.event); }
      else if (m.type === 'event' && m.event && m.event.event_type === 'state_changed') { onChanged(m.event.data); }
    };
    ws.onclose = function () { closeCamera(); setStatus('disconnected — retrying', 'bad'); setTimeout(connect, 5000); };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }
  function start() {
    Promise.all([request({ type: 'get_states' }), request({ type: 'subscribe_events', event_type: 'state_changed' })]).then(function (r) {
      r[0].forEach(function (s) { states[s.entity_id] = s; });
      return loadAreas();
    }).then(function () { beacon('loaded', { v: VERSION, states: Object.keys(states).length, areaMapped: Object.keys(entArea).length }); setStatus('connected', 'ok'); render(); loadHabits(); }).catch(function (e) { beacon('loadfail', String(e)); setStatus('load failed: ' + e.message, 'bad'); });
  }
  function loadHabits() {
    if (DEMO) { habits = demoHabits(); render(); return; }
    var ctl = new AbortController(); setTimeout(function () { ctl.abort(); }, 6000);
    fetch(HUB + '/habits.json', { cache: 'no-store', signal: ctl.signal }).then(function (r) { if (!r.ok) throw new Error('habits ' + r.status); return r.json(); })
      .then(function (h) { habits = h; habitsErr = ''; beacon('habits', { ok: true, days: h.period && h.period.days }); if (page === 'now' || page === 'insights') renderKeepSel(); })
      .catch(function (e) { habitsErr = String(e.message || e); beacon('habits', { ok: false, err: habitsErr }); });
    setTimeout(loadHabits, 30 * 60 * 1000);
  }
  function loadAreas() {
    var areas = {}, devArea = {};
    return request({ type: 'config/area_registry/list' }).then(function (a) { a.forEach(function (x) { areas[x.area_id] = x.name;if(!areaNames.includes(x.name))areaNames.push(x.name); }); }).catch(function () {})
      .then(function () { return request({ type: 'config/device_registry/list' }).then(function (d) { d.forEach(function (x) { if (x.area_id) devArea[x.id] = x.area_id; devInfo[x.id] = { mf: x.manufacturer || '', model: x.model || '' }; }); }).catch(function () {}); })
      .then(function () { return request({ type: 'config/entity_registry/list_for_display' }).then(function (r) {
        (r.entities || []).forEach(function (e) {
          if (e.di) entDev[e.ei] = e.di; if (e.pl) entPlat[e.ei] = e.pl; if (e.lb) entLab[e.ei] = e.lb;
          if (e.hb || e.ec) { entArea[e.ei] = '\u0000hidden'; return; }
          var aid = e.ai || (e.di && devArea[e.di]); if (aid && areas[aid]) entArea[e.ei] = areas[aid];
        });
      }).catch(function () {}); });
  }
  function onChanged(d) {
    var had = !!states[d.entity_id];
    if (d.new_state) states[d.entity_id] = d.new_state; else delete states[d.entity_id];
    var dm = dom(d.entity_id);
    if(page==='rooms'){if(had!==!!d.new_state)renderKeepSel();else{var key='roomdev|'+d.entity_id;if(model[key])refillAll();}return;}
    if ((page === 'security' && (dm === 'lock' || dm === 'alarm_control_panel')) || (page === 'cameras' && dm === 'camera') ||
        (page === 'energy' && dm === 'sensor' && (meterKind(d.old_state) || meterKind(d.new_state)))) {
      renderKeepSel();
      return;
    }
    if (!(dm === 'light' || dm === 'climate' || dm === 'fan' || dm === 'vacuum' || dm === 'scene' || dm === 'script' || dm === 'person' || dm === 'automation' || d.entity_id === SPOTIFY || d.new_state && d.new_state.state === 'unavailable')) return;
    if (had !== !!d.new_state) { renderKeepSel(); return; }
    clearTimeout(refillTimer); refillTimer = setTimeout(function () { if (page === 'now' || page === 'health') renderKeepSel(); else if (page !== 'insights') refillAll(); }, 250);
  }

  // ---------- models: what each page shows ----------
  function eligible(eid) { var s = states[eid]; return !!s && entArea[eid] !== '\u0000hidden'; }
  function roomName(a) { return a.replace(/\s*\([A-Za-z]{1,4}\)\s*$/, ''); }   // "Living Room (LR)" → "Living Room"
  function lightArea(e){
    if (/^light\.living_room_(hexa|nano_1)$/.test(e) || (brandOf(e)==='Nanoleaf' && /^(nano|hexa)$/i.test(rawName(e)))) {
      return Object.values(entArea).find(a=>a && /^living room/i.test(a)) || 'Living Room';
    }
    return entArea[e];
  }
  function roomTiles() {
    var lights = Object.keys(states).filter(function (e) { return dom(e) === 'light' && eligible(e) && !/_segment_\d+$/.test(e); }), byArea = {}, rooms = [];
    lights.forEach(function (e) { var a = lightArea(e) || 'Other'; (byArea[a] = byArea[a] || []).push(e); });
    if (lights.length) rooms.push({ key: 'room|*', kind: 'room', name: T('All lights'), eids: lights });
    Object.keys(byArea).sort(function (a, b) { return a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b); }).forEach(function (a) { rooms.push({ key: 'room|' + a, kind: 'room', name: T(roomName(a)), en: roomName(a), eids: byArea[a] }); });
    return rooms;
  }
  // Devices page: every light on its own, grouped by brand. The same lamp reached twice (Govee over BLE AND over govee2mqtt) is shown once.
  // DUP_HIDE = BLE twins INFERRED from names (04.11.26): Ceiling Light = LRC, Ceiling Light 1 / ceiling light 2 = K1 / K2, TV lights (BLE) = TV Lights.
  var DUP_HIDE = { 'light.govee_h60a6': 1, 'light.govee_h60a1': 1, 'light.govee_h60a1_2': 1, 'light.govee_h6099': 1 };
  function brandOf(e) {
    var d = devInfo[entDev[e]] || {}, m = (d.mf || '') + ' ' + (entPlat[e] || '');
    if (/govee/i.test(m)) return 'Govee'; if (/lepro/i.test(m)) return 'Lepro'; if (/nanoleaf/i.test(m)) return 'Nanoleaf'; if (/sonoff|ewelink/i.test(m)) return 'SONOFF';
    if (/roborock/i.test(m)) return 'Roborock'; if (/_tz|tuya/i.test(m)) return 'Tuya'; if (/switch_as_x/i.test(m)) return 'Smart switch'; if (/zha/i.test(m)) return 'Zigbee';
    return d.mf || 'Other';
  }
  function roomOf(e) { return (entArea[e] && entArea[e] !== '\u0000hidden') ? roomName(entArea[e]) : 'Other'; }
  function deviceSections() {
    var lights = Object.keys(states).filter(function (e) { return dom(e) === 'light' && eligible(e) && !/_segment_\d+$/.test(e) && !DUP_HIDE[e] && (entLab[e] || []).indexOf('not_in_room_rules') < 0; });
    var by = {}, secs = [];
    lights.forEach(function (e) { var b = brandOf(e); (by[b] = by[b] || []).push(e); });
    var fans=coolTiles().filter(t=>dom(t.eid)==='fan');
    if (fans.length) secs.push({title:display('Fans'),tiles:fans});
    var vac = Object.keys(states).filter(function (e) { return dom(e) === 'vacuum' && eligible(e); });
    if (vac.length) secs.push({ title: T('Robot — OK start / pause, ⌂ back to dock'), tiles: vac.map(function (e) { return { key: 'dev|' + e, kind: 'vac', eid: e, name: nameOf(e) }; }) });
    Object.keys(by).sort(function (a, b) { return by[b].length - by[a].length || a.localeCompare(b); }).forEach(function (b) {
      secs.push({ title: b + ' — ' + by[b].length + ' ' + T('lights'), tiles: by[b].sort(function (x, y) { return roomOf(x).localeCompare(roomOf(y)) || nameOf(x).localeCompare(nameOf(y)); })
        .map(function (e) { return { key: 'dev|' + e, kind: 'light', eid: e, name: nameOf(e) }; }) });
    });
    return secs;
  }
  function vacBattery(eid) { var s = states['sensor.' + eid.split('.')[1] + '_battery']; return s && s.state !== 'unavailable' ? s.state : null; }
  function coolTiles() {
    return Object.keys(states).filter(function (e) { return (dom(e) === 'climate' || dom(e) === 'fan') && eligible(e); })
      .sort(function (a, b) { return (dom(a) === dom(b) ? 0 : dom(a) === 'climate' ? -1 : 1) || nameOf(a).localeCompare(nameOf(b)); })
      .map(function (e) { return { key: 'ent|' + e, kind: 'ent', eid: e, name: nameOf(e) }; });
  }
  function musicTiles() {
    var t = [];
    if (states[SPOTIFY]) t.push({ key: 'ent|' + SPOTIFY, kind: 'ent', eid: SPOTIFY, name: 'Spotify' }, { key: 'x|volume', kind: 'volume', name: 'Volume' });
    return t;
  }
  // every place Spotify can play right now (Echo group, single Echos, soundbar, TV...) as one tap each. Spotify plays on ONE target at a time.
  function srcLabel(s) { return /^YTV$/i.test(s) ? 'YTV77' : s; }       // the 77" TV announces itself as "YTV" until it is renamed on the TV
  function sourceTiles() {
    var s = states[SPOTIFY], list = (s && s.attributes && s.attributes.source_list) || [];
    var rank = function (x) { return /everywhere/i.test(x) ? 0 : 1; };
    return list.slice().sort(function (a, b) { return rank(a) - rank(b) || a.localeCompare(b); }).map(function (x) { return { key: 'src|' + x, kind: 'src', src: x, name: display(srcLabel(x)) }; });
  }
  function playOn(src) {
    if (DEMO) { toast('Spotify → ' + srcLabel(src)); return; }
    call('media_player', 'select_source', SPOTIFY, { source: src }, 'Spotify → ' + srcLabel(src)).then(function () { setTimeout(function () { request({ type: 'call_service', domain: 'media_player', service: 'media_play', target: { entity_id: [SPOTIFY] } }).catch(function () {}); }, 900); });
  }
  function sceneTiles() {
    return Object.keys(states).filter(function (e) { return (dom(e) === 'scene' || dom(e) === 'script') && eligible(e) && !HIDE_RX.test(e + ' ' + nameOf(e)); })
      .sort(function (a, b) { return (dom(a) === dom(b) ? 0 : dom(a) === 'scene' ? -1 : 1) || nameOf(a).localeCompare(nameOf(b)); })
      .map(function (e) { return { key: 'ent|' + e, kind: 'ent', eid: e, name: nameOf(e) }; });
  }
  function suggestions() {
    var part = daypart(), out = [], rooms = roomTiles(), byName = {}, seen = {};
    rooms.forEach(function (r) { byName[r.en || r.name] = r; });
    var src = habits && habits.suggest && habits.suggest[part];
    if (src) src.forEach(function (s) {
      if (out.length >= 6) return;
      if (s.type === 'room' && byName[s.room] && !seen['r' + s.room]) { seen['r' + s.room] = 1; var r = byName[s.room]; out.push({ key: 'sg|' + r.key, kind: 'room', name: r.name, eids: r.eids, sg: true, why: s.why }); }
      else if (s.type === 'entity' && states[s.eid] && eligible(s.eid) && !seen[s.eid]) { seen[s.eid] = 1; out.push({ key: 'sg|ent|' + s.eid, kind: 'ent', eid: s.eid, name: nameOf(s.eid), sg: true, why: s.why }); }
    });
    return out;
  }
  function onNowTiles() {
    var out = [];
    roomTiles().forEach(function (r) { if (r.key !== 'room|*' && r.eids.some(function (e) { return states[e] && states[e].state === 'on'; })) out.push({ key: 'on|' + r.key, kind: 'room', name: r.name, eids: r.eids }); });
    coolTiles().forEach(function (t) { var s = states[t.eid]; if (s && s.state !== 'off' && s.state !== 'unavailable') out.push({ key: 'on|' + t.key, kind: 'ent', eid: t.eid, name: t.name }); });
    if (states[SPOTIFY] && states[SPOTIFY].state === 'playing') out.push({ key: 'on|ent|' + SPOTIFY, kind: 'ent', eid: SPOTIFY, name: 'Spotify' });
    return out.slice(0, 12);
  }
  function routineTiles() {
    return sceneTiles().filter(function (t) { return dom(t.eid) === 'scene' || /snooze|home|away|sleep|leav/i.test(t.eid + nameOf(t.eid)); }).slice(0, 8)
      .map(function (t) { return { key: 'rt|' + t.key, kind: 'ent', eid: t.eid, name: t.name }; });
  }
  var selectedRoom = '', areaNames = [], roomsLoading = false, nextRoomsRetry = 0;
  var hardwareDomains = new Set('light switch fan climate vacuum camera media_player sensor binary_sensor cover lock alarm_control_panel remote siren humidifier water_heater valve device_tracker button number select event update'.split(' '));
  function loadRoomDirectory() {
    if (DEMO || privateMap || roomsLoading || Date.now()<nextRoomsRetry) return;
    roomsLoading=true;
    fetch(HUB+'/house-map.json',{cache:'no-store'}).then(function(r){if(!r.ok)throw Error(r.status);return r.json();})
      .then(function(map){privateMap=map;if(page==='rooms')renderKeepSel();})
      .catch(function(){nextRoomsRetry=Date.now()+30000;}).finally(function(){roomsLoading=false;});
  }
  function roomSections(grid) {
    loadRoomDirectory();
    var directory=privateMap?.roomDirectory || {}, fallback=directory.entities || {};
    var rooms=new Map(), unassigned='Unassigned';
    function ensure(a){if(!rooms.has(a))rooms.set(a,[]);return rooms.get(a);}
    (areaNames.length?areaNames:(directory.areas||[])).forEach(a=>ensure(roomName(a)));
    var seen=new Set();
    Object.keys(states).forEach(function(e){
      var domain=dom(e);
      if(!eligible(e)||!hardwareDomains.has(domain)||DUP_HIDE[e]||/_segment_\d+$/.test(e))return;
      if(['sensor','binary_sensor','button','number','select','event','update','device_tracker'].includes(domain)&&!entDev[e]&&!entArea[e]&&!fallback[e])return;
      var a=roomName(lightArea(e)||fallback[e]||unassigned);
      var kind=domain==='light'?'light':domain==='vacuum'?'vac':'ent';
      if((domain==='light'||domain==='fan')&&((entLab[e]||[]).includes('not_in_room_rules')||HIDE_RX.test(e+' '+rawName(e))))kind='roomStatus';
      seen.add(e);
      ensure(a).push({key:'roomdev|'+e,kind:kind,eid:e,name:nameOf(e),group:domain});
    });
    (directory.devices||[]).forEach(function(d,i){
      if(d.entities.some(e=>seen.has(e)))return;
      ensure(roomName(d.room)).push({key:'roomrecord|'+i,kind:'roomRecord',name:display(d.name),group:'device'});
    });
    var names=Array.from(rooms.keys()).sort((a,b)=>a===b?0:a==='Living Room'?-1:b==='Living Room'?1:a===unassigned?1:b===unassigned?-1:a.localeCompare(b));
    if(!rooms.has(selectedRoom)&&selectedRoom!=='*')selectedRoom=names[0]||'';
    var strip=el('div','room-subtabs');strip.setAttribute('role','tablist');grid.appendChild(strip);
    names.concat('*').forEach(function(a){
      var b=el('button','room-subtab nav',a==='*'?T('All lights'):a===unassigned?(LANG==='ar'?'غير معيّن':'Unassigned'):display(a));
      b.dataset.kind='roomtab';b.dataset.room=a;b.dataset.key='roomtab|'+a;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(a===selectedRoom));strip.appendChild(b);
    });
    if(selectedRoom==='*')return [{title:T('All lights'),tiles:roomTiles()}];
    var items=rooms.get(selectedRoom)||[],groups=new Map();
    items.sort((a,b)=>a.name.localeCompare(b.name)).forEach(function(t){if(!groups.has(t.group))groups.set(t.group,[]);groups.get(t.group).push(t);});
    var titles={light:'Lights',fan:'Fans',climate:'Climate',vacuum:'Robots',camera:'Cameras',media_player:'Media',switch:'Switches',sensor:'Sensors',binary_sensor:'Binary sensors',device:'Devices',device_tracker:'Device trackers'};
    var sections=Array.from(groups.keys()).sort().map(k=>({title:display(titles[k]||k.replace(/_/g,' ')),tiles:groups.get(k)}));
    var lights=items.filter(t=>t.kind==='light').map(t=>t.eid);
    if(lights.length)sections.unshift({title:display(selectedRoom),tiles:[{key:'roomlights|'+selectedRoom,kind:'room',name:T('All lights'),eids:lights}]});
    return sections;
  }

  function sectionsFor(p) {
    if (p === 'devices') return deviceSections();
    if (p === 'cool') return [{ title: T('Cooling'), tiles: coolTiles() }];
    if (p === 'music') return [{ title: T('Music'), tiles: musicTiles() }, { title: T('Play on - one tap switches where Spotify plays'), tiles: sourceTiles() }];
    if (p === 'scenes') return [{ title: T('Scenes & routines'), tiles: sceneTiles() }];
    if (p !== 'now') return [];
    var secs = [], sg = suggestions(), on = onNowTiles(), rt = routineTiles();
    if (sg.length) secs.push({ title: 'Suggested for this ' + daypart() + ' — learned from what you do', tiles: sg });
    if (on.length) secs.push({ title: T('On right now'), tiles: on });
    if (rt.length) secs.push({ title: T('Quick routines'), tiles: rt });
    return secs;
  }

  // ---------- rendering ----------
  function showMsg(t) { var g = $('grid'); g.textContent = ''; g.appendChild(el('div', 'msg', t)); }
  function addMini(t, key, label, act, cls) { var m = el('div', 'mini nav ' + cls, label); m.dataset.kind = 'mini'; m.dataset.key = key; m.dataset.act = act; t.appendChild(m); }
  function fillTile(t, tile) {
    var cls = 'off', s, a, st = '', sub = tile.why || '';
    t.textContent = '';
    if(tile.kind==='roomRecord'){t.className='tile nav off';t.append(el('div','name',tile.name),el('div','sub',LANG==='ar'?'جهاز مسجّل':'Registered device'));return;}
    if (tile.kind === 'room') {
      var on = tile.eids.filter(function (e) { return states[e] && states[e].state === 'on'; }).length;
      cls = on ? 'on' : 'off'; st = on ? (tile.eids.length > 1 ? on + ' of ' + tile.eids.length + ' on' : 'on') : 'off';
    } else if (tile.kind === 'src') {
      s = states[SPOTIFY]; a = (s && s.attributes) || {}; var here = a.source === tile.src; cls = here ? 'on music' : 'off music';
      st = here ? (s.state === 'playing' ? 'playing here' : 'selected') : 'tap to play here'; if (/everywhere/i.test(tile.src)) sub = 'all Echo speakers together';
    } else if (tile.kind === 'light') {
      s = states[tile.eid]; if (!s) return; a = s.attributes || {};
      cls = s.state === 'unavailable' ? 'unavailable' : (s.state === 'on' ? 'on' : 'off');
      st = s.state === 'on' && a.brightness != null ? T('on') + ' · ' + Math.round(a.brightness / 2.55) + '%' : T(s.state);
      sub = T(roomOf(tile.eid)) + (s.state === 'on' && a.effect && a.effect !== 'None' ? ' · ' + a.effect : (s.state === 'on' && a.color_temp_kelvin ? ' · ' + a.color_temp_kelvin + 'K' : ''));
    } else if (tile.kind === 'vac') {
      s = states[tile.eid]; if (!s) return; a = s.attributes || {}; var b = vacBattery(tile.eid);
      cls = s.state === 'unavailable' ? 'unavailable' : (s.state === 'cleaning' || s.state === 'returning' ? 'on' : 'off');
      st = T(s.state); sub = (b != null ? '🔋 ' + b + '%' : '') + (a.fan_speed ? '  ·  ' + a.fan_speed : '');
    } else if (tile.kind === 'everywhere') { cls = 'off music'; st = 'Echo speakers';
    } else if (tile.kind === 'volume') {
      s = states[SPOTIFY]; a = (s && s.attributes) || {}; cls = 'off music'; st = a.volume_level != null ? Math.round(a.volume_level * 100) + '%' : '–'; sub = a.is_volume_muted ? 'muted' : '';
    } else {
      s = states[tile.eid]; if (!s) return; a = s.attributes || {}; st = s.state;
      cls = s.state === 'unavailable' ? 'unavailable' : (['on', 'playing', 'cleaning', 'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only'].indexOf(s.state) >= 0 ? 'on' : 'off');
      var d = dom(tile.eid);
      if (d === 'climate') { sub = (a.current_temperature != null ? a.current_temperature + '°' : '') + (a.temperature != null ? '  →  ' + a.temperature + '°' : '') || sub; }
      else if (d === 'fan' && a.percentage != null && s.state === 'on') { sub = a.percentage + '%'; }
      else if (d === 'scene' || d === 'script') { st = d === 'scene' ? 'scene' : 'script'; cls = 'off'; }
      else if (tile.eid === SPOTIFY) { cls += ' music'; sub = a.media_title ? String(a.media_title) + (a.media_artist ? ' · ' + a.media_artist : '') : sub; if (st === 'paused' || st === 'idle' || st === 'off') st = st === 'off' ? 'not active' : st; }
    }
    if (tile.kind === 'room') st = on ? (tile.eids.length > 1 ? (LANG === 'ar' ? on + ' من ' + tile.eids.length + ' يعمل' : st) : T('on')) : T('off');
    else if (tile.kind === 'ent' || tile.kind === 'src') st = T(st);
    if (sub && AR[sub]) sub = T(sub);
    t.className = 'tile nav ' + cls + (tile.sg ? ' sg' : '') + (selKey === tile.key ? ' sel' : '');
    if (tile.kind === 'ent' && dom(tile.eid) === 'climate') t.className += ' lowmini';
    if (tile.kind === 'ent' && dom(tile.eid)==='fan') t.className += ' lowmini mini3';
    if (tile.kind === 'room' || tile.kind === 'vac') t.className += ' lowmini';
    if (tile.kind === 'light') t.className += ' lowmini mini3';
    var nm = el('div', 'name', display(tile.name)); if (tile.eid === SPOTIFY) nm.style.maxWidth = '215px'; t.appendChild(nm);
    if (sub) t.appendChild(el('div', 'sub', sub));
    t.appendChild(el('div', 'state', st));
    if (tile.kind === 'ent' && dom(tile.eid) === 'climate') { addMini(t, tile.key, '+', 'up', 'm1'); addMini(t, tile.key, '−', 'down', 'm2'); }
    if (tile.kind === 'room') { addMini(t, tile.key, '☀', 'bup', 'm1'); addMini(t, tile.key, '☾', 'bdn', 'm2'); }
    if (tile.kind === 'light') { addMini(t, tile.key, '☀', 'bup', 'm1'); addMini(t, tile.key, '☾', 'bdn', 'm2'); addMini(t, tile.key, '◐', 'tone', 'm3'); }
    if (tile.kind==='ent' && dom(tile.eid)==='fan' && a) {
      if (a.supported_features & 1) {addMini(t,tile.key,'+','fan-up','m1');addMini(t,tile.key,'−','fan-down','m2');}
      if ((a.preset_modes||[]).length) addMini(t,tile.key,'≋','fan-preset','m3');
      if (a.supported_features & 2) addMini(t,tile.key,'↔','fan-swing','m4');
    }
    if (tile.kind === 'vac') { addMini(t, tile.key, '⌂', 'dock', 'm1'); }
    if (tile.kind === 'volume') { addMini(t, tile.key, '+', 'vup', 'm1'); addMini(t, tile.key, '−', 'vdn', 'm2'); }
    if (tile.eid === SPOTIFY) { addMini(t, tile.key, '⏭', 'next', 'm1'); addMini(t, tile.key, '⏮', 'prev', 'm2'); }
    if (selKey && t.dataset.key === selKey) t.classList.add('sel');
  }
  function refillAll() {
    Array.prototype.forEach.call(document.querySelectorAll('.tile'), function (t) { var tile = model[t.dataset.key]; if (!tile) return; var keepSel = t.classList.contains('sel'); fillTile(t, tile); if (keepSel) t.classList.add('sel'); });
    mark(curEl());
  }
  function unavailableControls() {
    var out = []; Object.keys(states).forEach(function (e) { var d = dom(e), s = states[e];
      if (['light', 'climate', 'fan', 'media_player', 'vacuum', 'lock', 'cover', 'humidifier', 'water_heater'].indexOf(d) >= 0 && s.state === 'unavailable' && eligible(e) && !/_segment_\d+$/.test(e)) out.push(e); });
    return out;
  }
  function statusStrip() {
    var wrap = el('div', 'chips'), lightsOn = 0, lightsAll = 0;
    Object.keys(states).forEach(function (e) { if (dom(e) === 'light' && eligible(e) && !/_segment_\d+$/.test(e)) { lightsAll++; if (states[e].state === 'on') lightsOn++; } });
    function chip(html, cls) { var c = el('div', 'chip ' + (cls || '')); c.innerHTML = html; wrap.appendChild(c); }
    var pk = Object.keys(states).filter(function (e) { return dom(e) === 'person'; })[0], p = pk && states[pk]; if (p) chip('<b>' + esc(p.state === 'home' ? 'Home' : 'Away') + '</b> ' + esc(nameOf(pk)), p.state === 'home' ? 'good' : '');
    coolTiles().filter(function (t) { return dom(t.eid) === 'climate'; }).slice(0, 2).forEach(function (t) { var a = (states[t.eid].attributes || {}); if (a.current_temperature != null) chip('<b>' + a.current_temperature + '°</b> ' + esc(t.name.replace(/ AC$/, ''))); });
    chip('<b>' + lightsOn + '</b> of ' + lightsAll + ' lights on');
    var sp = states[SPOTIFY]; if (sp && sp.state === 'playing') chip('<b>♪</b> ' + esc(String((sp.attributes || {}).media_title || 'playing')));
    var ak = Object.keys(states).filter(function (e) { return /^binary_sensor\..*asleep/.test(e); })[0]; if (ak && states[ak].state === 'on') chip('<b>Sleep mode</b>');
    var un = unavailableControls().length; if (un) chip('<b>' + un + '</b> devices offline — see Health', 'bad');
    return wrap;
  }
  function renderTabs() {
    var t = $('tabs'); t.textContent = '';
    PAGES.forEach(function (p) { var b = el('div', 'tab nav' + (p.id === page ? ' active' : ''), T(({now:'Home',cool:'Climate',music:'Media'})[p.id] || p.name)); b.dataset.kind = 'tab'; b.dataset.page = p.id; b.dataset.key = 'tab|' + p.id; t.appendChild(b); });
    var lg = el('div', 'tab nav lang', LANG === 'ar' ? 'EN' : 'عربي'); lg.dataset.kind = 'lang'; lg.dataset.key = 'lang'; t.appendChild(lg);
  }
  // ---- insights / health: drawn, read-only
  function barsSvg(vals, color, marks, w, h) {
    var n = vals.length, bw = w / n, mx = Math.max.apply(null, vals.concat([1])), s = '<svg width="' + w + '" height="' + (h + 34) + '" viewBox="0 0 ' + w + ' ' + (h + 34) + '">';
    vals.forEach(function (v, i) { var bh = Math.round(v / mx * h); s += '<rect x="' + (i * bw + 4) + '" y="' + (h - bh) + '" width="' + (bw - 8) + '" height="' + bh + '" rx="6" fill="' + color + '" opacity="' + (v ? 0.92 : 0.12) + '"/>'; if (!v) s += '<rect x="' + (i * bw + 4) + '" y="' + (h - 4) + '" width="' + (bw - 8) + '" height="4" rx="2" fill="' + color + '" opacity=".25"/>'; if (i % 3 === 0) s += '<text x="' + (i * bw + bw / 2) + '" y="' + (h + 27) + '" fill="#8aa0bf" font-size="22" text-anchor="middle">' + pad2(i) + '</text>'; });
    (marks || []).forEach(function (m) { if (m.h == null) return; var x = m.h / 24 * w; s += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + h + '" stroke="' + m.c + '" stroke-width="3" stroke-dasharray="8 6"/><text x="' + (x + 8) + '" y="24" fill="' + m.c + '" font-size="22">' + esc(m.t) + '</text>'; });
    return s + '</svg>';
  }
  function dualSvg(a, b, w, h) {
    var n = 24, bw = w / n, mx = Math.max.apply(null, a.concat(b, [0.01])), s = '<svg width="' + w + '" height="' + (h + 34) + '" viewBox="0 0 ' + w + ' ' + (h + 34) + '">';
    for (var i = 0; i < n; i++) { var ha = Math.round((a[i] || 0) / mx * h), hb = Math.round((b[i] || 0) / mx * h);
      s += '<rect x="' + (i * bw + 3) + '" y="' + (h - ha) + '" width="' + (bw / 2 - 4) + '" height="' + ha + '" rx="5" fill="#22d3e6" opacity=".9"/><rect x="' + (i * bw + bw / 2 + 1) + '" y="' + (h - hb) + '" width="' + (bw / 2 - 4) + '" height="' + hb + '" rx="5" fill="#b58cff" opacity=".9"/>';
      if (i % 3 === 0) s += '<text x="' + (i * bw + bw / 2) + '" y="' + (h + 27) + '" fill="#8aa0bf" font-size="22" text-anchor="middle">' + pad2(i) + '</text>'; }
    return s + '</svg>';
  }
  function heatSvg(vals, w) {
    var mx = Math.max.apply(null, vals.concat([1])), bw = w / 24, s = '<svg width="' + w + '" height="34" viewBox="0 0 ' + w + ' 34">';
    vals.forEach(function (v, i) { s += '<rect x="' + (i * bw + 1) + '" y="2" width="' + (bw - 2) + '" height="30" rx="5" fill="#22d3e6" opacity="' + (v ? (0.18 + 0.82 * v / mx).toFixed(2) : 0.07) + '"/>'; });
    return s + '</svg>';
  }
  function insightsHtml() {
    if (!habits) return '<div class="msg">Your habit data is not available' + (habitsErr ? ' (' + esc(habitsErr) + ')' : ' yet') + '.<br>It is built on the PC (ha_habits.py) and served by the laptop hub service.</div>';
    var d = habits.day || {}, rooms = Object.keys(habits.rooms || {}), all = []; for (var h = 0; h < 24; h++) { var s = 0; rooms.forEach(function (r) { s += habits.rooms[r].hours[h] || 0; }); all.push(s); }
    var ac = habits.ac && habits.ac.hours_on_per_day || {}, ac1 = ac['climate.ac1_local'] || [], ac2 = ac['climate.ac2_local'] || [], media = (habits.media && habits.media.hours) || [], per = habits.period || {};
    var peak = all.indexOf(Math.max.apply(null, all)), html = '';
    html += '<div class="panel"><h3>Your day, from what you do by hand</h3><div class="cap">Based on ' + esc(per.days) + ' days (' + esc(String(per.start || '').slice(0, 10)) + ' → ' + esc(String(per.end || '').slice(0, 10)) + '). Automations are not counted.</div>' +
      '<div class="kv"><div>First light of the day <span class="big">' + fmtH(d.wake_median_h) + '</span></div><div>Last light off <span class="big">' + fmtH(d.sleep_median_h) + '</span></div><div>Busiest hour <span class="big">' + pad2(peak) + ':00</span></div><div>Arrivals / leaves seen <span class="big">' + (d.arrive_hours || []).length + ' / ' + (d.leave_hours || []).length + '</span></div></div></div>';
    html += '<div class="panel"><h3>When you switch lights</h3><div class="cap">Light switch-ons by hour of the day, all rooms. Dashed lines: your usual first light and last light off.</div>' + barsSvg(all, '#22d3e6', [{ h: d.wake_median_h, c: '#ffc04d', t: 'first light ' + fmtH(d.wake_median_h) }, { h: d.sleep_median_h, c: '#b58cff', t: 'lights out ' + fmtH(d.sleep_median_h) }], 1740, 150) + '</div>';
    html += '<div class="two"><div class="panel"><h3>Cooling — hours the AC runs</h3><div class="cap"><span style="color:#22d3e6">■</span> Living Room AC &nbsp; <span style="color:#b58cff">■</span> Bedroom AC &nbsp; (hours per day, by hour)</div>' + dualSvg(ac1, ac2, 850, 130) + '</div>' +
      '<div class="panel"><h3>Music — when you start it</h3><div class="cap">Spotify sessions by hour</div>' + barsSvg(media, '#1ed760', [], 850, 130) + '</div></div>';
    html += '<div class="panel"><h3>Room by room</h3><div class="cap">Each cell is one hour of the day (00 → 23). Darker = you switch lights there more often at that hour.</div>' +
      rooms.slice(0, 6).map(function (r) { return '<div class="strip"><span class="lab">' + esc(r) + '</span>' + heatSvg(habits.rooms[r].hours, 1380) + '<span class="tot">' + habits.rooms[r].total + '</span></div>'; }).join('') + '</div>';
    html += '<div class="cap" style="margin:6px 8px 20px">Habit model built ' + esc(String(habits.generated || '').slice(0, 16).replace('T', ' ')) + ' · private to your home network · refresh: run ha_habits.py on the PC</div>';
    return html;
  }
  function healthHtml() {
    var un = unavailableControls(), offAuto = [], onAuto = 0, noArea = 0, html = '';
    Object.keys(states).forEach(function (e) { var s = states[e]; if (dom(e) === 'automation') { if (s.state === 'off') offAuto.push(nameOf(e)); else onAuto++; } });
    Object.keys(states).forEach(function (e) { if (dom(e) === 'light' && eligible(e) && !/_segment_\d+$/.test(e) && !(entArea[e] && entArea[e] !== '\u0000hidden')) noArea++; });
    var grp = {}; un.forEach(function (e) { var n = nameOf(e).split(' ')[0]; (grp[n] = grp[n] || []).push(e); });
    var li = Object.keys(grp).sort(function (a, b) { return grp[b].length - grp[a].length; }).slice(0, 12).map(function (g) { return '<div><span class="bad">●</span> ' + esc(g) + ' <span class="dim">— ' + grp[g].length + ' offline</span></div>'; }).join('');
    html += '<div class="two"><div class="panel"><h3>Offline right now</h3><div class="big">' + un.length + '<small>things you control are not answering</small></div><div class="list" style="margin-top:10px">' + (li || '<div class="ok">✔ everything answers</div>') + '</div></div>';
    html += '<div class="panel"><h3>Automations</h3><div class="big">' + onAuto + '<small>running</small></div><div class="big" style="color:#ffc04d">' + offAuto.length + '<small>switched off</small></div><div class="list dim" style="margin-top:6px">' + offAuto.slice(0, 7).map(function (n) { return '<div>○ ' + esc(n) + '</div>'; }).join('') + (offAuto.length > 7 ? '<div>… and ' + (offAuto.length - 7) + ' more</div>' : '') + '</div></div></div>';
    html += '<div class="panel"><h3>Tidiness</h3><div class="list">' + (noArea ? '<div><span class="bad">●</span> ' + noArea + ' lights have no room assigned</div>' : '<div class="ok">✔ every light has a room</div>') + '<div class="dim">Names and rooms are kept in step with Alexa and Home Assistant — see the Names &amp; freshness report on the PC.</div></div></div>';
    return html;
  }
  function meterKind(state) {
    var kind = state && state.attributes && state.attributes.device_class;
    return kind === 'power' || kind === 'energy' ? kind : '';
  }

  function renderReadings(grid) {
    var count = 0;
    var groups = page === 'cameras' ? ['ring','echo','camera'] : page === 'security' ? ['security'] : ['power', 'energy'];
    groups.forEach(function (group) {
      var ids = Object.keys(states).filter(function (id) {
        if (entArea[id] === '\u0000hidden') return false;
        if(group==='ring')return ringViews().includes(id);
        if(group==='echo')return dom(id)==='camera' && /echo|alexa|amazon/i.test(id+' '+rawName(id));
        if(group==='camera' && (ringViews().includes(id)||/echo|alexa|amazon/i.test(id+' '+rawName(id))))return false;
        if (group === 'security') return dom(id) === 'lock' || dom(id) === 'alarm_control_panel';
        return group === 'camera' ? dom(id) === 'camera' && !/last_recording/i.test(id) : dom(id) === 'sensor' && meterKind(states[id]) === group;
      }).sort(function (a, b) { return nameOf(a).localeCompare(nameOf(b)); });
      if (!ids.length) return;
      grid.appendChild(el('div', 'area', display({ring:'Ring',echo:'Echo cameras',security:'Security', camera:'Other cameras', power:'Power', energy:'Energy meters'}[group])));
      var row = el('div', 'row'); grid.appendChild(row);
      ids.forEach(function (id) {
        var s = states[id], tile = el('div', 'tile nav reading');
        tile.dataset.kind = ['ring','echo','camera'].includes(group)?'camera':group;
        tile.dataset.key = id;
        tile.appendChild(el('div', 'name', nameOf(id)));
        tile.appendChild(el('div', 'state', tile.dataset.kind === 'camera' ? T(s.state) + ' · ' + ((entPlat[id]==='ezviz'||id==='camera.hall_h_1702') && !s.attributes.supported_features ? display('Doorbell snapshot') : T('OK for live view')) :
          T(s.state) + (isFinite(parseFloat(s.state)) ? ' ' + (s.attributes.unit_of_measurement || '') : '')));
        row.appendChild(tile);
      });
      count += ids.length;
    });
    if(page==='cameras'){
      var echoes=Object.values(devInfo).filter(d=>/echo show/i.test(d.model||''));
      if(echoes.length && !Object.keys(states).some(e=>dom(e)==='camera' && /echo|alexa|amazon/i.test(e+' '+rawName(e)))){
        grid.appendChild(el('div','area',display('Echo cameras')));
        grid.appendChild(el('div','panel',echoes.map(d=>display(d.model)).join(' · ')+' — '+display('Camera feed not exposed')));
      }
    }
    if (!count) showMsg(T('Nothing to show here.'));
    mark();
  }

  function closeCamera() {
    if (stopCamera) { stopCamera(); stopCamera = null; }
    var overlay = $('stream-view');
    if (overlay) overlay.remove();
  }
  function openCamera(id) {
    closeCamera();
    stopPreview(); var overlay = el('section','snapshot'); overlay.id = 'stream-view';
    overlay.appendChild(el('div','area',nameOf(id)));
    var status = el('div','msg',T(DEMO ? 'Demo camera' : 'Connecting live feed'));
    overlay.appendChild(status); document.body.appendChild(overlay);
    if (DEMO || !ws) return;
    var cs=states[id],cp=cs && cs.attributes.entity_picture;
    if ((entPlat[id]==='ezviz'||id==='camera.hall_h_1702') && !cs.attributes.supported_features) {
      status.textContent=display('Doorbell snapshot');
      if(!cp || cp.indexOf('/api/camera_proxy/')!==0){status.textContent=display('Snapshot unavailable');return;}
      var im=el('img'); im.alt=nameOf(id); im.onload=function(){status.hidden=true;};
      im.onerror=function(){status.textContent=display('Snapshot unavailable');};
      overlay.firstChild.textContent=nameOf(id)+' · '+display('Doorbell snapshot');
      im.src=new URL(cp,ws.url.replace(/^ws/,'http')).href+(cp.includes('?')?'&':'?')+'time='+Date.now();
      overlay.append(im);return;
    }
    stopCamera = startHubCamera(id,cameraApi(),overlay,status);
  }

  const previewFrames = new Map(), previewAttempts = new Map();
  let activePreview = null;
  function stopPreview() {
    if (!activePreview) return;
    const job = activePreview; activePreview = null;
    job.stop(); job.host.remove();
  }
  function updatePreviews() {
    const tiles = Array.from(document.querySelectorAll('[data-preview]'));
    if (DEMO || !ws || ws.readyState !== 1 || document.hidden || !tiles.length || document.getElementById('stream-view')) {
      stopPreview(); return;
    }
    const now = Date.now();
    for (const tile of tiles) {
      const id = tile.dataset.preview, frame = previewFrames.get(id);
      let img = tile.querySelector('img');
      if (frame && now-frame.time < 120000) {
        if (!img) { img = document.createElement('img'); img.className='ha-picture'; img.alt=''; tile.prepend(img); }
        if (img.getAttribute('src') !== frame.src) img.src=frame.src;
      } else if (img) img.remove();
    }
    if (activePreview) {
      const job = activePreview, video = job.host.querySelector('video');
      if (video && video.readyState >= 2 && video.videoWidth && video.currentTime > 0) {
        try {
          const canvas=document.createElement('canvas'); canvas.width=320; canvas.height=Math.max(1,Math.round(320*video.videoHeight/video.videoWidth));
          canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
          previewFrames.set(job.id,{time:now,src:canvas.toDataURL('image/jpeg',0.78)});
        } catch(e) {}
        stopPreview();
      } else if (now-job.started > 25000 || job.status.textContent===T('Live feed unavailable')) stopPreview();
      return;
    }
    const id=tiles.map(tile=>tile.dataset.preview).sort((a,b)=>(previewAttempts.get(a)||0)-(previewAttempts.get(b)||0))[0];
    if(now-(previewAttempts.get(id)||0)<60000)return;
    const host=document.createElement('div'), status=document.createElement('span');
    host.style.cssText='position:fixed;left:-100px;top:0;width:8px;height:8px;overflow:hidden;pointer-events:none';
    host.setAttribute('aria-hidden','true'); document.body.appendChild(host);
    previewAttempts.set(id,now);
    activePreview={id,host,status,started:now,stop:startHubCamera(id,cameraApi(),host,status)};
  }
  setInterval(updatePreviews,1000);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPreview();});
  function cameraApi(){ return {
      t:T, request:request, origin:ws.url.replace(/^ws/,'http'),
      subscribe:function(msg,fn,failed) {
        var key = nextId; cameraEvents[key] = fn; request(msg).catch(failed); return key;
      },
      unsubscribe:function(key) {
        delete cameraEvents[key];
        if (ws.readyState === 1) request({type:'unsubscribe_events',subscription:key}).catch(function(){});
      },
      log:function(outcome) { beacon('livecamera',outcome); }
    }; }

  var meterHistoryCache = {};
  function meterHistory(id) {
    if (!ws || ws.readyState !== 1) return Promise.resolve([]);
    var now = Date.now(), old = meterHistoryCache[id];
    if (old && now-old.at < 300000) return old.values;
    var values = request({type:'history/history_during_period', start_time:new Date(now-86400000).toISOString(),
      end_time:new Date(now).toISOString(), entity_ids:[id],minimal_response:true,no_attributes:true}).then(function(result){
      var buckets = Array.from({length:24},function(){return [];});
      (result[id] || []).forEach(function(row) {
        var hour = Math.floor((Number(row.lu)*1000-(now-86400000))/3600000), value = parseFloat(row.s);
        if (hour>=0 && hour<24 && isFinite(value)) buckets[hour].push(value);
      });
      if (!buckets.some(function(b){return b.length;})) return [];
      return buckets.map(function(b){return b.length ? b.reduce(function(a,v){return a+v;},0)/b.length : null;});
    }).catch(function(){return [];});
    meterHistoryCache[id]={at:now,values:values};return values;
  }

  var mapClose=null, mapOverlay=null, privateMap=null;
  function closeMap(){if(mapClose)mapClose();mapClose=null;if(mapOverlay)mapOverlay.remove();mapOverlay=null;}
  async function openMap(){
    closeMap();var ov=el('section','map-overlay');mapOverlay=ov;document.body.append(ov);ov.textContent=display('Loading');
    try {
      if(!privateMap){var response=await fetch(HUB+'/house-map.json',{cache:'no-store'});if(!response.ok)throw Error('map '+response.status);privateMap=await response.json();}
      if(mapOverlay!==ov)return;
      var domains=['light','fan','camera','climate','vacuum','media_player','switch','lock','cover','alarm_control_panel'];
      var ids=Object.keys(states).filter(e=>eligible(e)&&domains.includes(dom(e))&&!/_segment_\d+$/.test(e));
      var claimed=new Set();
      function resolve(d){
        var explicit=d.entities.filter(e=>states[e]); if(explicit.length===1)return explicit[0];
        var hits=ids.filter(e=>rawName(e).trim().toLowerCase()===d.name.trim().toLowerCase());
        return hits.length===1?hits[0]:null;
      }
      privateMap.devices.forEach(d=>{var id=resolve(d);if(id)claimed.add(id);});
      var roomAlias={'master bedroom':'Master Room','guest bedroom':'Bedroom 2','guest bathroom':'Bathroom 2','laundry room':'Laundry'};
      var extra=ids.filter(e=>!claimed.has(e)).map(e=>{var room=roomName(lightArea(e)||'');
        return {name:rawName(e),room:roomAlias[room.toLowerCase()]||room,kind:dom(e),entities:[e],x:null,y:null,z:null};});
      var modelData=Object.assign({},privateMap,{devices:privateMap.devices.concat(extra)});
      mapClose=FlatMap.mount(ov,modelData,{language:LANG,translate:display,close:closeMap,name:nameOf,state:e=>display(states[e]?.state||'unavailable'),resolve:resolve,
        action:e=>{if(dom(e)==='camera')return {label:'Live view',run:()=>openCamera(e)};
          if(['light','fan'].includes(dom(e)) && !HIDE_RX.test(e+' '+rawName(e)) && !(entLab[e]||[]).includes('not_in_room_rules'))return {label:'On / Off',run:()=>call(dom(e),'toggle',e,null,nameOf(e))};return null; }});
    }catch(e){if(mapOverlay===ov)ov.textContent=display('House map')+' · '+e.message+' · '+display('Return');}
  }
  function render() {
    document.body.classList.toggle('home',page === 'now'); document.body.dataset.page = page;
    var title = PAGES.find(function (entry) { return entry.id === page; });
    $('section-title').textContent = title ? T(({now:'Home',cool:'Climate',music:'Media'})[page] || title.name) : '';
    renderTabs(); var g = $('grid'); g.textContent = ''; model = {};
    if (page === 'security' || page === 'energy' || page === 'cameras') { renderReadings(g); return; }
    if (page === 'insights') { g.innerHTML = insightsHtml(); mark(); return; }
    if (page === 'health') { g.innerHTML = healthHtml(); mark(); return; }
    document.body.classList.toggle('home',page === 'now');
    if (page === 'now') {
      g.appendChild(hubHome(states,T,SPOTIFY,nameOf,entArea,sceneTiles(),ws && ws.url.replace(/^ws/,'http'),meterHistory,ringViews()));
      var mapTile=el('div','tile nav',display('House map'));mapTile.dataset.kind='map';mapTile.dataset.key='house-map';g.insertBefore(mapTile,g.firstChild.nextSibling);
      g.appendChild(statusStrip());
    }
    var secs = page==='rooms'?roomSections(g):sectionsFor(page), count = 0;
    secs.forEach(function (sec) {
      if (!sec.tiles.length) return;
      g.appendChild(el('div', 'area', sec.title));
      var row = el('div', 'row'); g.appendChild(row);
      sec.tiles.forEach(function (tile) { model[tile.key] = tile; var t = el('div', 'tile nav'); t.dataset.kind = 'tile'; t.dataset.key = tile.key; fillTile(t, tile); row.appendChild(t); count++; });
    });
    beacon('render', { page: page, tiles: count });
    if(!count && page==='rooms')g.appendChild(el('div','msg',T('Nothing to show here.')));else if (!count && page !== 'now') showMsg(T('Nothing to show here.'));
    mark();
  }
  function renderKeepSel() { var top = $('grid').scrollTop; render(); $('grid').scrollTop = top; }
  function setPage(p) { if (p === page) return; closeCamera(); page = p; selKey = 'tab|' + p; render(); $('grid').scrollTop = 0; beacon('page', p); }

  // ---------- spatial navigation ----------
  function navEls() { return Array.prototype.slice.call(document.querySelectorAll('.nav')); }
  function keyOf(e) { return e.dataset.kind === 'mini' ? 'mini|' + e.dataset.key + '|' + e.dataset.act : e.dataset.key; }
  function curEl() { var all = navEls(); for (var i = 0; i < all.length; i++) if (all[i].classList.contains('sel')) return all[i]; return null; }
  function mark(target) {
    navEls().forEach(function (e) { e.classList.remove('sel'); });
    var all = navEls(), t = target;
    if (!t) { for (var i = 0; i < all.length; i++) { if (keyOf(all[i]) === selKey) { t = all[i]; break; } } }
    if (!t) t = document.querySelector('.hub-card') || document.querySelector('.tile') || document.querySelector('.tab.active');
    if (t) {
      t.classList.add('sel'); selKey = keyOf(t);
      if (t.dataset.kind === 'tab' || t.dataset.kind === 'lang') return; else if (document.querySelector('.tile') === t) $('grid').scrollTop = 0; else t.scrollIntoView({ block: 'center' });
    }
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
  function stepPage(d) { var i = 0; PAGES.forEach(function (p, k) { if (p.id === page) i = k; }); var n = PAGES[(i + d + PAGES.length) % PAGES.length]; selKey = 'tab|' + n.id; setPage(n.id); }
  function everywhere() {
    var s = states[SPOTIFY], src = s && ((s.attributes && s.attributes.source_list) || []).filter(function (x) { return /everywhere/i.test(x); })[0];
    if (DEMO) { toast('Spotify → Everywhere'); return; }
    if (!src) { toast('Spotify has no "Everywhere" speaker right now'); return; }
    call('media_player', 'select_source', SPOTIFY, { source: src }, 'Spotify → ' + src).then(function () { setTimeout(function () { request({ type: 'call_service', domain: 'media_player', service: 'media_play', target: { entity_id: [SPOTIFY] } }).catch(function () {}); }, 900); });
  }
  function activate() {
    var cur = curEl(); if (!cur) return;
    if(cur.dataset.kind==='roomtab'){selectedRoom=cur.dataset.room;selKey=cur.dataset.key;render();$('grid').scrollTop=0;return;}
    if (cur.dataset.kind === 'map') {openMap();return;}
    if (cur.dataset.kind === 'home-scene') {
      var scene = sceneTiles().find(function(tile){return tile.eid === cur.dataset.key;});
      if (scene) call(dom(scene.eid),'turn_on',scene.eid,null,scene.name);
      return;
    }
    if (cur.dataset.kind === 'shortcut') { selKey = 'tab|' + cur.dataset.page; setPage(cur.dataset.page); return; }
    if (cur.dataset.kind === 'camera') { openCamera(cur.dataset.key); return; }
    if (cur.dataset.kind === 'power' || cur.dataset.kind === 'energy') return;
    if (cur.dataset.kind === 'tab') { setPage(cur.dataset.page); return; }
    if (cur.dataset.kind === 'lang') { toggleLang(); return; }
    if (cur.dataset.kind === 'mini') {
      var tile = model[cur.dataset.key], act = cur.dataset.act; if (!tile) return;
      if (dom(tile.eid||'')==='fan') {
        var a=states[tile.eid].attributes||{}, modes=a.preset_modes||[], service, args={};
        if (act==='fan-up'||act==='fan-down') {service='set_percentage';args.percentage=Math.max(0,Math.min(100,Math.round((a.percentage||0)+(act==='fan-up'?1:-1)*(a.percentage_step||10))));}
        else if(act==='fan-preset' && modes.length){service='set_preset_mode';args.preset_mode=modes[(modes.indexOf(a.preset_mode)+1)%modes.length];}
        else if(act==='fan-swing'){service='oscillate';args.oscillating=!a.oscillating;}
        if(service)call('fan',service,tile.eid,args,tile.name);return;
      }
      if (tile.kind === 'light') {
        var ls = states[tile.eid], la = (ls && ls.attributes) || {}, isOn = ls && ls.state === 'on';
        if (act === 'bup') { if (isOn) call('light', 'turn_on', tile.eid, { brightness_step_pct: 20 }, tile.name + ' ☀'); else call('light', 'turn_on', tile.eid, { brightness_pct: 40 }, tile.name + ' 40%'); }
        else if (act === 'bdn') { if (isOn) call('light', 'turn_on', tile.eid, { brightness_step_pct: -20 }, tile.name + ' ☾'); }
        else if (act === 'tone') {
          var fx = (la.effect_list || []).filter(function (x) { return x && x !== 'None'; });
          if (fx.length) { var nx = fx[(fx.indexOf(la.effect) + 1) % fx.length]; call('light', 'turn_on', tile.eid, { effect: nx }, tile.name + ' · ' + nx); }
          else if ((la.supported_color_modes || []).indexOf('color_temp') >= 0) {
            var ks = [2700, 4000, 5500, 6500], ck = la.color_temp_kelvin || 0, nk = ks[0];
            for (var i = 0; i < ks.length; i++) { if (ks[i] > ck + 50) { nk = ks[i]; break; } }
            call('light', 'turn_on', tile.eid, { color_temp_kelvin: nk }, tile.name + ' · ' + nk + 'K');
          } else toast(tile.name + ': no tone / effect control');
        }
        return;
      }
      if (tile.kind === 'vac') { if (act === 'dock') call('vacuum', 'return_to_base', tile.eid, null, tile.name + ' ⌂'); return; }
      if (tile.kind === 'room') {
        var onE = tile.eids.filter(function (e) { return states[e] && states[e].state === 'on'; });
        if (act === 'bup') { if (onE.length) call('light', 'turn_on', onE, { brightness_step_pct: 20 }, tile.name + ' brighter'); else call('light', 'turn_on', tile.eids, { brightness_pct: 40 }, tile.name + ' 40%'); }
        else if (onE.length) call('light', 'turn_on', onE, { brightness_step_pct: -20 }, tile.name + ' dimmer');
        return;
      }
      if (tile.kind === 'volume') {
        var sp = states[SPOTIFY], v = sp && sp.attributes && sp.attributes.volume_level; if (v == null) { toast('Spotify volume not available'); return; }
        v = Math.max(0, Math.min(1, v + (act === 'vup' ? 0.05 : -0.05))); call('media_player', 'volume_set', SPOTIFY, { volume_level: Math.round(v * 100) / 100 }, 'Volume ' + Math.round(v * 100) + '%'); return;
      }
      var eid = tile.eid, s = eid && states[eid]; if (!s) return;
      if (dom(eid) === 'climate') { var a = s.attributes || {}, step = a.target_temp_step || 1, t = (a.temperature != null ? a.temperature : (a.current_temperature || 24)) + (act === 'up' ? step : -step); call('climate', 'set_temperature', eid, { temperature: t }); }
      else if (eid === SPOTIFY) call('media_player', act === 'next' ? 'media_next_track' : 'media_previous_track', eid, null, 'Spotify');
      return;
    }
    var tl = model[cur.dataset.key]; if (!tl) return;
    if(tl.kind==='roomRecord'||tl.kind==='roomStatus')return;
    if(tl.eid&&dom(tl.eid)==='camera'){openCamera(tl.eid);return;}
    if (tl.kind === 'room') { var anyOn = tl.eids.some(function (e) { return states[e] && states[e].state === 'on'; }); call('light', anyOn ? 'turn_off' : 'turn_on', tl.eids, null, tl.name); return; }
    if (tl.kind === 'light') { var lst = states[tl.eid]; call('light', lst && lst.state === 'on' ? 'turn_off' : 'turn_on', tl.eid, null, tl.name); return; }
    if (tl.kind === 'vac') { var vs = states[tl.eid]; call('vacuum', vs && vs.state === 'cleaning' ? 'pause' : 'start', tl.eid, null, tl.name); return; }
    if (tl.kind === 'src') { playOn(tl.src); return; }
    if (tl.kind === 'everywhere') { everywhere(); return; }
    if (tl.kind === 'volume') { var s2 = states[SPOTIFY]; call('media_player', 'volume_mute', SPOTIFY, { is_volume_muted: !(s2 && s2.attributes && s2.attributes.is_volume_muted) }, 'Mute'); return; }
    var e2 = tl.eid, d = dom(e2), st = states[e2];
    if (d === 'fan') call('fan', 'toggle', e2);
    else if (d === 'climate') call('climate', st.state === 'off' ? 'turn_on' : 'turn_off', e2);
    else if (d === 'scene') call('scene', 'turn_on', e2);
    else if (d === 'script') call('script', 'turn_on', e2);
    else if (e2 === SPOTIFY) call('media_player', 'media_play_pause', e2, null, 'Spotify');
  }
  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if(mapOverlay && !$('stream-view')){if(k===10009||k===27){closeMap();e.preventDefault();}return;}
    if ($('stream-view')) {
      if (k === 10009 || k === 27 || k === 13) closeCamera();
      e.preventDefault(); return;
    }
    if (keysSeen < 25) { keysSeen++; beacon('key', { code: k, sel: selKey }); }
    if (k === 37) { move('left'); e.preventDefault(); } else if (k === 39) { move('right'); e.preventDefault(); }
    else if (k === 38) { move('up'); e.preventDefault(); } else if (k === 40) { move('down'); e.preventDefault(); }
    else if (k === 13) { if (canDemo && !DEMO) { DEMO = true; canDemo = false; connect(); } else activate(); e.preventDefault(); }
    else if (k === 427 || k === 34) { stepPage(1); e.preventDefault(); } else if (k === 428 || k === 33) { stepPage(-1); e.preventDefault(); }
    else if (k >= 403 && k <= 406) { var pg = PAGES.filter(function (p) { return p.key === k; })[0]; if (pg) { selKey = 'tab|' + pg.id; setPage(pg.id); } e.preventDefault(); }
    else if (k === 10009 || k === 27) { try { tizen.application.getCurrentApplication().exit(); } catch (x) {} }
  });
  try { ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'ChannelUp', 'ChannelDown'].forEach(function (n) { tizen.tvinputdevice.registerKey(n); }); } catch (e) {}

  // ---------- voice: Bixby (hold the remote's MIC button) → Samsung VoiceInteraction callbacks ----------
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function selectTileEl(key) { var t = document.querySelector('.tile[data-key="' + key + '"]'); if (t) mark(t); return t; }
  function voiceSelectTitle(title) {
    var q = norm(title); if (!q) return false;
    var pg = PAGES.filter(function (p) { return norm(p.name) === q; })[0]; if (pg) { toast('🎤 ' + pg.name); selKey = 'tab|' + pg.id; setPage(pg.id); return true; }
    var found = null;
    Object.keys(model).forEach(function (key) { if (found) return; var n = norm(model[key].name); if (n === q || (n && (n.indexOf(q) >= 0 || q.indexOf(n) >= 0))) found = key; });
    if (!found) { toast('🎤 "' + title + '" — nothing with that name'); return false; }
    if (!selectTileEl(found)) return false;
    toast('🎤 ' + model[found].name); activate(); return true;
  }
  function visibleTiles() { return Array.prototype.slice.call(document.querySelectorAll('.tile')).filter(function (t) { var r = t.getBoundingClientRect(); return r.width && r.bottom > 0 && r.top < window.innerHeight; }); }
  function setupVoice() {
    var vi = window.webapis && webapis.voiceinteraction;
    if (!vi) { beacon('voice', 'webapis.voiceinteraction not available'); return; }
    try {
      var cb = {};
      ['onchangeappstate', 'onplay', 'onpause', 'onfastforward', 'onrewind', 'onchangeprevioustrack', 'onchangenexttrack', 'onrestart', 'onskipbackward', 'onskipforward',
        'onsetplayposition', 'onchangesubtitlemode', 'onchangeshufflemode', 'onchangescreenfitmode', 'onzoom', 'onrotate', 'onchange360mode', 'onchangerepeatmode',
        'onadditiontolist', 'onremovalfromlist', 'onplaylist', 'onbrowselist', 'onskipad'].forEach(function (name) {
        cb[name] = function () { var a = Array.prototype.slice.call(arguments).map(String); beacon('voice.' + name, a); toast('🎤 ' + name.replace(/^on/, '') + (a.length ? ' ' + a.join(',') : '')); return false; };
      });
      var handled = {
        onupdatestate: function () { beacon('voice.onupdatestate', {}); return 'List'; },
        onrequestcontentcontext: function () {
          var items = [];
          PAGES.forEach(function (p) { items.push(vi.buildVoiceInteractionContentContextItem(0, 0, p.name, [p.name.toLowerCase()], p.id === page)); });
          visibleTiles().forEach(function (t) { var tl = model[t.dataset.key]; if (!tl) return; var r = t.getBoundingClientRect(), n = tl.name; items.push(vi.buildVoiceInteractionContentContextItem(Math.round(r.left), Math.round(r.top), n, [n.toLowerCase()], t.classList.contains('sel'))); });
          beacon('voice.context', { items: items.length }); toast('🎤 listening — say a page, room or tile name'); return vi.buildVoiceInteractionContentContextResponse(items);
        },
        ontitleselection: function (title) { beacon('voice.title', { title: title }); toast('🎤 title: ' + title); return voiceSelectTitle(title); },
        onselection: function (n) {
          beacon('voice.selection', { n: n }); toast('🎤 selection ' + n); var v = visibleTiles();
          if (n === 0) { activate(); return true; } var t = n === -1 ? v[v.length - 1] : v[n - 1]; if (!t) return false; mark(t); activate(); return true;
        },
        onnavigation: function (nav) {
          beacon('voice.nav', { nav: String(nav) }); toast('🎤 ' + String(nav));
          if (nav === 'NAV_NEXT') { stepPage(1); return true; } if (nav === 'NAV_PREVIOUS') { stepPage(-1); return true; }
          var map = { NAV_LEFT: 'left', NAV_RIGHT: 'right', NAV_UP: 'up', NAV_DOWN: 'down' };
          if (map[nav]) { move(map[nav]); return true; } return false;
        }
      };
      Object.keys(handled).forEach(function (k) { cb[k] = handled[k]; });
      vi.setCallback(cb); vi.listen(); beacon('voice', 'listening');
    } catch (e) { beacon('voice', { error: String(e) }); }
  }

  // ---------- demo data (local layout test: index.html?demo&page=insights) ----------
  function demoHabits() {
    var z = function () { var a = []; for (var i = 0; i < 24; i++) a.push(0); return a; }, lr = z(), mb = z(), hall = z(), k = z(), gb = z(), ac1 = z(), ac2 = z(), med = z(), i;
    [11, 12, 13, 15, 17, 18, 18, 19, 19, 20, 20, 20, 21, 21, 22, 23, 0, 1, 2].forEach(function (h) { lr[h] += 3 + (h > 17 ? 6 : 0); }); [18, 20, 22, 23, 0, 1, 2, 2, 3].forEach(function (h) { mb[h] += 4; }); [10, 17, 19, 22].forEach(function (h) { hall[h] += 4; }); [11, 12, 18, 19].forEach(function (h) { k[h] += 3; }); [21, 22, 23].forEach(function (h) { gb[h] += 2; });
    for (i = 11; i < 24; i++) { ac1[i] = 0.4 + (i > 13 && i < 22 ? 0.55 : 0); } for (i = 0; i < 6; i++) { ac1[i] = 0.5; ac2[i] = 0.7; } for (i = 20; i < 24; i++) ac2[i] = 0.6; [12, 14, 16, 18, 20, 21].forEach(function (h) { med[h] = 2 + h % 3; });
    return { version: 1, generated: '2026-10-24T23:50:00+04:00', period: { start: '2026-10-14T04:12', end: '2026-10-24T23:50', days: 10.8 },
      rooms: { 'Living Room': { hours: lr, total: 157 }, 'Master Bedroom': { hours: mb, total: 78 }, 'Hall': { hours: hall, total: 45 }, 'Kitchen': { hours: k, total: 30 }, 'Guest Bedroom': { hours: gb, total: 17 } },
      suggest: { morning: [{ type: 'entity', eid: 'climate.ac2', why: 'runs about 1.4 h a day in the mornings' }], afternoon: [{ type: 'room', room: 'Living Room', why: 'lights switched on 35 times in the afternoons' }, { type: 'entity', eid: 'climate.ac1', why: 'runs about 2.9 h a day in the afternoons' }, { type: 'entity', eid: 'media_player.spotify', why: 'music started 16 times in the afternoons' }],
        evening: [{ type: 'room', room: 'Living Room', why: 'lights switched on 81 times in the evenings' }, { type: 'room', room: 'Master Room', why: 'lights switched on 33 times in the evenings' }, { type: 'room', room: 'Hall', why: 'lights switched on 22 times in the evenings' }, { type: 'entity', eid: 'climate.ac1', why: 'runs about 3.1 h a day in the evenings' }, { type: 'entity', eid: 'media_player.spotify', why: 'music started 8 times in the evenings' }], night: [{ type: 'room', room: 'Living Room', why: 'lights switched on 38 times at night' }] },
      ac: { hours_on_per_day: { 'climate.ac1_local': ac1, 'climate.ac2_local': ac2 } }, media: { hours: med }, day: { wake_median_h: 7.5, sleep_median_h: 23.25, arrive_hours: [18, 18, 19], leave_hours: [8, 8, 9] } };
  }
  function loadDemo() {
    var S = function (id, state, name, a) { states[id] = { entity_id: id, state: state, attributes: Object.assign({ friendly_name: name }, a || {}) }; };
    S('camera.demo', 'idle', 'Demo camera');
    S('sensor.demo_power', '452', 'Apartment power', {device_class:'power', unit_of_measurement:'W'});
    S('sensor.demo_energy', '12.6', 'Meter energy', {device_class:'energy', unit_of_measurement:'kWh'});
    S('light.lr_ceiling', 'on', 'LR ceiling', { brightness: 200 }); S('light.lr_nano', 'on', 'Nanoleaf wall', { brightness: 120 }); S('light.lr_lamp', 'off', 'LR lamp'); S('light.tv_lights', 'on', 'TV Lights');
    S('light.mbr_main', 'off', 'Master main'); S('light.mbr_bed', 'on', 'Bed light', { brightness: 80 }); S('light.hall', 'off', 'Hall LED strip'); S('light.kitchen', 'on', 'Kitchen', { brightness: 255 }); S('light.guest', 'unavailable', 'Guest lamp');
    S('climate.ac1', 'cool', 'Living Room AC', { current_temperature: 25.5, temperature: 24, target_temp_step: 0.5 }); S('climate.ac2', 'off', 'Bedroom AC', { current_temperature: 27, temperature: 24 });
    S('fan.lr_fan', 'on', 'Tower fan', { percentage: 66 }); S('scene.home', 'scening', 'Home'); S('scene.away', 'scening', 'Away'); S('script.presence_snooze_master', 'off', 'Pause bedroom lights 10 min'); S('script.room_devices', 'off', 'Room devices');
    S('person.demo', 'home', 'Demo user'); S('binary_sensor.demo_asleep', 'off', 'Asleep'); S('automation.a1', 'on', 'AC idle limit'); S('automation.a2', 'off', 'AC2 on at arrival'); S('automation.a3', 'off', 'Vacuum when away'); S('automation.a4', 'on', 'Sunset lights');
    S('media_player.vacuum_x', 'unavailable', 'Vacuum'); S('media_player.dual', 'unavailable', 'Dual 200S');
    S(SPOTIFY, 'playing', 'Spotify', { media_title: 'Hotel California', media_artist: 'Eagles', volume_level: 0.35, source_list: ['Echo Dot', 'Everywhere', 'Hall Echo Show 5', 'Max', 'Pop', 'Q-Series Soundbar', 'S11', 'YTV'], source: 'Everywhere' });
    ['light.lr_ceiling', 'light.lr_nano', 'light.lr_lamp', 'light.tv_lights'].forEach(function (e) { entArea[e] = 'Living Room'; });
    ['light.mbr_main', 'light.mbr_bed'].forEach(function (e) { entArea[e] = 'Master Room'; }); entArea['light.kitchen'] = 'Kitchen'; entArea['light.hall'] = 'Hall'; entArea['light.guest'] = 'Guest Bedroom';
    S('vacuum.qrevo_s_pro_series', 'docked', 'Qrevo S Pro Series', { fan_speed: 'quiet' }); S('sensor.qrevo_s_pro_series_battery', '100', 'Battery');
    states['light.mbr_bed'].attributes.effect_list = ['Sunrise', 'Reading', 'Night']; states['light.lr_ceiling'].attributes.color_temp_kelvin = 4000;
    entPlat['light.lr_ceiling'] = 'mqtt'; entPlat['light.mbr_main'] = 'mqtt'; entPlat['light.mbr_bed'] = 'mqtt'; entPlat['light.kitchen'] = 'mqtt'; entPlat['light.guest'] = 'mqtt'; entPlat['light.tv_lights'] = 'mqtt';
    devInfo.g = { mf: 'Govee' }; ['light.lr_ceiling', 'light.mbr_main', 'light.mbr_bed', 'light.kitchen', 'light.guest', 'light.tv_lights'].forEach(function (e) { entDev[e] = 'g'; });
    entPlat['light.lr_nano'] = 'nanoleaf'; entPlat['light.lr_lamp'] = 'lepro_led'; entPlat['light.hall'] = 'lepro_led';
  }

  beacon('boot', { v: VERSION, ua: navigator.userAgent, href: location.href, viewport: innerWidth + 'x' + innerHeight });
  if (/[?&]lang=ar\b/.test(location.search)) LANG = 'ar';
  applyLang(); tick(); showMsg('Connecting to Home Assistant…'); connect(); setupVoice();
})();
