/* The local app gives the map page what the artifact runtime gave it: a database (here, the app's files on disk),
   the viewer's rights and saving a file. Claude in the page (sample) and the project files are not part of the
   local app; Claude reaches the map through the app's MCP server. */
(function(){
'use strict';
const api=async(method,url,payload)=>{
  const r=await fetch(url,method==='GET'?{cache:'no-store'}:{method,headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw Object.assign(new Error(j.message||('The app answered '+r.status)),{code:j.code||'unavailable'});
  return j};
const wrapDocs=docs=>docs.map(d=>({id:d.id,data:()=>d.data}));
let stream=null;const fileListeners=new Set();
function events(){
  if(stream) return stream;
  stream=new EventSource('/api/events');
  stream.addEventListener('files',e=>{const docs=JSON.parse(e.data);for(const l of fileListeners) l.next({docs:wrapDocs(docs),metadata:{fromCache:false}})});
  stream.addEventListener('select',e=>{const iris=JSON.parse(e.data);try{window.DepMapAPI&&window.DepMapAPI.select(iris.map(i=>'<'+i+'>'))}catch(_){}});
  stream.onerror=()=>{if(stream.readyState===EventSource.CLOSED) for(const l of fileListeners) l.error&&l.error({code:'unavailable'})};
  return stream}
function collection(path){
  let lim=1000;
  const q={
    limit(n){lim=n;return q},
    async get(){const j=await api('GET','/api/collection?path='+encodeURIComponent(path)+'&limit='+lim);return {docs:wrapDocs(j.docs)}},
    onSnapshot(next,error){
      if(path==='files'){const l={next,error};fileListeners.add(l);events();return ()=>fileListeners.delete(l)}
      q.get().then(next,error);return ()=>{}}};
  return q}
function doc(path){
  const w=(op,data)=>api('POST','/api/doc',{path,op,data});
  return {
    async get(){const j=await api('GET','/api/doc?path='+encodeURIComponent(path));return {exists:j.exists,data:()=>j.data}},
    set:data=>w('set',data),update:data=>w('update',data),delete:()=>w('delete')}}
const db={collection,doc};
const user={async can(){return true}};
const downloads={async save({filename,data}){
  const blob=data instanceof Blob?data:new Blob([data],{type:'application/octet-stream'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);return {saved:filename}}};
const caps={db,user,downloads};
window.claude={use:async name=>caps[name]||null};
/* the port the app runs on, in the Tool access text */
document.addEventListener('DOMContentLoaded',()=>{for(const e of document.querySelectorAll('.port-here')) e.textContent=location.port||'80'});
/* The info button in the header: a window with the folder, the process and the environment variables the app runs in. */
document.addEventListener('DOMContentLoaded',()=>{
  const header=document.querySelector('header');if(!header) return;
  const btn=document.createElement('button');
  btn.type='button';btn.className='btn';btn.id='env-btn';btn.textContent='i';
  btn.title='What the app runs in';btn.setAttribute('aria-label','What the app runs in');
  btn.style.cssText='border-radius:50%;width:28px;height:28px;padding:0;font-style:italic;font-family:serif;font-weight:700';
  const dlg=document.createElement('dialog');
  dlg.id='env-dlg';dlg.style.cssText='max-width:min(900px,92vw);width:92vw;max-height:86vh;padding:0;border:1px solid #8884;border-radius:10px';
  const row=(k,v)=>{const tr=document.createElement('tr');
    const a=document.createElement('td'),b=document.createElement('td');
    a.textContent=k;b.textContent=v;
    a.style.cssText='padding:3px 12px 3px 0;white-space:nowrap;vertical-align:top;font-family:ui-monospace,monospace;font-size:12px';
    b.style.cssText='padding:3px 0;word-break:break-all;font-family:ui-monospace,monospace;font-size:12px';
    tr.append(a,b);return tr};
  btn.addEventListener('click',async()=>{
    dlg.textContent='';
    const head=document.createElement('div');
    head.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #8884;position:sticky;top:0;background:Canvas';
    const title=document.createElement('b');title.textContent='What the app runs in';
    const close=document.createElement('button');close.type='button';close.className='btn';close.textContent='Close';
    close.addEventListener('click',()=>dlg.close());
    head.append(title,close);
    const bodyEl=document.createElement('div');bodyEl.style.cssText='padding:12px 16px;overflow:auto;max-height:calc(86vh - 60px)';
    const table=document.createElement('table');table.style.borderCollapse='collapse';
    try{
      const j=await api('GET','/api/env');
      for(const [k,v] of [['PROJECT_DIR',j.PROJECT_DIR],['taken from',j.from],['folder',j.folder],['docs',j.docs],['process',String(j.pid)],['node',j.node]]) table.append(row(k,v));
      const gap=document.createElement('tr');const g=document.createElement('td');g.colSpan=2;g.style.cssText='padding:10px 0 4px;font-weight:600';
      g.textContent='Environment variables ('+Object.keys(j.env).length+')';gap.append(g);table.append(gap);
      for(const k of Object.keys(j.env)) table.append(row(k,j.env[k]));
    }catch(e){table.append(row('error',e.message))}
    bodyEl.append(table);dlg.append(head,bodyEl);
    if(!dlg.open) dlg.showModal()});
  header.append(btn);document.body.append(dlg)});
})();
