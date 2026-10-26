(function(){
  const apiBase=window.SKILLS_ENV?.apiBase||'';
  const api=(path,options={})=>fetch(apiBase+path,{headers:{'content-type':'application/json',...(options.headers||{})},...options}).then(async response=>{const body=await response.json().catch(()=>({}));if(!response.ok)throw Error(body.error||`请求失败 (${response.status})`);return body});
  let peer=null,localStream=null,remoteStream=null,signalTimer=null,inviteTimer=null,callResponseTimer=null,lastSignalId=0,inviteAfterId=0,callAfterId=0,pendingCandidates=[],speech=null,captionRecognition=null,videoTimerSeconds=0,videoConnected=false,incomingCallId=null;
  function displayCases(items){return items||[]}

  function updateResponsiveScale(){
    const viewportWidth=window.visualViewport?.width||window.innerWidth||390;
    const viewportHeight=window.visualViewport?.height||window.innerHeight||844;
    // Scale the fixed 390×844 device canvas, not the full scrollable page.
    // Using the home content height pushed fixed bottom controls below the
    // Safari viewport whenever the case list made the root taller than 844.
    const designHeight=844;
    const scale=Math.min(1,viewportWidth/390,viewportHeight/designHeight);
    document.documentElement.style.setProperty('--app-scale',String(scale));
    const viewport=document.getElementById('viewport'),app=document.getElementById('app');
    if(viewport){viewport.style.width=390*scale+'px';viewport.style.height=designHeight*scale+'px'}
    if(app){app.style.height=designHeight+'px';app.style.transform='scale('+scale+')'}
  }
  updateResponsiveScale();
  window.addEventListener('resize',updateResponsiveScale,{passive:true});
  window.visualViewport?.addEventListener('resize',updateResponsiveScale,{passive:true});

  function updateVoiceControl(source,listening){
    const controls=source==='chat'?named('操作/mic'):named('按住说话');
    controls.forEach(control=>{
      control.setAttribute('aria-pressed',String(listening));
      control.setAttribute('aria-label',listening?'点击停止语音识别':'点击开始语音识别');
      control.classList.toggle('voice-listening',listening);
      if(source!=='chat')qa('p',control).forEach(text=>text.textContent=listening?'点击停止':'点击说话');
    });
  }

  function setCases(items){
    const preferred=['CASE-02-CLEAN-C','CASE-11-FIGMA-CUT'].map(id=>items.find(item=>item.id===id)).filter(Boolean);
    const selected=[...preferred,...items.filter(item=>!preferred.some(entry=>entry.id===item.id))].slice(0,2);state.featuredCases=selected;state.remoteCases=selected;
    CASE_LIBRARY.splice(0,CASE_LIBRARY.length,...selected.map((item,index)=>({id:item.id,frame:['183:1896','183:1961'][index],title:item.title,tags:item.tags||[],detail:item.summary||'',steps:item.steps||[],result:item.result||'',scopeNote:item.scopeNote||'',riskNote:item.riskNote||'',imageUrls:item.imageUrls||[],videoUrl:item.videoUrl||'',sourceUrl:item.sourceUrl||'',isDemo:false})));
    save();
  }

  async function loadFeaturedCases(){
    try{const {items}=await api('/api/newfront/cases');state.featuredCases=items;setCases(items);if(current==='home')render()}catch(error){console.warn('案例库加载失败',error)}
  }

  function ensureBottomNav(){
    const root=screen.firstElementChild;if(!root)return;
    let nav=named('底部导航')[0];
    if(!nav){
      nav=document.createElement('nav');
      nav.dataset.name='底部导航';
      nav.setAttribute('aria-label','底部导航');
      nav.className='cloud-bottom-nav';
      nav.innerHTML=[
        ['home','⌂','首页'],['services','▦','服务'],['request','＋','求助'],['chat','◌','消息'],['profile','♙','我的']
      ].map(([route,icon,label])=>`<button type="button" data-cloud-nav="${route}" aria-label="${label}"><span class="cloud-bottom-icon">${icon}</span><span>${label}</span></button>`).join('');
      root.appendChild(nav);
    }
    nav.style.cssText='position:fixed;left:0;right:auto;bottom:0;width:390px;height:80px;z-index:60;display:flex;align-items:stretch;background:#fff;border-top:1px solid #e1e8f2;box-shadow:0 -4px 16px #172d4810;';
    nav.querySelectorAll('[data-cloud-nav]').forEach(button=>{
      const route=button.dataset.cloudNav;
      button.style.cssText='width:78px;height:80px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:'+(current===route?'#1a71fe':'#5c6c80')+';font-size:12px;cursor:pointer;';
      const icon=button.querySelector('.cloud-bottom-icon');
      if(icon)icon.style.cssText='font-size:'+(route==='request'?'32px':'25px')+';line-height:29px;font-weight:700;color:'+(current===route?'#1a71fe':'#5c6c80')+';';
      button.onclick=()=>navigate(route);
    });
  }

  function renderHomeCaseRail(){
    if(current!=='home')return;const host=named('案例图文预览')[0],items=state.featuredCases||[];if(!host)return;
    const visibleItems=displayCases(items),root=screen.firstElementChild,group=named('白色分组/往期案例')[0],nav=named('底部导航')[0],rowHeight=76;
    screen.style.height='844px';screen.style.maxHeight='844px';screen.style.overflowY='auto';screen.style.overflowX='hidden';screen.style.webkitOverflowScrolling='touch';root.style.setProperty('height',Math.max(844,650+54+visibleItems.length*rowHeight+80)+'px','important');
    if(group)group.style.height=(54+visibleItems.length*rowHeight)+'px';if(nav){nav.style.position='fixed';nav.style.top='auto';nav.style.bottom='0';nav.style.zIndex='60'}
    if(!q('#home-fixed-header-bg',root)){const bg=document.createElement('div');bg.id='home-fixed-header-bg';root.appendChild(bg)}
    named('系统状态栏').forEach(bar=>{if(parseFloat(bar.style.top||'0')===0){bar.style.position='fixed';bar.style.top='0';bar.style.zIndex='53'}});
    const brand=named('品牌导航')[0],search=named('搜索入口')[0];if(brand){brand.style.position='fixed';brand.style.top='28px';brand.style.zIndex='54'}if(search){search.style.position='fixed';search.style.top='91px';search.style.zIndex='54'}
    host.style.height=(visibleItems.length*rowHeight)+'px';host.style.overflow='visible';host.classList.add('home-case-rail');host.innerHTML=visibleItems.map((item,index)=>{const image=item.imageUrls?.[0];return '<button class="home-case-item '+(item.isDemo?'case-placeholder':'')+'" type="button" data-home-case="'+esc(item.id)+'">'+(image?'<img src="'+esc(image)+'" alt="">':'<span class="home-case-thumb">'+String(index+1).padStart(2,'0')+'</span>')+'<span class="home-case-copy"><strong>'+esc(item.title)+'</strong><small>'+esc(item.summary||item.detail||'')+'</small></span></button>'}).join('');
    qa('[data-home-case]',host).forEach(button=>button.onclick=event=>{event.stopPropagation();const item=visibleItems.find(entry=>entry.id===button.dataset.homeCase);if(item)showSheet(item.title,caseMarkup(item))});
  }

  function caseMarkup(item){
    const tags=(item.tags||[]).map(tag=>'<span class="pill">'+esc(tag)+'</span>').join('');
    const media=item.videoUrl?'<video controls playsinline preload="metadata" src="'+esc(item.videoUrl)+'" style="width:100%;max-height:280px;background:#111;border-radius:10px"></video>':(item.imageUrls||[]).map((src,index)=>'<img src="'+esc(src)+'" alt="'+esc(item.title)+' 第'+(index+1)+'步" style="width:100%;margin-top:8px;border-radius:10px">').join('');
    const steps=(item.steps||[]).length?'<ol>'+item.steps.map(step=>'<li>'+esc(step)+'</li>').join('')+'</ol>':'';
    return media+'<p>'+esc(item.detail||item.summary||'')+'</p><p>'+tags+'</p>'+steps+(item.result?'<h3>结果</h3><p>'+esc(item.result)+'</p>':'')+(item.scopeNote?'<h3>适用范围</h3><p>'+esc(item.scopeNote)+'</p>':'')+(item.riskNote?'<h3>注意事项</h3><p>'+esc(item.riskNote)+'</p>':'')+(item.sourceUrl?'<a class="secondary" target="_blank" rel="noopener" href="'+esc(item.sourceUrl)+'">查看资料来源</a>':'');
  }

  caseSheet=function(title){
    const items=displayCases((current==='home'?state.featuredCases:state.remoteCases)||CASE_LIBRARY);
    if(title){const item=items.find(entry=>entry.title===title)||items[0];if(item)showSheet(item.title,caseMarkup(item));return}
    showSheet('往期案例','<div class="newfront-case-list">'+items.map(item=>'<button class="order-card" data-newfront-case="'+esc(item.id)+'"><strong>'+esc(item.title)+'</strong><p>'+esc(item.summary||item.detail||'')+'</p><div>'+((item.tags||[]).map(tag=>'<span class="pill">'+esc(tag)+'</span>').join(''))+'</div></button>').join('')+'</div>',modal=>qa('[data-newfront-case]',modal).forEach(button=>button.onclick=()=>{const item=items.find(entry=>entry.id===button.dataset.newfrontCase);if(item)showSheet(item.title,caseMarkup(item))}));
  };
  openCaseByTitle=title=>caseSheet(title);

  const enhancedFields=fields;
  fields=function(){
    enhancedFields();
    updateVoiceControl('request',Boolean(speech));
  };

  const toggleVoiceSetupChat=setupChat;
  setupChat=function(){toggleVoiceSetupChat();updateVoiceControl('chat',Boolean(speech));state.videoRole=videoRole();save();pollIncomingCalls()};

  startVoice=async function(source){
    if(['completed','cancelled','review'].includes(state.order)||['completed','cancelled'].includes(state.backendRequestStatus)){toast('订单已结束，不能继续语音');return}
    if(speech){speech.stop();return}
    const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Speech){toast('当前浏览器不支持语音转写，请直接输入文字');return}
    if(navigator.mediaDevices?.getUserMedia){
      try{const permissionStream=await navigator.mediaDevices.getUserMedia({audio:true});permissionStream.getTracks().forEach(track=>track.stop())}
      catch{toast('麦克风启动失败，请检查权限');return}
    }
    if(source==='request')readForm();
    const recognition=new Speech(),isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    speech=recognition;recognition.lang='zh-CN';recognition.interimResults=true;recognition.continuous=!isIOS;
    let finalText='',interimText='';
    recognition.onstart=()=>{updateVoiceControl(source,true);toast('麦克风已开启，再点击一次停止识别')};
    recognition.onresult=event=>{interimText='';for(let i=0;i<event.results.length;i++){const text=event.results[i][0]?.transcript||'';if(event.results[i].isFinal)finalText+=text;else interimText+=text}};
    recognition.onerror=event=>{if(event.error!=='aborted'&&event.error!=='no-speech')toast('语音识别失败，请检查麦克风权限或直接输入文字')};
    recognition.onend=()=>{if(speech===recognition)speech=null;updateVoiceControl(source,false);const captured=(finalText+interimText).trim();if(captured){if(source==='chat'){const input=q('#chat-input');if(input){input.value=(input.value?input.value+' ':'')+captured;input.focus()}toast('语音识别已停止，请确认文字后点击发送')}else{state.detail=(state.detail?state.detail+' ':'')+captured;state.hasDraft=true;newFrontAiReady=false;save();render();window.scheduleProblemGeneration?.();toast('文字已填入，2秒后生成标题和标签')}}else toast('语音识别已停止')};
    try{recognition.start()}catch{speech=null;updateVoiceControl(source,false);toast('麦克风启动失败，请检查权限')}
  };

  async function sendSignal(signal){return api(`/api/sessions/${encodeURIComponent(state.backendSessionId)}/signals`,{method:'POST',body:JSON.stringify({from:state.videoRole||'seeker',signal})})}
  function videoRole(){return state.backendRole==='provider'?'provider':'seeker'}
  function stopInvitePoll(){clearTimeout(inviteTimer);inviteTimer=null}
  function stopCallResponsePoll(){clearTimeout(callResponseTimer);callResponseTimer=null}
  function recentSignal(item){const time=Date.parse(item.createdAt||'');return Number.isFinite(time)&&Date.now()-time<60000}
  async function pollIncomingCalls(){
    stopInvitePoll();if(current!=='chat'||!state.backendSessionId)return;
    try{const {items}=await api(`/api/sessions/${encodeURIComponent(state.backendSessionId)}/signals?role=${encodeURIComponent(videoRole())}&after=${inviteAfterId}`);for(const item of items){inviteAfterId=Math.max(inviteAfterId,item.id);const signal=item.signal||{};if(signal.type==='call-invite'&&signal.callId&&recentSignal(item)&&signal.callId!==state.lastHandledVideoCallId){showIncomingCall(signal.callId,item.from)}else if(signal.type==='call-cancel'&&signal.callId===incomingCallId){incomingCallId=null;closeSheet();toast('对方已取消视频呼叫')}}}catch(error){console.warn('视频来电检查失败',error)}
    if(current==='chat')inviteTimer=setTimeout(pollIncomingCalls,900)
  }
  function showIncomingCall(callId,from){
    if(incomingCallId===callId)return;incomingCallId=callId;state.videoRole=videoRole();save();
    showSheet('视频来电','<p>'+(from==='provider'?'服务者':'求助者')+'邀请你进行视频指导。接听后才会请求摄像头和麦克风权限。</p><button class="primary" id="video-answer">接听视频</button><button class="danger" id="video-reject">挂断</button>',modal=>{
      q('#video-answer',modal).onclick=async()=>{try{await sendSignal({type:'call-accept',callId});state.videoCallId=callId;state.videoCallPhase='accepted';state.lastHandledVideoCallId=callId;incomingCallId=null;save();closeSheet();navigate('video')}catch(error){toast(error.message||'接听失败')}};
      q('#video-reject',modal).onclick=async()=>{state.lastHandledVideoCallId=callId;incomingCallId=null;save();closeSheet();try{await sendSignal({type:'call-reject',callId})}catch{}toast('已挂断视频来电')}
    })
  }
  async function beginVideoCall(){
    const callId=crypto.randomUUID();state.videoRole=videoRole();state.videoCallId=callId;state.videoCallPhase='outgoing';save();
    await sendSignal({type:'call-invite',callId});navigate('video');pollCallResponse()
  }
  window.beginVideoCall=beginVideoCall;
  async function pollCallResponse(){
    stopCallResponsePoll();if(current!=='video'||state.videoCallPhase!=='outgoing'||!state.backendSessionId)return;
    try{const {items}=await api(`/api/sessions/${encodeURIComponent(state.backendSessionId)}/signals?role=${encodeURIComponent(state.videoRole||videoRole())}&after=${callAfterId}`);for(const item of items){callAfterId=Math.max(callAfterId,item.id);lastSignalId=Math.max(lastSignalId,item.id);const signal=item.signal||{};if(signal.callId!==state.videoCallId)continue;if(signal.type==='call-accept'){state.videoCallPhase='accepted';save();stopCallResponsePoll();render();return}if(signal.type==='call-reject'){state.videoCallPhase='rejected';save();setVideoState('对方已挂断视频来电',{error:true});toast('对方已挂断视频来电');stopCallResponsePoll();return}if(signal.type==='call-cancel'){state.videoCallPhase='cancelled';save();setVideoState('视频呼叫已取消',{error:true});stopCallResponsePoll();return}}}catch(error){setVideoState(error.message||'呼叫状态同步失败',{error:true})}
    if(current==='video'&&state.videoCallPhase==='outgoing')callResponseTimer=setTimeout(pollCallResponse,800)
  }
  async function pollSignals(){
    if(!peer||!state.backendSessionId)return;
    try{const {items}=await api(`/api/sessions/${encodeURIComponent(state.backendSessionId)}/signals?role=${encodeURIComponent(state.videoRole||'seeker')}&after=${lastSignalId}`);for(const item of items){lastSignalId=Math.max(lastSignalId,item.id);const signal=item.signal;if(signal.type==='offer'){await peer.setRemoteDescription(signal.sdp);for(const candidate of pendingCandidates.splice(0))await peer.addIceCandidate(candidate);const answer=await peer.createAnswer();await peer.setLocalDescription(answer);await sendSignal({type:'answer',sdp:peer.localDescription})}else if(signal.type==='answer'){await peer.setRemoteDescription(signal.sdp);for(const candidate of pendingCandidates.splice(0))await peer.addIceCandidate(candidate)}else if(signal.type==='candidate'){if(peer.remoteDescription)await peer.addIceCandidate(signal.candidate);else pendingCandidates.push(signal.candidate)}else if(signal.type==='caption')showCaption(signal.text,signal.from||'对方');else if(signal.type==='call-hangup'&&(!signal.callId||signal.callId===state.videoCallId)){state.videoCallPhase='ended';save();setVideoState('对方已结束视频通话',{error:true});stopRealtime({preserveUi:true});toast('对方已结束视频通话');setTimeout(()=>{if(current==='video')navigate('chat',true)},900);return}}}catch(error){console.warn('信令轮询失败',error)}
    signalTimer=setTimeout(pollSignals,700);
  }
  function showCaption(text,from='对方'){const box=q('#live-caption');if(box)box.textContent=from+'：'+text}
  function startCaptionRecognition(){
    const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Speech||captionRecognition)return;
    captionRecognition=new Speech();captionRecognition.lang='zh-CN';captionRecognition.interimResults=false;captionRecognition.continuous=true;
    captionRecognition.onresult=event=>{for(let i=event.resultIndex;i<event.results.length;i++){if(!event.results[i].isFinal)continue;const text=event.results[i][0].transcript.trim();if(text){showCaption(text,'我');sendSignal({type:'caption',from:'对方',text}).catch(()=>{})}}};
    captionRecognition.onerror=()=>{};captionRecognition.onend=()=>{const active=captionRecognition;captionRecognition=null;if(active&&localStream?.getAudioTracks().some(track=>track.enabled))setTimeout(startCaptionRecognition,250)};
    try{captionRecognition.start()}catch{}
  }
  function videoLabel(){return q('#video-call-state')}
  function videoGuidance(){return q('#video-guidance-state')}
  function streamHasLiveMedia(stream){return Boolean(stream&&stream.getVideoTracks().some(track=>track.readyState==='live')&&stream.getAudioTracks().some(track=>track.readyState==='live'))}
  function stopCallTimer(){clearInterval(callTimer);callTimer=null;videoTimerSeconds=0}
  function setVideoState(message,{error=false,connected=false}={}){
    const status=q('#video-connection-status'),label=videoLabel(),guidance=videoGuidance(),caption=q('#live-caption'),staticCaption=named('实时指导字幕')[0];
    if(status){status.textContent=message;status.classList.toggle('video-error',error)}
    if(!connected){stopCallTimer();videoConnected=false;if(label)label.textContent=error?'视频连接失败':'视频连接中';if(guidance)guidance.textContent=message;if(caption)caption.style.display='none';if(staticCaption)staticCaption.style.display='none';return}
    if(videoConnected)return;videoConnected=true;if(guidance)guidance.textContent='正在进行视频指导';if(caption)caption.style.display='block';if(staticCaption)staticCaption.style.display='none';if(label)label.textContent='视频通话中 · 00:00';callTimer=setInterval(()=>{videoTimerSeconds++;if(label)label.textContent='视频通话中 · '+String(Math.floor(videoTimerSeconds/60)).padStart(2,'0')+':'+String(videoTimerSeconds%60).padStart(2,'0')},1000);startCaptionRecognition()
  }
  function updateVideoConnectionState(){
    if(!peer)return;const stateName=peer.connectionState;
    if(stateName==='failed'){setVideoState('WebRTC 连接失败，请退出后重新进入',{error:true});stopRealtime({preserveUi:true});return}
    if(stateName==='closed'){setVideoState('视频连接已关闭',{error:true});return}
    if(stateName==='disconnected'){setVideoState('WebRTC 连接已中断，正在等待恢复',{error:true});return}
    if(stateName!=='connected'){setVideoState(stateName==='connecting'?'正在建立 WebRTC 连接…':'等待对方加入视频');return}
    if(!streamHasLiveMedia(localStream)){setVideoState('本机摄像头或麦克风未就绪',{error:true});return}
    if(!streamHasLiveMedia(remoteStream)){setVideoState('WebRTC 已连接，等待对方摄像头和麦克风');return}
    setVideoState('双方音视频已连接',{connected:true})
  }
  function videoErrorMessage(error){
    if(!window.isSecureContext)return '当前为 HTTP 地址，手机浏览器禁止摄像头和麦克风；请使用 HTTPS 测试地址';
    const name=error?.name||'';if(name==='NotAllowedError'||name==='SecurityError')return '摄像头或麦克风权限被拒绝，请在浏览器设置中允许后重试';if(name==='NotFoundError'||name==='DevicesNotFoundError')return '未检测到可用的摄像头或麦克风';if(name==='NotReadableError'||name==='TrackStartError')return '摄像头或麦克风被其他应用占用';if(name==='OverconstrainedError')return '当前设备不支持所需摄像头配置';return error?.message||'视频连接初始化失败'
  }
  function stopRealtime({preserveUi=false}={}){
    clearTimeout(signalTimer);signalTimer=null;stopCallResponsePoll();stopCallTimer();videoConnected=false;if(captionRecognition){captionRecognition.onend=null;captionRecognition.stop();captionRecognition=null}if(peer){peer.onconnectionstatechange=null;peer.close();peer=null}if(localStream){localStream.getTracks().forEach(track=>track.stop());localStream=null}if(remoteStream){remoteStream.getTracks().forEach(track=>track.stop());remoteStream=null}lastSignalId=0;pendingCandidates=[];if(!preserveUi&&current==='video')setVideoState('视频连接已结束',{error:true});
  }
  window.stopRealtime=stopRealtime;
  async function initRealtimeVideo(){
    const status=q('#video-connection-status');
    try{
      if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('当前为 HTTP 地址，手机浏览器禁止摄像头和麦克风；请使用 HTTPS 测试地址');
      const config=await api(`/api/sessions/${encodeURIComponent(state.backendSessionId)}/webrtc-config`);
      localStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:true});
      if(!streamHasLiveMedia(localStream))throw Error('本机摄像头或麦克风未成功开启');
      const local=q('#newfront-local-video');if(local)local.srcObject=localStream;
      peer=new RTCPeerConnection({iceServers:config.iceServers||[]});localStream.getTracks().forEach(track=>peer.addTrack(track,localStream));
      peer.ontrack=event=>{remoteStream=event.streams[0]||remoteStream||new MediaStream();if(!event.streams[0]&&!remoteStream.getTracks().includes(event.track))remoteStream.addTrack(event.track);const remote=q('#newfront-remote-video');if(remote)remote.srcObject=remoteStream;event.track.onunmute=updateVideoConnectionState;event.track.onended=updateVideoConnectionState;updateVideoConnectionState()};
      peer.onicecandidate=event=>{if(event.candidate)sendSignal({type:'candidate',candidate:event.candidate}).catch(()=>{})};
      peer.onconnectionstatechange=updateVideoConnectionState;
      setVideoState('本机音视频已开启，等待对方加入');
      pollSignals();
      if((state.videoRole||'seeker')==='seeker'){const offer=await peer.createOffer();await peer.setLocalDescription(offer);await sendSignal({type:'offer',sdp:peer.localDescription})}
    }catch(error){const message=videoErrorMessage(error);setVideoState(message,{error:true});toast(message);stopRealtime({preserveUi:true})}
  }
  function videoInviteUrl(){const url=new URL(location.href);url.searchParams.set('session',state.backendSessionId);url.searchParams.set('role',(state.videoRole||'seeker')==='seeker'?'provider':'seeker');url.hash='video';return url.href}
  function focusVideo(localFirst){
    const local=q('#newfront-local-video'),remote=q('#newfront-remote-video');if(!local||!remote)return;
    const main='left:18px;right:auto;top:103px;width:354px;height:448px;z-index:6;border-radius:10px;border:0';
    const small='left:auto;right:18px;top:103px;width:94px;height:126px;z-index:7;border-radius:10px;border:2px solid #fff';
    local.style.cssText=localFirst?main:small;remote.style.cssText=localFirst?small:main;
    toast(localFirst?'已切换为我的画面主视图':'已切换为对方画面主视图');
  }
  async function switchCamera(){
    if(!localStream)return;const current=localStream.getVideoTracks()[0],nextMode=(current?.getSettings?.().facingMode==='environment')?'user':'environment';
    try{const replacement=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:nextMode}},audio:false}),next=replacement.getVideoTracks()[0],sender=peer?.getSenders().find(item=>item.track?.kind==='video');if(sender)await sender.replaceTrack(next);if(current){localStream.removeTrack(current);current.stop()}localStream.addTrack(next);q('#newfront-local-video').srcObject=localStream;toast('已切换摄像头')}catch{toast('当前设备无法切换另一枚摄像头')}
  }
  async function copyInvite(){try{await navigator.clipboard.writeText(videoInviteUrl());toast('双方视频邀请链接已复制')}catch{showSheet('双方视频邀请链接','<p style="word-break:break-all">'+esc(videoInviteUrl())+'</p>')}}

  startVideo=async function(){
    if(['completed','cancelled','review'].includes(state.order)){toast('订单已结束，不能继续视频');return}if(['matching','pending'].includes(state.order)){toast('请先确认接单，再开始视频指导');return}if(state.order==='none'){toast('请先发起求助并确认服务');return}
    try{if(!state.backendSessionId){const session=await api('/api/sessions',{method:'POST',body:JSON.stringify({mode:'now'})});state.backendSessionId=session.id;state.videoRole='seeker';save()}state.order='active';await beginVideoCall()}catch(error){toast(error.message)}
  };
  const simulatedVideoSetup=setupVideo;
  setupVideo=function(){
    if(['completed','cancelled','review'].includes(state.order)){navigate('chat',true);toast('订单已结束，不能继续视频');return}
    simulatedVideoSetup();
    const root=screen.firstElementChild;if(!root)return;
    stopCallTimer();videoConnected=false;const timerLabel=qa('p').find(node=>node.textContent.includes('视频通话中')||node.textContent.includes('正在获取摄像头'));if(timerLabel){timerLabel.id='video-call-state';timerLabel.textContent='视频连接中'}const guidance=qa('p').find(node=>node.textContent.includes('正在进行视频指导')||node.textContent.includes('正在建立实时视频连接'));if(guidance){guidance.id='video-guidance-state';guidance.textContent='正在检查摄像头和麦克风…'}named('实时指导字幕').forEach(node=>node.style.display='none');
    root.insertAdjacentHTML('beforeend','<video id="newfront-remote-video" autoplay playsinline></video><video id="newfront-local-video" autoplay playsinline muted></video><div id="video-connection-status">等待摄像头权限…</div><button id="video-invite" type="button">复制双方视频链接</button><div id="live-caption" style="display:none">实时语音转写将在这里显示</div>');
    q('#video-invite').onclick=copyInvite;
    q('#newfront-local-video').onclick=()=>focusVideo(true);q('#newfront-remote-video').onclick=()=>focusVideo(false);
    onName('通话操作/麦克风',()=>{const track=localStream?.getAudioTracks()[0];if(!track){toast('麦克风不可用');return}track.enabled=!track.enabled;mic=track.enabled;updateCall();if(track.enabled)startCaptionRecognition();else if(captionRecognition){captionRecognition.onend=null;captionRecognition.stop();captionRecognition=null}toast(track.enabled?'麦克风已开启':'麦克风已静音')});
    onName('通话操作/摄像头',()=>{const track=localStream?.getVideoTracks()[0];if(!track){toast('摄像头不可用');return}track.enabled=!track.enabled;camera=track.enabled;updateCall();toast(track.enabled?'摄像头已开启':'摄像头已关闭')});
    named('通话操作/共享屏幕').forEach(node=>{node.style.display='none';node.setAttribute('aria-hidden','true')});
    onName('通话操作/结束',async()=>{const outgoing=state.videoCallPhase==='outgoing';try{if(state.backendSessionId&&state.videoCallId)await sendSignal({type:outgoing?'call-cancel':'call-hangup',callId:state.videoCallId})}catch{}state.videoCallPhase=outgoing?'cancelled':'ended';save();stopRealtime({preserveUi:true});navigate('chat',true);toast(outgoing?'已取消视频呼叫':'视频已结束，可继续文字沟通')});
    onName('操作/flip',switchCamera);
    onName('操作/more',()=>showSheet('视频指导说明','<p>摄像头、麦克风和双方视频使用浏览器原生 WebRTC；语音转写由当前浏览器提供。视频不录制。</p>'));
    if(!state.backendSessionId){setVideoState('缺少有效服务会话，无法建立视频连接',{error:true});return}
    if(state.videoCallPhase==='outgoing'){setVideoState('等待对方接听视频');pollCallResponse();return}
    if(state.videoCallPhase==='rejected'){setVideoState('对方已挂断视频来电',{error:true});return}
    if(state.videoCallPhase!=='accepted'){setVideoState('视频呼叫尚未被对方接听',{error:true});return}
    initRealtimeVideo();
  };

  window.addEventListener('hashchange',()=>{if(location.hash!=='#video')stopRealtime({preserveUi:true});if(location.hash!=='#chat')stopInvitePoll()});
  window.addEventListener('beforeunload',stopRealtime);
  const originalRender=render;render=function(){screen.style.overflow='visible';screen.scrollTop=0;originalRender();ensureBottomNav();renderHomeCaseRail();requestAnimationFrame(updateResponsiveScale)};ensureBottomNav();renderHomeCaseRail();requestAnimationFrame(updateResponsiveScale);
  const originalSetupProfile=setupProfile;
  setupProfile=function(){
    originalSetupProfile();
    const statuses=['待确认','待沟通','服务中','待评价','已完成'];
    const active=state.orderFilter||'';
    statuses.forEach(status=>{const node=named(status)[0];if(!node)return;node.classList.toggle('status-filter-active',active===status);node.setAttribute('aria-pressed',String(active===status));node.onclick=()=>{state.orderFilter=status;save();render();setTimeout(()=>ordersSheet(status),0)}});
  };
  const launch=new URLSearchParams(location.search);
  if(launch.get('session')&&launch.get('role')){state.backendSessionId=launch.get('session');state.videoRole=launch.get('role')==='provider'?'provider':'seeker';state.videoCallPhase='accepted';state.order='active';state.title=state.title||'双方视频指导';state.detail=state.detail||'通过邀请链接加入实时视频指导。';save();setTimeout(()=>navigate('video',true),0)}else loadFeaturedCases();
})();
