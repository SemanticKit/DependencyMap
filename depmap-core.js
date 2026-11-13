/* SemanticKit dependency map: analysis engine.
   Input: RDF files (Turtle, N-Triples or RDF/XML). Output: terms, dependency edges, cycles and tiers.
   The same file runs in the page and in Node (depmap-cli.js). It has no dependencies of its own:
   the caller passes the N3 library for Turtle and a DOMParser for RDF/XML. */
(function(root){
'use strict';
const VERSION='5';
const RDF='http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS='http://www.w3.org/2000/01/rdf-schema#';
const OWL='http://www.w3.org/2002/07/owl#';
const XML='http://www.w3.org/XML/1998/namespace';
const SUBP=RDFS+'subPropertyOf',SEEALSO=RDFS+'seeAlso';

function detectFormat(name,text){
  const n=(name||'').toLowerCase();
  if(/\.(ttl|nt|n3|turtle)$/.test(n)) return 'turtle';
  if(/\.(rdf|owl|xml)$/.test(n)) return 'rdfxml';
  return /^\s*(<\?xml|<rdf:RDF|<!DOCTYPE|<!--)/.test(text)?'rdfxml':'turtle';
}

/* Turtle, N-Triples. N3 is the N3.js library object. */
function parseTurtle(text,N3,baseIRI){
  const triples=[],prefixes={};
  const term=t=>t.termType==='NamedNode'?{t:'iri',v:t.value}:t.termType==='BlankNode'?{t:'bnode',v:t.value}:{t:'lit',v:t.value,l:t.language||'',d:t.datatype?t.datatype.value:''};
  const quads=new N3.Parser(baseIRI?{baseIRI}:{}).parse(text,null,(p,ns)=>{prefixes[p]=ns});
  for(const q of quads) triples.push({s:term(q.subject),p:q.predicate.value,o:term(q.object)});
  const out={};for(const k in prefixes){const v=prefixes[k];out[k]=typeof v==='string'?v:v.value}
  return {triples,prefixes:out};
}

/* RDF/XML. DP is a DOMParser constructor. */
function parseRdfXml(text,DP,baseIRI){
  const doc=new DP().parseFromString(text,'application/xml');
  const top=doc&&doc.documentElement;
  if(!top||top.localName==='parsererror'||(doc.getElementsByTagName('parsererror')||[]).length) throw new Error('The file is not well-formed XML.');
  const triples=[],prefixes={};let n=0;
  const iri=v=>({t:'iri',v}),blank=()=>({t:'bnode',v:'x'+(n++)});
  const kids=e=>{const r=[];for(let c=e.firstChild;c;c=c.nextSibling) if(c.nodeType===1) r.push(c);return r};
  const attr=(e,ns,l)=>e.hasAttributeNS(ns,l)?e.getAttributeNS(ns,l):null;
  const baseOf=e=>{for(let x=e;x&&x.nodeType===1;x=x.parentNode){const b=attr(x,XML,'base');if(b!==null) return b}return baseIRI||''};
  const res=(e,v)=>{const b=baseOf(e);if(!b) return v;try{return new URL(v,b).href}catch(_){return v}};
  const langOf=e=>{for(let x=e;x&&x.nodeType===1;x=x.parentNode){const l=attr(x,XML,'lang');if(l!==null) return l}return ''};
  const lit=(v,e)=>{const d=attr(e,RDF,'datatype');return {t:'lit',v,l:d?'':langOf(e),d:d||''}};
  const add=(s,p,o)=>triples.push({s,p,o});
  const li=new Map();
  for(let i=0;i<top.attributes.length;i++){const a=top.attributes[i];if(a.name.indexOf('xmlns:')===0) prefixes[a.name.slice(6)]=a.value}
  function node(e){
    let s;const about=attr(e,RDF,'about'),id=attr(e,RDF,'ID'),nid=attr(e,RDF,'nodeID');
    if(about!==null) s=iri(res(e,about));else if(id!==null) s=iri(res(e,'#'+id));else if(nid!==null) s={t:'bnode',v:'n'+nid};else s=blank();
    if(!(e.namespaceURI===RDF&&e.localName==='Description')) add(s,RDF+'type',iri(e.namespaceURI+e.localName));
    for(let i=0;i<e.attributes.length;i++){const a=e.attributes[i];
      if(!a.namespaceURI||a.namespaceURI===XML||a.name.indexOf('xmlns')===0) continue;
      if(a.namespaceURI===RDF&&['about','ID','nodeID','datatype','parseType','resource'].includes(a.localName)) continue;
      if(a.namespaceURI===RDF&&a.localName==='type') add(s,RDF+'type',iri(res(e,a.value)));
      else add(s,a.namespaceURI+a.localName,{t:'lit',v:a.value,l:langOf(e),d:''});}
    for(const c of kids(e)) prop(s,c);
    return s;
  }
  function prop(s,e){
    let p=e.namespaceURI+e.localName;
    if(p===RDF+'li'){const k=s.t+s.v,i=(li.get(k)||0)+1;li.set(k,i);p=RDF+'_'+i}
    const r=attr(e,RDF,'resource'),nid=attr(e,RDF,'nodeID'),pt=attr(e,RDF,'parseType');
    if(r!==null){add(s,p,iri(res(e,r)));return}
    if(nid!==null){add(s,p,{t:'bnode',v:'n'+nid});return}
    if(pt==='Resource'){const b=blank();add(s,p,b);for(const c of kids(e)) prop(b,c);return}
    if(pt==='Collection'){
      const items=kids(e).map(node);
      if(!items.length){add(s,p,iri(RDF+'nil'));return}
      let cur=blank();add(s,p,cur);
      items.forEach((it,i)=>{add(cur,RDF+'first',it);
        if(i===items.length-1) add(cur,RDF+'rest',iri(RDF+'nil'));else{const nx=blank();add(cur,RDF+'rest',nx);cur=nx}});
      return}
    if(pt==='Literal'){add(s,p,{t:'lit',v:e.textContent||'',l:'',d:RDF+'XMLLiteral'});return}
    const ks=kids(e);
    if(ks.length){add(s,p,node(ks[0]));return}
    add(s,p,lit(e.textContent||'',e));
  }
  if(top.namespaceURI===RDF&&top.localName==='RDF') for(const c of kids(top)) node(c);else node(top);
  return {triples,prefixes};
}

function parse(name,text,format,env){
  format=format||detectFormat(name,text);
  if(format==='rdfxml'){if(!env.DOMParser) throw new Error('No XML parser is available.');return parseRdfXml(text,env.DOMParser,env.baseIRI)}
  if(!env.N3) throw new Error('The Turtle parser did not load.');
  return parseTurtle(text,env.N3,env.baseIRI);
}

/* files: [{name, triples, prefixes}] -> {terms, edges, tiers, cycles, triples, prefixes} */
function analyze(files,opt){
  /* Compact names. Each prefix binding of each file is kept: one namespace can have more than one prefix.
     opt.bindings: the files to take bindings from (default: files). opt.choose: {namespace: prefix} selects the prefix to show.
     Without a selection, the first prefix that is not empty is used. The empty prefix shows as ":name". */
  opt=opt||{};
  const byNs=new Map();
  for(const f of opt.bindings||files) for(const p in f.prefixes||{}){const ns=f.prefixes[p];if(!ns) continue;
    let a=byNs.get(ns);if(!a) byNs.set(ns,a=[]);let x=a.find(y=>y.label===p);if(!x) a.push(x={label:p,files:[]});if(!x.files.includes(f.name)) x.files.push(f.name)}
  const ns2p=new Map(),used=new Set(),namespaces=[];
  for(const [ns,al] of byNs){
    const want=opt.choose&&al.some(x=>x.label===opt.choose[ns])?opt.choose[ns]:(al.find(x=>x.label!=='')||al[0]).label;
    let q=want;
    if(used.has(q)){const other=al.find(x=>!used.has(x.label));if(other) q=other.label;else{let i=2;while(used.has(want+i)) i++;q=want+i}}
    ns2p.set(ns,q);used.add(q);namespaces.push({ns,used:q,aliases:al})}
  const nss=[...ns2p.keys()].sort((a,b)=>b.length-a.length);
  const idc=new Map();
  const idOf=iri=>{let id=idc.get(iri);if(id!==undefined) return id;id='<'+iri+'>';
    for(const ns of nss){if(iri.indexOf(ns)===0){const l=iri.slice(ns.length);if(!/[\/#?\s<>]/.test(l)){id=ns2p.get(ns)+':'+l}break}}
    idc.set(iri,id);return id};
  const prefixOf=id=>id.charAt(0)==='<'?'':(id.slice(0,id.indexOf(':'))||':');

  /* A term is an IRI that the files describe: the subject of a statement. */
  const terms={},triples={};
  for(const f of files){triples[f.name]=f.triples.length;
    for(const t of f.triples) if(t.s.t==='iri'){const s=idOf(t.s.v),d=terms[s]||(terms[s]={i:t.s.v,f:[]});if(!d.f.includes(f.name)) d.f.push(f.name)}}
  for(const id in terms) terms[id].p=prefixOf(id);
  /* rdfs:subPropertyOf, as the files state it */
  const sup=new Map();
  for(const f of files) for(const t of f.triples) if(t.p===SUBP&&t.s.t==='iri'&&t.o.t==='iri'){let a=sup.get(t.s.v);if(!a) sup.set(t.s.v,a=[]);if(!a.includes(t.o.v)) a.push(t.o.v)}
  const above=p=>{const out=[],st=[p],seen=new Set([p]);while(st.length){const x=st.shift();for(const y of sup.get(x)||[]) if(!seen.has(y)){seen.add(y);out.push(y);st.push(y)}}return out};
  /* An edge is a statement from a term to a term. The property of the statement is the name of the edge.
     A value inside a blank node (a list, a class expression) belongs to the statement that holds the blank node. */
  const edges=[],kinds={},refs={};
  for(const f of files){
    const bn=new Map();
    for(const t of f.triples) if(t.s.t==='bnode'){let a=bn.get(t.s.v);if(!a) bn.set(t.s.v,a=[]);a.push(t)}
    const walk=start=>{const out=[],seen=new Set(),st=[start];
      while(st.length){const b=st.pop();if(seen.has(b)) continue;seen.add(b);
        for(const t of bn.get(b)||[]){if(t.o.t==='bnode') st.push(t.o.v);else if(t.o.t==='iri') out.push(t.o.v)}}
      return out};
    const seen=new Set();
    for(const t of f.triples){
      if(t.s.t!=='iri'||t.o.t==='lit') continue;
      const s=idOf(t.s.v),pn=idOf(t.p);
      for(const o of t.o.t==='iri'?[t.o.v]:walk(t.o.v)){const oid=idOf(o);if(!terms[oid]) continue;
        const k=s+'\u0000'+pn+'\u0000'+oid;if(seen.has(k)) continue;seen.add(k);
        edges.push([s,pn,oid,f.name]);
        if(!(pn in kinds)){const up=above(t.p);
          /* the group of an edge is the top of its rdfs:subPropertyOf line */
          kinds[pn]=idOf(up.length?up[up.length-1]:t.p);
          /* rdfs:seeAlso and its subproperties give a reference about the subject. A reference does not order the build. */
          if(t.p===SEEALSO||up.includes(SEEALSO)) refs[pn]=true}}
    }
  }

  /* cycles (strongly connected components) and tiers, on the ordering edges */
  const ids=Object.keys(terms).sort(),idx=new Map(ids.map((id,i)=>[id,i])),N=ids.length;
  const adj=ids.map(()=>[]);
  for(const [s,p,o] of edges) if(!refs[p]&&s!==o) adj[idx.get(s)].push(idx.get(o));
  const num=new Int32Array(N).fill(-1),low=new Int32Array(N),on=new Uint8Array(N),comp=new Int32Array(N).fill(-1);
  const comps=[],stack=[];let c=0;
  for(let r=0;r<N;r++){
    if(num[r]!==-1) continue;
    const work=[[r,0]];num[r]=low[r]=c++;stack.push(r);on[r]=1;
    while(work.length){
      const top=work[work.length-1],v=top[0];
      if(top[1]<adj[v].length){const w=adj[v][top[1]++];
        if(num[w]===-1){num[w]=low[w]=c++;stack.push(w);on[w]=1;work.push([w,0])}
        else if(on[w]&&num[w]<low[v]) low[v]=num[w];}
      else{work.pop();
        if(work.length){const u=work[work.length-1][0];if(low[v]<low[u]) low[u]=low[v]}
        if(low[v]===num[v]){const g=[];let w;do{w=stack.pop();on[w]=0;comp[w]=comps.length;g.push(w)}while(w!==v);comps.push(g)}}
    }
  }
  /* components come out with every dependency before its dependants */
  const ctier=new Int32Array(comps.length);
  comps.forEach((g,ci)=>{let m=0;for(const v of g) for(const w of adj[v]){const cw=comp[w];if(cw!==ci&&ctier[cw]+1>m) m=ctier[cw]+1}ctier[ci]=m});
  const by=new Map();
  comps.forEach((g,ci)=>{const names=g.map(i=>ids[i]).sort();let a=by.get(ctier[ci]);if(!a) by.set(ctier[ci],a=[]);a.push(names)});
  const tiers=[...by.keys()].sort((a,b)=>a-b).map(t=>({tier:t,groups:by.get(t).sort((a,b)=>a[0]<b[0]?-1:1)}));
  const cycles=[];for(const t of tiers) for(const g of t.groups) if(g.length>1) cycles.push({tier:t.tier,terms:g});
  const prefixes={};for(const [ns,p] of ns2p) if(!(p in prefixes)) prefixes[p]=ns;
  return {terms,edges,tiers,cycles,triples,prefixes,namespaces,kinds,refs};
}

/* Lookups on a result of analyze(). kinds: optional Set of edge groups (values of g.kinds). Without it, references are left out. */
function index(g){
  const tier={},unit={},out={},inn={};
  for(const t of g.tiers) for(const u of t.groups) for(const id of u){tier[id]=t.tier;unit[id]=u}
  for(const e of g.edges){(out[e[0]]=out[e[0]]||[]).push(e);(inn[e[2]]=inn[e[2]]||[]).push(e)}
  return {tier,unit,out,inn,kinds:g.kinds||{},refs:g.refs||{}};
}
function reach(ix,start,dir,kinds,direct){
  const adj=dir==='down'?ix.inn:ix.out,k=dir==='down'?0:2,ok=e=>kinds?kinds.has(ix.kinds[e[1]]):!ix.refs[e[1]];
  const seen=new Set(),st=[...start],vis=new Set();
  if(direct){for(const n of st) for(const e of adj[n]||[]) if(ok(e)) seen.add(e[k])}
  else while(st.length){const n=st.pop();if(vis.has(n)) continue;vis.add(n);for(const e of adj[n]||[]) if(ok(e)){seen.add(e[k]);st.push(e[k])}}
  for(const s of start) seen.delete(s);
  return seen;
}
/* The answer for one term: what it is, what has to happen first, what waits for it. */
function describe(g,ix,id){
  const t=g.terms[id];if(!t) return null;
  const sort=s=>[...s].sort((a,b)=>ix.tier[a]-ix.tier[b]||(a<b?-1:1));
  return {id,iri:t.i,declaredIn:t.f,tier:ix.tier[id],unit:ix.unit[id],
    hasToHappenFirst:sort(reach(ix,[id],'up')),waitsForIt:sort(reach(ix,[id],'down')),
    edgesOut:(ix.out[id]||[]).map(e=>[e[1],e[2],e[3]]),edgesIn:(ix.inn[id]||[]).map(e=>[e[1],e[0],e[3]])};
}

/* Every triple, indexed, so that all the information about a term can be shown.
   files: [{name, triples}] -> subj: IRI -> [{p,o,file}], obj: IRI -> [{s,p,file}], pred: IRI -> count,
   bn: file+NUL+blank id -> its triples, bnIn: file+NUL+blank id -> the triples that point at it. */
function facts(files){
  const subj=new Map(),obj=new Map(),pred=new Map(),bn=new Map(),bnIn=new Map();
  const push=(m,k,v)=>{let a=m.get(k);if(!a) m.set(k,a=[]);a.push(v)};
  for(const f of files) for(const t of f.triples){
    if(t.s.t==='iri') push(subj,t.s.v,{p:t.p,o:t.o,file:f.name});else push(bn,f.name+'\u0000'+t.s.v,t);
    if(t.o.t==='iri') push(obj,t.o.v,{s:t.s,p:t.p,file:f.name});else if(t.o.t==='bnode') push(bnIn,f.name+'\u0000'+t.o.v,t);
    pred.set(t.p,(pred.get(t.p)||0)+1);
  }
  return {subj,obj,pred,bn,bnIn};
}
/* The named subject that a blank node belongs to. */
function owner(fx,file,b){
  const seen=new Set();let cur=[b];
  for(let d=0;d<12&&cur.length;d++){const next=[];
    for(const x of cur){if(seen.has(x)) continue;seen.add(x);
      for(const t of fx.bnIn.get(file+'\u0000'+x)||[]){if(t.s.t==='iri') return t.s.v;next.push(t.s.v)}}
    cur=next}
  return null;
}
/* A property and every property that the files make a subproperty of it. */
function family(fx,p){const out=[p],st=[p];
  while(st.length){const x=st.shift();for(const t of fx.obj.get(x)||[]) if(t.p===SUBP&&t.s.t==='iri'&&!out.includes(t.s.v)){out.push(t.s.v);st.push(t.s.v)}}
  return out}
function text(fx,iri,preds){
  const ts=fx.subj.get(iri)||[];
  for(const p of preds){const c=ts.filter(t=>t.p===p&&t.o.t==='lit');if(c.length) return (c.find(t=>!t.o.l||/^en\b/.test(t.o.l))||c[0]).o.v}
  return '';
}
const api={VERSION,RDF,RDFS,facts,owner,text,family,detectFormat,parseTurtle,parseRdfXml,parse,analyze,index,reach,describe};
if(typeof module!=='undefined'&&module.exports) module.exports=api;else root.DepMap=api;
})(typeof globalThis!=='undefined'?globalThis:this);
