// Only de-duplicated usage events enter this accumulator.
const keys = ['input_tokens','cached_input_tokens','output_tokens','reasoning_output_tokens','total_tokens'];
const blank = () => Object.fromEntries(keys.map(k=>[k,0]));
function bucket(extra={}) { return {...extra,...blank(),records:0,calls:0,legacyRecords:0,first:null,last:null,sources:{}}; }
function add(target,event) {
  for(const k of keys) target[k]+=event.usage[k];
  target.records++;target.calls+=event.kind==='response'?1:0;target.legacyRecords+=event.kind==='legacy'?1:0;
  target.first=target.first===null?event.time:Math.min(target.first,event.time);
  target.last=target.last===null?event.time:Math.max(target.last,event.time);
  target.sources[event.modelSource]=(target.sources[event.modelSource]||0)+1;
}
export class UsageDetails {
  constructor(labels=new Map()) {this.labels=labels;this.groups=new Map();}
  record(key,event,actor) {
    if(!this.groups.has(key))this.groups.set(key,{summary:bucket(),models:new Map(),actors:new Map()});
    const group=this.groups.get(key);
    const makeModel=id=>bucket({id:id==='Ukjent modell'?null:id,name:this.labels.get(id)||id});
    if(!group.models.has(event.model))group.models.set(event.model,makeModel(event.model));
    if(!group.actors.has(actor.id))group.actors.set(actor.id,{...bucket(actor),models:new Map(),events:[]});
    const thread=group.actors.get(actor.id);
    if(!thread.models.has(event.model))thread.models.set(event.model,makeModel(event.model));
    for(const target of [group.summary,group.models.get(event.model),thread,thread.models.get(event.model)])add(target,event);
    thread.events.push(event);
  }
  get(key) {
    const group=this.groups.get(key);
    if(!group)return {...bucket(),models:[],actors:[]};
    const sortedModels=map=>[...map.values()].sort((a,b)=>b.total_tokens-a.total_tokens);
    const actors=[...group.actors.values()].map(({events,models,...actor})=>{
      const timeline=[];
      for(const event of events.sort((a,b)=>a.time-b.time)) {
        let segment=timeline.at(-1);
        if(!segment||segment.model!==event.model) {
          segment=bucket({model:event.model,name:this.labels.get(event.model)||event.model});timeline.push(segment);
        }
        add(segment,event);
      }
      // Unknown stretches break the chain: do not infer a switch across missing metadata.
      const switches=timeline.slice(1).filter((s,i)=>s.model!=='Ukjent modell'&&timeline[i].model!=='Ukjent modell').length;
      return {...actor,models:sortedModels(models),timeline,switches};
    }).sort((a,b)=>a.first-b.first);
    return {...group.summary,models:sortedModels(group.models),actors};
  }
}
