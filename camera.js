// One receive-only stream at a time. Remove the HA subscription when the viewer closes.
function startHubCamera(id, api, overlay, status) {
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  overlay.appendChild(video);
  let stopped = false, pc, subscription, timer, mode = '', formats = [];
  let session, outgoing = [], incoming = [], ordered = Promise.resolve();
  function release() {
    clearTimeout(timer);
    if (subscription != null) api.unsubscribe(subscription);
    subscription = null;
    if (pc) { pc.onicecandidate = pc.ontrack = pc.oniceconnectionstatechange = null; pc.close(); pc = null; }
    video.onerror = video.onplaying = null;
    video.pause(); video.srcObject = null; video.removeAttribute('src'); video.load();
  }
  function fail() {
    if (stopped || mode === 'failed') return;
    const fallback = mode === 'web_rtc' && formats.includes('hls');
    mode = 'failed'; release();
    if (fallback) { play('hls').catch(fail); return; }
    status.hidden = false; status.textContent = api.t('Live feed unavailable');
    api.log('failed');
  }
  function sendIce(candidate) {
    if (!session) { outgoing.push(candidate); return; }
    api.request({type:'camera/webrtc/candidate',entity_id:id,session_id:session,candidate}).catch(() => {});
  }
  async function signal(event) {
    if (stopped || mode !== 'web_rtc' || !pc) return;
    const peer = pc;
    if (event.type === 'session') { session = event.session_id; outgoing.splice(0).forEach(sendIce); }
    if (event.type === 'error') throw Error('stream');
    if (event.type === 'answer') {
      await peer.setRemoteDescription({type:'answer',sdp:event.answer});
      for (const candidate of incoming.splice(0)) await peer.addIceCandidate(candidate).catch(() => {});
    }
    if (event.type === 'candidate') {
      const candidate = Object.assign({},event.candidate);
      if (candidate.sdpMid == null && candidate.sdpMLineIndex == null) candidate.sdpMid = '0';
      if (peer.remoteDescription) await peer.addIceCandidate(candidate).catch(() => {}); else incoming.push(candidate);
    }
  }
  async function play(type) {
    mode = type;
    const active = () => !stopped && mode === type;
    timer = setTimeout(fail,35000);
    video.onerror = fail;
    video.onplaying = () => {
      if (!active() || !video.videoWidth) return;
      clearTimeout(timer); status.hidden = true; api.log('playing-' + type);
    };
    if (type === 'hls') {
      const stream = await api.request({type:'camera/stream',entity_id:id,format:'hls'});
      if (!active()) return;
      video.src = new URL(stream.url,api.origin).href; await video.play(); return;
    }
    const config = await api.request({type:'camera/webrtc/get_client_config',entity_id:id});
    if (!active()) return;
    pc = new RTCPeerConnection(config.configuration);
    if (config.dataChannel) pc.createDataChannel(config.dataChannel);
    const tracks = new MediaStream();
    video.srcObject = tracks;
    pc.ontrack = e => { tracks.addTrack(e.track); video.play().catch(() => {}); };
    pc.onicecandidate = e => { if (e.candidate) sendIce(e.candidate.toJSON()); };
    pc.oniceconnectionstatechange = () => { if (pc && pc.iceConnectionState === 'failed') fail(); };
    pc.addTransceiver('audio',{direction:'recvonly'}); pc.addTransceiver('video',{direction:'recvonly'});
    const peer = pc, offer = await peer.createOffer();
    if (!active()) return;
    await peer.setLocalDescription(offer);
    if (!active()) return;
    subscription = api.subscribe({type:'camera/webrtc/offer',entity_id:id,offer:peer.localDescription.sdp},event => {
      ordered = ordered.then(() => signal(event)).catch(() => { if(active()) fail(); });
    },() => { if(active()) fail(); });
  }
  api.request({type:'camera/capabilities',entity_id:id}).then(caps => {
    if (stopped) return;
    formats = caps.frontend_stream_types || [];
    if (formats.includes('web_rtc') && window.RTCPeerConnection) return play('web_rtc');
    if (formats.includes('hls')) return play('hls');
    fail();
  }).catch(fail);
  return () => { stopped = true; release(); };
}

