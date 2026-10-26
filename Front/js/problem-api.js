/* 正式问题整理流程：自动生成标题/标签；AI 润色需用户确认后才覆盖详情。 */
const FRONT_API_BASE=window.SKILLS_ENV?.apiBase||'';
const newFrontApi=(path,options={})=>fetch(FRONT_API_BASE+path,{headers:{'content-type':'application/json',...(options.headers||{})},...options}).then(async response=>{const body=await response.json().catch(()=>({}));if(!response.ok)throw Error(body.error||'服务暂不可用');return body});
let newFrontAiReady=false,newFrontAiRunning=false,newFrontAiTimer=null,newFrontAiSequence=0;

function setRequestAiState({ready=newFrontAiReady,running=newFrontAiRunning}={}){
  newFrontAiReady=ready;newFrontAiRunning=running;
  const button=q('#ai-polish');if(button){button.textContent=running?'AI处理中…':'AI润色';button.disabled=running}
  const confirm=qa('[data-name="主流程组件/按钮"]').find(node=>node.textContent.includes('确认问题'));
  if(confirm){const enabled=ready&&!running;confirm.style.opacity=enabled?'1':'.42';confirm.style.pointerEvents=enabled?'auto':'none';confirm.setAttribute('aria-disabled',String(!enabled))}
}
function applyGeneratedCases(cases=[]){
  state.remoteCases=cases;
  CASE_LIBRARY.splice(0,CASE_LIBRARY.length,...cases.map((item,index)=>({id:item.id,frame:['183:1896','183:1961','183:2026'][index]||'183:1896',title:item.title,tags:item.tags||[],detail:item.summary||'',summary:item.summary||'',steps:item.steps||[],result:item.result||'',scopeNote:item.scopeNote||'',riskNote:item.riskNote||'',videoUrl:item.videoUrl||null,imageUrls:item.imageUrls||[],isDemo:false})));
}
async function newFrontGenerate(polish,{automatic=false}={}){
  readForm();const originalDetail=state.detail.trim();if(!originalDetail){setRequestAiState({ready:false,running:false});return false}
  const sequence=++newFrontAiSequence;setRequestAiState({ready:false,running:true});
  try{
    const result=await newFrontApi('/api/newfront/problem',{method:'POST',body:JSON.stringify({title:automatic?'':state.title,detail:originalDetail,polish})});
    if(sequence!==newFrontAiSequence)return false;
    if(automatic){
      state.title=result.title||state.title;state.detail=originalDetail;state.tags=result.tags||[];state.tagOrigin='ai';applyGeneratedCases(result.cases||[]);save();
      const title=q('#request-title');if(title)title.value=state.title;updateTags();setRequestAiState({ready:true,running:false});toast('标题和标签已生成');return true;
    }
    setRequestAiState({ready:false,running:false});
    showSheet('AI 润色建议','<p>确认后才会替换问题详情。</p><label>标题<input id="ai-title" type="text" value="'+esc(result.title)+'"></label><label>详情<textarea id="ai-detail" rows="6">'+esc(result.detail)+'</textarea></label><p>标签：'+esc((result.tags||[]).join('、')||'未生成')+'</p><button class="primary" id="ai-apply">应用建议</button><button class="secondary" id="ai-keep">保留原文</button>',modal=>{
      q('#ai-apply',modal).onclick=()=>{state.title=q('#ai-title',modal).value.trim();state.detail=q('#ai-detail',modal).value.trim();state.tags=result.tags||[];state.tagOrigin='ai';applyGeneratedCases(result.cases||[]);save();closeSheet();render();setRequestAiState({ready:true,running:false});toast('已应用 AI 润色')};
      q('#ai-keep',modal).onclick=()=>{state.detail=originalDetail;save();closeSheet();scheduleProblemGeneration()};
    });return true;
  }catch(error){if(sequence!==newFrontAiSequence)return false;state.detail=originalDetail;setRequestAiState({ready:false,running:false});toast(error.message||'AI处理失败，已保留原文');return false}
}
function scheduleProblemGeneration(){
  clearTimeout(newFrontAiTimer);newFrontAiSequence++;readForm();setRequestAiState({ready:false,running:false});
  if(!state.detail.trim())return;
  newFrontAiTimer=setTimeout(()=>newFrontGenerate(false,{automatic:true}),2000);
}
window.scheduleProblemGeneration=scheduleProblemGeneration;

const localFields=fields;
fields=function(){
  localFields();const detail=q('#request-detail');
  if(detail&&!q('#ai-polish')){const button=document.createElement('button');button.id='ai-polish';button.type='button';button.textContent='AI润色';button.onclick=()=>{clearTimeout(newFrontAiTimer);newFrontGenerate(true)};detail.parentElement.appendChild(button)}
  if(detail){detail.addEventListener('input',scheduleProblemGeneration);detail.addEventListener('paste',()=>setTimeout(scheduleProblemGeneration,0))}
  setRequestAiState();
  if(detail?.value.trim()&&!newFrontAiReady&&!newFrontAiRunning)scheduleProblemGeneration();
};
confirmQuestion=function(){readForm();if(newFrontAiRunning){toast('AI正在生成标题和标签');return}if(!newFrontAiReady){toast('请等待标题和标签生成完成');scheduleProblemGeneration();return}navigate('confirm')};

const localSetupCaseTags=setupCaseTags;
setupCaseTags=function(){localSetupCaseTags();const items=state.remoteCases||CASE_LIBRARY;qa('[data-name^="往期案例/"]').forEach((row,index)=>{const item=items[index];if(!item)return;const texts=qa('p',row);if(texts[0])texts[0].textContent=item.title;if(texts[1])texts[1].textContent=item.summary||item.detail||'';const tagBox=q('.case-tags',row);if(tagBox)tagBox.innerHTML=(item.tags||[]).map(tag=>'<span>'+esc(tag)+'</span>').join('')})};
