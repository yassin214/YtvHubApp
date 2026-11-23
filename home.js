function hubHome(states, t, spotify, nameOf, areas) {
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
  const skyline = make('canvas','skyline'); skyline.width=1000; skyline.height=390;
  const ctx=skyline.getContext('2d');
  function line(ax,ay,bx,by,alpha) {
    ctx.strokeStyle='rgba(29,218,230,'+alpha+')'; ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by);ctx.stroke();
  }
  for(let x=-1400;x<=2400;x+=100) line(500,200,x,390,.22);
  for(let n=1;n<14;n++){let y=200+n*n*1.3;line(0,y,1000,y,.16);}
  for(let side of [-1,1]) for(let i=0;i<8;i++){
    const dist=440*Math.pow(.70,i), x=500+side*dist, y=216+dist*.19, h=dist*(.25+.10*Math.cos(i*2)), w=dist*.29;
    line(x,y,x,y-h,.7);line(x,y-h,x-side*w,y-h*.84,.7);
    line(x-side*w,y-h*.84,x-side*w,y-12,.35);
    for(let j=1;j<5;j++) line(x,y-h*j/5,x-side*w,y-12-(h*.84-12)*j/5,.24);
    for(let j=1;j<5;j++) line(x-side*w*j/5,y-12*j/5,x-side*w*j/5,y-h+h*.16*j/5,.25);
  }
  hero.append(skyline,make('div','hero-mark','Y214'),make('h1','','Y214 TV HUB'),make('small','','OPERATING SYSTEM FOR REALITY'));root.appendChild(hero);
  function card(cls,label,value,detail,page) {
    const box=make('div','hub-card nav '+cls);box.dataset.kind='shortcut';box.dataset.page=page;box.dataset.key='home|'+page;
    box.append(make('div','hub-label',t(label)),make('strong','',value),make('small','',detail));root.appendChild(box);return box;
  }
  const scenes=ids.filter(id=>id.startsWith('scene.'));
  card('scenes-card','Scenes',scenes.slice(0,3).map(nameOf).join('   ·   ') || '—',t('Quick routines'),'scenes');
  const media=states[spotify], attr=media && media.attributes || {};
  card('media-card','Media',attr.media_title || 'Spotify',attr.media_artist || (media ? t(media.state) : '—'),'music');
  card('','Lighting',lights.filter(id=>states[id].state==='on').length+' / '+lights.length,t('on'),'rooms');
  const ac=climate && states[climate].attributes;
  card('','Climate',ac ? ac.current_temperature+'°' : '—',climate ? nameOf(climate) : t('No reading'),'cool');
  card('','Cameras',String(cameras.length),cameras.slice(0,2).map(nameOf).join(' · '),'cameras');
  const meter=power.find(id=>/total|apartment|whole.house/i.test(id)) || power[0];
  card('','Energy',meter ? states[meter].state+' '+(states[meter].attributes.unit_of_measurement||'') : '—',meter ? nameOf(meter) : t('No reading'),'energy');
  card('','Security',security[0] ? t(states[security[0]].state) : '—',security[0] ? nameOf(security[0]) : t('No reading'),'security');
  return root;
}
