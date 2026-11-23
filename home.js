function hubHome(states, t, spotify, nameOf, areas, sceneList, haOrigin, energyHistory) {
  const make = (tag, cls, text) => {
    const n = document.createElement(tag); n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const ids = Object.keys(states).filter(id => areas[id] !== '\u0000hidden').sort();
  const lights = ids.filter(id => id.startsWith('light.') && states[id].state !== 'unavailable');
  const climate = ids.find(id => id.startsWith('climate.') && states[id].attributes.current_temperature != null);
  const power = ids.filter(id => states[id].attributes.device_class === 'power' && Number.isFinite(parseFloat(states[id].state)));
  const cameras = ids.filter(id => id.startsWith('camera.') && !/last_recording/i.test(id));
  const security = ids.filter(id => id.startsWith('alarm_control_panel.') || id.startsWith('lock.'));
  const root = make('div','overview');
  const hero = make('div','hub-hero');
  hero.setAttribute('role','img'); hero.setAttribute('aria-label','Y214 TV Hub · Operating System for Reality'); root.appendChild(hero);
  function card(cls,label,value,detail,page) {
    const box=make('div','hub-card nav '+cls);box.dataset.kind='shortcut';box.dataset.page=page;box.dataset.key='home|'+page;
    box.append(make('div','hub-label',t(label)),make('strong','',value),make('small','',detail));root.appendChild(box);return box;
  }
  function choices(box,entries,kind) {
    const row=make('div','choices'); box.querySelector('strong').replaceWith(row);
    entries.forEach(entry=>{
      const item=make('div','choice nav',entry.name);
      item.dataset.kind=kind; item.dataset.key=entry.eid; row.appendChild(item);
    });
  }
  const sceneBox=card('scenes-card','Scenes','',t('Quick routines'),'scenes');
  choices(sceneBox,sceneList.slice(0,6),'home-scene');
  const media=states[spotify], attr=media && media.attributes || {};
  const mediaBox=card('media-card','Media',attr.media_title || 'Spotify',attr.media_artist || (media ? t(media.state) : '—'),'music');
  function picture(box, path) {
    if (!haOrigin || !path || !path.startsWith('/api/')) return;
    const img=make('img','ha-picture'); img.alt=''; img.src=new URL(path,haOrigin).href;
    img.onerror=()=>img.remove(); box.prepend(img);
  }
  picture(mediaBox,attr.entity_picture);
  const usable=lights.filter(id=>!/_segment_\d+$/.test(id));
  const lit=usable.filter(id=>states[id].state==='on').length;
  const percent=usable.length?Math.round(100*lit/usable.length):0;
  const lamp=card('gauge-card','Lighting',usable.length ? percent+'%' : '—',lit+' / '+usable.length+' '+t('on'),'rooms');
  lamp.style.setProperty('--light-arc',percent+'%');
  const ac=climate && states[climate].attributes;
  const cooling=card('','Climate',ac ? ac.current_temperature+'°' : '—',climate ? nameOf(climate) : t('No reading'),'cool');
  if (ac && ac.temperature != null) cooling.querySelector('small').textContent=nameOf(climate)+' · '+t('Target')+' '+ac.temperature+'°';
  const cameraBox=card('camera-card','Cameras','',String(cameras.length),'cameras');
  choices(cameraBox,cameras.slice(0,4).map(eid=>({eid,name:nameOf(eid).replace(/live view/i,'').trim()})),'camera');
  cameraBox.querySelectorAll('.choice').forEach((item,i)=>picture(item,states[cameras[i]].attributes.entity_picture));
  const meter=power.find(id=>/total|apartment|whole.house/i.test(id)) || power[0];
  const energy=card('','Energy',meter ? states[meter].state+' '+(states[meter].attributes.unit_of_measurement||'') : '—',meter ? nameOf(meter) : t('No reading'),'energy');
  if (meter) {
    const chart=make('div','power-chart'); energy.insertBefore(chart,energy.lastChild);
    energyHistory(meter).then(values=>{
      if (values.length < 2) return;
      const peak=Math.max(1,...values);
      for(const value of values) { const bar=make('i','');bar.style.height=value == null ? '0' : Math.max(3,100*value/peak)+'%';chart.appendChild(bar); }
    });
  }
  card('','Security',security[0] ? t(states[security[0]].state) : '—',security[0] ? nameOf(security[0]) : t('No reading'),'security');
  return root;
}
