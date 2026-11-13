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
})();
