#!/usr/bin/env node
/* SemanticKit dependency map, command line.
   Setup, one time, in this directory:  npm install
   Use:  node depmap-cli.js <file>... [--term <id or IRI>] [--order] [--json]
   Files are Turtle, N-Triples or RDF/XML. Term ids are compact names (owl:Class) or <IRI>. */
const fs=require('fs'),path=require('path');
const C=require('./depmap-core.js');
let N3,DOMParser;
try{N3=require('n3');({DOMParser}=require('@xmldom/xmldom'))}catch(e){console.error('Run "npm install" in '+__dirname+' first.');process.exit(2)}
const args=process.argv.slice(2),files=[],opt={};
for(let i=0;i<args.length;i++){const a=args[i];
  if(a==='--term') (opt.term=opt.term||[]).push(args[++i]);else if(a==='--order') opt.order=true;else if(a==='--json') opt.json=true;
  else if(a==='-h'||a==='--help') opt.help=true;else files.push(a)}
if(opt.help||!files.length){console.log(fs.readFileSync(__filename,'utf8').split('\n').slice(1,6).join('\n'));process.exit(files.length?0:1)}
const parsed=[];
for(const f of files){const name=path.basename(f);
  try{parsed.push(Object.assign({name},C.parse(name,fs.readFileSync(f,'utf8'),null,{N3,DOMParser})))}
  catch(e){console.error(name+': could not be read: '+e.message);process.exit(1)}}
const g=C.analyze(parsed),ix=C.index(g);
const fx=C.facts(parsed),ids=new Map(Object.keys(g.terms).map(id=>[g.terms[id].i,id]));
const nss=Object.keys(g.prefixes).map(p=>[g.prefixes[p],p]).sort((a,b)=>b[0].length-a[0].length);
const short=iri=>{if(ids.has(iri)) return ids.get(iri);for(const [ns,p] of nss) if(iri.indexOf(ns)===0&&!/[\/#?]/.test(iri.slice(ns.length))) return p+':'+iri.slice(ns.length);return '<'+iri+'>'};
const val=(o,file,d)=>o.t==='iri'?short(o.v):o.t==='lit'?JSON.stringify(o.v)+(o.l?'@'+o.l:''):d>6?'[]':'[ '+(fx.bn.get(file+'\u0000'+o.v)||[]).map(t=>short(t.p)+' '+val(t.o,file,d+1)).join(' ; ')+' ]';
const statements=iri=>(fx.subj.get(iri)||[]).map(t=>({property:short(t.p),value:val(t.o,t.file,0),file:t.file}));
const find=t=>{if(g.terms[t]) return t;const iri=t.replace(/^<|>$/g,'');return Object.keys(g.terms).find(id=>g.terms[id].i===iri)};
if(opt.term){
  const out=opt.term.map(t=>{const id=find(t);if(!id) return {id:t,error:'No term with this name in the files.'};const d=C.describe(g,ix,id);d.label=C.text(fx,d.iri,C.family(fx,C.RDFS+'label'));d.comment=C.text(fx,d.iri,C.family(fx,C.RDFS+'comment'));d.statements=statements(d.iri);return d});
  if(opt.json){console.log(JSON.stringify(out,null,1))}
  else for(const d of out){
    if(d.error){console.log(d.id+': '+d.error);continue}
    console.log(d.id+'  <'+d.iri+'>');
    console.log('  declared in: '+d.declaredIn.join(', ')+'   tier: '+d.tier+(d.unit.length>1?'   cycle: '+d.unit.join(', '):''));
    console.log('  has to happen first ('+d.hasToHappenFirst.length+'):');
    const by={};for(const x of d.hasToHappenFirst)(by[ix.tier[x]]=by[ix.tier[x]]||[]).push(x);
    for(const t of Object.keys(by)) console.log('    T'+t+'  '+by[t].join(' '));
    console.log('  waits for it ('+d.waitsForIt.length+')'+(d.waitsForIt.length?': '+d.waitsForIt.join(' '):''));
    console.log('  statements ('+d.statements.length+'):');for(const x of d.statements) console.log('    '+x.property+' '+x.value+'   ['+x.file+']');
  }
}else if(opt.json){console.log(JSON.stringify(g))}
else if(opt.order){for(const t of g.tiers) for(const u of t.groups) console.log('T'+t.tier+'\t'+u.join(' '))}
else{
  console.log('files:  '+Object.entries(g.triples).map(([n,c])=>n+' ('+c+' triples)').join(', '));
  console.log('terms:  '+Object.keys(g.terms).length+'   edges: '+g.edges.length);
  for(const t of g.tiers) console.log('tier '+t.tier+': '+t.groups.reduce((a,u)=>a+u.length,0)+' terms');
  console.log('cycles: '+g.cycles.length);for(const c of g.cycles) console.log('  T'+c.tier+'  '+c.terms.join(' '));
}
