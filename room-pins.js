function mountRoomPins(stage, entries, api, projection, select) {
  const arabic = api.language === 'ar';
  const label = (en, ar) => arabic ? ar : en;
  const rooms = entries.filter(item => item.kind === 'Rooms');
  const devices = entries.filter(item => item.device);
  const layer = document.createElement('div');
  layer.className = 'room-pins';
  stage.append(layer);
  const tray = document.createElement('div');
  tray.className = 'room-tray';
  stage.append(tray);
  let room, pins = [], current, menuMode = false;
  const roomName = value => api.translate ? api.translate(value) : value;
  function name(item) {
    const id = item.device && api.resolve?.(item.device);
    return id && api.name ? api.name(id) : roomName(item.name);
  }
  function icon(item) {
    if (!item.device) return '⌂';
    const id = api.resolve?.(item.device) || '';
    const key = (id+' '+item.device.kind+' '+item.name).toLowerCase();
    const rules = [[/nanoleaf|hexa|shapes/,'⬡'],[/camera|ring|doorbell/,'📷'],[/fan|purifier/,'✾'],[/light|bulb|lamp/,'☀'],[/climate|air condition/,'❄'],[/speaker|echo/,'♫'],[/router|wifi/,'⌁'],[/sensor/,'◉'],[/\btv\b|media_player/,'▣'],[/vacuum/,'◎']];
    return rules.find(pair => pair[0].test(key))?.[1] || '◇';
  }
  function button(parent, text, run) {
    const b = document.createElement('button'); b.type='button'; b.textContent=text; parent.append(b);
    b.onclick = e => {e.stopPropagation();run();}; return b;
  }
  function choose(item) {
    if (!item.device) {room=item;select(item,room);build();return;}
    select(item,room);
    const actions=stage.parentNode.querySelector('.mapacts');
    const target=actions.querySelector('button');
    if(target) target.focus(); else pins.find(p=>p.item===item)?.button.focus();
  }
  function build() {
    pins=[];layer.replaceChildren();tray.replaceChildren();
    const candidates=room ? devices.filter(i=>i.room===room.name || (!i.center && i.device.room===room.name)) : rooms;
    for(const item of candidates) {
      const b=button(item.center?layer:tray,icon(item)+' '+name(item),()=>choose(item));
      b.className=item.center?'floor-pin':'tray-pin';
      if (!item.center) b.title=label('Position unrecorded','الموقع غير محدد');
      b.onfocus=()=>{current=item;select(item,room);};
      pins.push({item,button:b});
    }
    if(room)button(tray,label('All rooms','كل الغرف'),()=>{room=null;build();});
    button(tray,label('Map tools & elements','أدوات الخريطة وعناصرها'),()=>{menuMode=true;layer.hidden=tray.hidden=true;stage.parentNode.querySelector('.mapmenu button').focus();});
    layout();
    (pins[0]?.button||tray.querySelector('button'))?.focus();
  }
  function layout() {
    const used=[];
    for(const {item,button:b} of pins) {
      if(!item.center)continue;
      const point=projection(item.center),w=b.offsetWidth,h=b.offsetHeight;
      const clamp=(v,max)=>Math.max(0,Math.min(v,max));
      const x0=point.x-w/2,y0=point.y-h/2;
      let best,score=Infinity;
      for(let r=0;r<=8;r++) for(let k=0;k<(r?8:1);k++){
        const theta=k*Math.PI/4;
        const x=clamp(x0+r*(w*.42+4)*Math.cos(theta),stage.clientWidth-w),y=clamp(y0+r*(h+4)*Math.sin(theta),stage.clientHeight-tray.offsetHeight-h);
        const overlap=used.reduce((s,a)=>s+Math.max(0,Math.min(x+w+3,a.x+a.w)-Math.max(x-3,a.x))*Math.max(0,Math.min(y+h+3,a.y+a.h)-Math.max(y-3,a.y)),0);
        const cost=overlap*1000+Math.hypot(x-x0,y-y0);
        if(cost<score){score=cost;best={x,y,w,h};}
      }
      if(best){b.style.left=best.x+'px';b.style.top=best.y+'px';used.push(best);}
    }
  }
  function key(e) {
    if(document.getElementById('stream-view'))return false;
    const k=e.keyCode, focus=document.activeElement;
    if(menuMode){if(k!==27&&k!==10009)return false;menuMode=false;layer.hidden=tray.hidden=false;build();return true;}
    if(k===27||k===10009){
      if(stage.parentNode.querySelector('.mapacts').contains(focus)){pins.find(p=>p.item===current)?.button.focus();return true;}
      if(room){room=null;build();return true;}return false;
    }
    if(![37,38,39,40,13].includes(k))return false;
    if(k===13){focus?.click();return true;}
    const buttons=[...layer.children,...tray.children,...stage.parentNode.querySelectorAll('.mapacts button')];
    const center=b=>{const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];};
    const [x,y]=center(focus),dir={37:[-1,0],38:[0,-1],39:[1,0],40:[0,1]}[k];
    const options=buttons.filter(b=>b!==focus).map(b=>{const [a,c]=center(b),dx=a-x,dy=c-y;return {b,forward:dx*dir[0]+dy*dir[1],side:Math.abs(dx*dir[1]-dy*dir[0])};}).filter(v=>v.forward>1).sort((a,b)=>(a.forward+3*a.side)-(b.forward+3*b.side));
    options[0]?.b.focus();return true;
  }
  return {build,layout,key,inspection(){menuMode=true;layer.hidden=tray.hidden=true;}};
}
