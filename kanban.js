let cards=[];
const element=id=>document.getElementById(id);
const textNode=(tag,text,cls)=>{const node=document.createElement(tag);node.textContent=text;if(cls)node.className=cls;return node;};
function render(){
 const search=element('search').value.toLowerCase();
 const filtered=cards.filter(c=>(!element('project').value||c.project===element('project').value)&&(!element('priority').value||c.priority===element('priority').value)&&`${c.key} ${c.title} ${c.owner} ${c.next}`.toLowerCase().includes(search));
 element('board').replaceChildren();element('count').textContent=`${filtered.length} of ${cards.length} items`;
 for(const [id,label] of [['backlog','Backlog'],['active','In progress'],['review','Review'],['blocked','Blocked'],['done','Done']]){
  const inLane=filtered.filter(c=>(c.blocked&&c.column==='backlog'?'blocked':c.column)===id);
  const lane=textNode('section','', 'lane');const heading=textNode('h2',label);heading.append(textNode('span',inLane.length));lane.append(heading);
  for(const c of inLane){
   const card=textNode('article','', 'task');card.dataset.taskId=c.key;card.append(textNode('span',c.priority,'priority '+c.priority),textNode('span',c.key,'task-id'),textNode('span',c.project,'task-project'),textNode('h3',c.title),textNode('p',c.next),textNode('p',c.owner,'task-owner'));
   const details=document.createElement('details');details.append(textNode('summary','Evidence & acceptance'));const body=textNode('div','', 'details-body');
   const dl=document.createElement('dl');for(const [label,value] of [['Evidence',c.evidence],['Acceptance',c.acceptance],['Target window',c.due]])dl.append(textNode('dt',label),textNode('dd',value));body.append(dl);
   const link=textNode('a','Source record ↗');if(/^https:\/\/(github\.com|satcom\.conews\.press)\//.test(c.source))link.href=c.source;body.append(link);
   const copy=textNode('button','Copy task packet','button copy-packet');copy.type='button';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(`${c.key}: ${c.title}\nProject: ${c.project}\nOwner: ${c.owner}\nEvidence: ${c.evidence}\nNext: ${c.next}\nAcceptance: ${c.acceptance}\nWork directly. Read only relevant files; preserve unrelated work; verify before Done.`);copy.textContent='Copied';}catch{copy.textContent='Select task text to copy';}});body.append(copy);details.append(body);card.append(details);lane.append(card);
  }
  if(!inLane.length)lane.append(textNode('p','No matching items.','empty'));element('board').append(lane);
 }
}
async function refresh(){
 const button=element('refresh');button.disabled=true;element('sync-status').textContent='Checking the shared development board…';
 try{const r=await fetch('/api/development-board',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error();const data=await r.json();if(!Array.isArray(data.cards))throw new Error();cards=data.cards;
  element('sync-status').textContent=data.sourceMode==='live'?`Live board · checked ${new Date(data.checkedAt).toLocaleString()} · ${cards.length} reviewed items`:`Release snapshot from ${new Date(data.snapshotUpdatedAt).toLocaleString()} · Live board not confirmed; recent edits may be missing.`;
  const selected=element('project').value;element('project').replaceChildren(new Option('All projects',''));for(const name of [...new Set(cards.map(c=>c.project))].sort())element('project').append(new Option(name,name));element('project').value=selected;render();
 }catch{element('sync-status').textContent='Board unavailable. Open Admin Kanban or retry; no empty board is being presented as synchronized.';}finally{button.disabled=false;}
}
for(const id of ['search','project','priority'])element(id).addEventListener(id==='search'?'input':'change',render);element('refresh').addEventListener('click',refresh);refresh();
