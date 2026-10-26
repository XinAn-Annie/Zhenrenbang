/* 只负责把求助、会话和消息接到 Cloud 后端；身份、资料、认证、附件、案例和屏幕共享仍由原交互层负责。 */
(function(){
  const apiBase=window.SKILLS_ENV?.apiBase||'';
  const api=(path,options={})=>fetch(apiBase+path,{headers:{'content-type':'application/json',...(options.headers||{})},...options}).then(async response=>{const body=await response.json().catch(()=>({}));if(!response.ok)throw Error(body.error||`请求失败 (${response.status})`);return body});
  let requestTimer=null,chatTimer=null,feedTimer=null;

  function channelId(){
    if(state.channelId)return state.channelId;
    if(state.category===1)return state.tags.some(t=>/相机|镜头|对焦|摄影/.test(t))?'camera':'device';
    if(state.category===2)return 'plant';
    return 'office';
  }
  function contextCard(){return{channel:channelId(),goal:state.title||state.detail,currentSituation:state.detail,object:null,environment:null,tried:[],preferredHelp:'step_by_step',suggestedTags:state.tags||[],missingQuestions:[]}}
  function applyRequest(item){
    state.backendRequestId=item.id;state.backendSessionId=item.sessionId;state.backendRequestStatus=item.status;state.backendRole=state.backendRole||'seeker';
    state.provider=item.providerName||state.provider;state.backendContextCard=item.contextCard||state.backendContextCard;
    if(item.status==='accepted'){state.order='active';state.price=state.price||10}else if(item.status==='waiting'){state.order='matching';if(state.backendRole==='seeker'&&current==='chat')navigate('matching',true)}else if(item.status==='completed'||item.status==='cancelled'){state.order=item.status}
    save();return item;
  }
  async function loadRequest(){
    if(!state.backendRequestId)return null;
    try{return applyRequest(await api(`/api/mobile/requests/${encodeURIComponent(state.backendRequestId)}`))}catch(error){console.warn('求助同步失败',error);return null}
  }
  function stopRequestPoll(){clearTimeout(requestTimer);requestTimer=null}
  async function pollRequest(){
    stopRequestPoll();const item=await loadRequest();if(!item)return;
    if(item.status==='accepted'){if(current==='matching')navigate('chat',true);if(current==='chat')syncEndedChat();requestTimer=setTimeout(pollRequest,1000);return}
    if(item.status==='completed'||item.status==='cancelled'){stopRequestPoll();if(current==='video'){window.stopRealtime?.();navigate('chat',true)}else if(current==='matching')navigate('chat',true);if(current==='chat'){syncEndedChat();renderRealtimeMessages()}return}
    if(item.status==='waiting'||item.status==='matching'){if(current!=='matching'&&state.backendRole==='seeker')navigate('matching',true);if(current==='matching'){const note=qa('p').find(p=>p.textContent.includes('正在寻找合适的人')||p.textContent.includes('模拟匹配'));if(note)note.textContent='正在等待接单广场中的服务者回应'}requestTimer=setTimeout(pollRequest,1200)}
  }
  publish=async function(){
    readForm();if(!state.title.trim()||!state.detail.trim()){toast('请先填写问题标题和详情');return}
    try{
      state.backendRequestId=null;state.backendSessionId=null;state.backendRequestStatus='';state.backendRole='seeker';state.order='none';
      const item=await api('/api/mobile/requests',{method:'POST',body:JSON.stringify({nickname:state.name,problem:state.title,channelId:channelId(),rawInput:{title:state.title,detail:state.detail,tags:state.tags||[]},contextCard:contextCard(),helpMode:'now',budgetCents:Math.round(Number(state.price||0)*100)})});
      state.backendRole='seeker';state.messages=[];state.backendRequestId=item.id;applyRequest(item);matchingPaused=false;navigate('matching');toast('求助已发布，正在等待真实服务者接单');pollRequest();
    }catch(error){toast(error.message||'发布失败')}
  };
  function requestTitle(item){return item.problem||item.contextCard?.goal||'新的求助'}
  function requestDetail(item){return item.contextCard?.currentSituation||item.rawInput?.detail||''}
  function renderProviderRequests(items){
    const host=named('页面内容')[0]||screen.firstElementChild;if(!host)return;
    const real=items.filter(item=>item&&item.status==='waiting').slice(0,3);
    qa('p,div,span').filter(node=>node.children.length===0&&node.textContent.trim()==='当前没有等待接单的真实求助').forEach(node=>node.remove());
    const old=qa('[data-name^="用户求助/"]');old.forEach(card=>card.remove());
    qa('.cloud-request-list').forEach(list=>list.remove());
    qa('.cloud-provider-subtitle').forEach(node=>node.remove());
    const subtitle=document.createElement('p');subtitle.className='cloud-provider-subtitle';subtitle.textContent='最新三条待接单求助';
    host.appendChild(subtitle);
    const wrap=document.createElement('div');wrap.className='cloud-request-list';
    wrap.innerHTML=real.length?real.map(item=>{const tags=(item.contextCard?.suggestedTags||[]).map(tag=>'<span class="provider-data-tag">'+esc(tag)+'</span>').join('');return '<button class="cloud-request-card" type="button" data-cloud-request="'+esc(item.id)+'"><strong>'+esc(requestTitle(item))+'</strong><p>'+esc(requestDetail(item)||'求助者暂未补充详情')+'</p><div>'+tags+'</div><small>¥'+((Number(item.budgetCents||0)/100).toFixed(0))+' / 次 · '+esc(item.nickname||'求助者')+' · 等待接单</small></button>'}).join(''):'<p class="cloud-request-empty">当前没有等待接单的真实求助</p>';
    host.appendChild(wrap);
    qa('[data-cloud-request]',wrap).forEach(card=>{const item=real.find(entry=>entry.id===card.dataset.cloudRequest);card.onclick=()=>item&&openCloudRequest(item)});
  }
  async function loadProviderRequests(){
    try{const result=await api('/api/mobile/requests');state.cloudRequests=result.items||[];if(current==='providerFeed')renderProviderRequests(state.cloudRequests)}catch(error){console.warn('接单广场同步失败',error)}
    clearTimeout(feedTimer);if(current==='providerFeed')feedTimer=setTimeout(loadProviderRequests,1500);
  }
  function openCloudRequest(item){
    state.backendRole='provider';state.backendRequestId=item.id;state.backendSessionId=item.sessionId;state.backendRequestStatus=item.status;state.cloudRequest=item;state.providerProfile=state.providerProfile||{};state.providerProfile.selectedNeedId=state.providerProfile.selectedNeedId||PROVIDER_NEEDS[0].id;save();navigate('providerDetail');
  }
  const localSetupProviderFeed=setupProviderFeed;
  setupProviderFeed=function(){localSetupProviderFeed();renderProviderRequests([]);loadProviderRequests()};
  const localSetupProviderDetail=setupProviderDetail;
  setupProviderDetail=function(){localSetupProviderDetail();const item=state.cloudRequest;if(!item)return;['信息/期望帮助','信息/已尝试','预算与报价','报价输入'].forEach(name=>named(name).forEach(node=>node.remove()));qa('p').filter(node=>['问题描述','电脑使用中突然卡住，屏幕停在原画面，鼠标和键盘都没反应。还没有重启，想请人指导我先检查什么。','尚未重启'].includes(node.textContent.trim())).forEach(node=>node.remove());const top=named('问题概况')[0];if(top){const context=item.contextCard||{},tags=(context.suggestedTags||[]).map(t=>'<span class="provider-data-tag">'+esc(t)+'</span>').join(''),tried=Array.isArray(context.tried)?context.tried.join('、'):String(context.tried||'未补充');top.innerHTML='<p class="cloud-detail-title">'+esc(requestTitle(item))+'</p><p class="cloud-detail-meta">'+esc(item.nickname||item.rawInput?.nickname||'求助者')+' · 等待接单</p><p class="cloud-detail-label">问题描述</p><p class="cloud-detail-description">'+esc(requestDetail(item)||'求助者暂未补充详情')+'</p><p class="cloud-detail-label">问题标签</p><div class="cloud-detail-tags">'+(tags||'<span>未提供</span>')+'</div><p class="cloud-detail-label">已尝试</p><p class="cloud-detail-description">'+esc(tried)+'</p><p class="cloud-detail-budget">用户预算 ¥'+(Number(item.budgetCents||0)/100)+' / 次</p><label class="cloud-quote-label">我的报价 ¥<input id="provider-quote" type="number" min="1" max="9999" value="10" aria-label="我的报价"><span>/ 次</span></label>'};};
  submitProviderQuote=async function(){
    if(!state.backendRequestId||state.backendRole!=='provider'){toast('请从实时接单广场选择求助');return}
    try{const item=await api(`/api/mobile/requests/${encodeURIComponent(state.backendRequestId)}/accept`,{method:'POST',body:JSON.stringify({providerName:state.name||'服务者'})});state.backendRole='provider';applyRequest(item);state.order='active';navigate('chat');pollRequest();toast('已接单，双方已进入同一服务会话')}catch(error){toast(error.message||'接单失败')}
  };

  function role(){return state.backendRole||'seeker'}
  function stopChatPoll(){clearInterval(chatTimer);chatTimer=null}
  async function loadMessages(){
    if(current!=='chat'||!state.backendSessionId)return;
    try{const result=await api(`/api/sessions/${encodeURIComponent(state.backendSessionId)}/messages`);state.realtimeMessages=result.items||[];renderChatMessages()}catch(error){console.warn('消息同步失败',error)}
  }
  function renderRealtimeMessages(){
    const list=q('.chat-list');if(!list)return;const items=state.realtimeMessages||[];list.style.display='block';list.innerHTML=items.length?items.map(m=>'<div class="chat-line '+(m.senderRole===role()?'mine':'')+'"><div class="bubble">'+esc(m.text).replace(/\n/g,'<br>')+'</div></div>').join(''):'<div style="padding:80px 24px;text-align:center;color:#5c6c80">等待双方输入第一条消息</div>';if(['completed','cancelled'].includes(state.order)||['completed','cancelled'].includes(state.backendRequestStatus))list.innerHTML+='<p class="chat-ended">订单已结束，聊天记录仅供查看</p>';list.scrollTop=list.scrollHeight;
  }
  function syncEndedChat(){
    const ended=['completed','cancelled'].includes(state.order)||['completed','cancelled'].includes(state.backendRequestStatus);
    const input=q('#chat-input');if(input)input.disabled=ended;
    ['操作/mic','操作/plus','聊天工具/图片 / 文件','聊天工具/视频指导'].forEach(name=>named(name).forEach(node=>{node.style.pointerEvents=ended?'none':'';node.style.opacity=ended?'.45':'';node.setAttribute('aria-disabled',String(ended))}));
    named('文字操作/完成').forEach(node=>{node.style.display=ended?'none':''});
    if(ended)leafText('一对一指导中',state.order==='completed'?'服务已结束':'订单已取消');
  }
  renderChatMessages=renderRealtimeMessages;
  send=async function(text){
    if(!state.backendSessionId){toast('当前求助还没有进入共享会话');return}if(['completed','cancelled'].includes(state.order)||['completed','cancelled'].includes(state.backendRequestStatus)){toast('订单已结束，不能继续发送消息');return}const input=q('#chat-input');text=(text??input?.value??'').trim();if(!text){toast('请先输入消息');return}if(text.length>500){toast('消息最多 500 字');return}
    try{await api(`/api/sessions/${encodeURIComponent(state.backendSessionId)}/messages`,{method:'POST',body:JSON.stringify({senderRole:role(),text,clientMessageId:crypto.randomUUID()})});if(input)input.value='';await loadMessages()}catch(error){toast(error.message||'消息发送失败')}
  };
  const localSetupChat=setupChat;
  setupChat=function(){localSetupChat();syncEndedChat();stopChatPoll();pollRequest();loadRequest().then(()=>{syncEndedChat();renderRealtimeMessages()});loadMessages();chatTimer=setInterval(loadMessages,1000)};
  startVideo=async function(){
    toast('正在检查服务会话并准备视频连接…');
    const item=await loadRequest();if(!item||item.status!=='accepted'||!item.sessionId){toast(item?.status==='completed'?'订单已结束，不能继续视频':(!item?'无法读取服务会话，请检查网络后重试':'请先等待服务者接单，再开始视频'));return}state.order='active';state.backendSessionId=item.sessionId;state.videoRole=state.backendRole==='provider'?'provider':'seeker';save();try{await window.beginVideoCall()}catch(error){toast(error.message||'视频呼叫失败，请重试')}pollRequest();
  };
  const localFinishService=finishService;
  finishService=async function(){
    if(!state.backendRequestId){localFinishService();return}
    if(['completed','cancelled'].includes(state.backendRequestStatus)){toast('订单已结束');return}
    try{const item=await api(`/api/mobile/requests/${encodeURIComponent(state.backendRequestId)}/complete`,{method:'POST'});applyRequest(item);state.order='completed';navigate('review');toast('订单已结束，双方已停止服务')}catch(error){toast(error.message||'结束订单失败')}
  };
  async function hydrate(){
    if(!state.backendRequestId)return;const item=await loadRequest();if(item?.status==='accepted'&&current==='matching')navigate('chat',true);if(item)pollRequest();
  }
  window.addEventListener('beforeunload',()=>{stopRequestPoll();stopChatPoll();clearTimeout(feedTimer)});
  hydrate();
})();
