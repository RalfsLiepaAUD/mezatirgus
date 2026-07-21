export type EntityCounterState=Record<string,number>;
export class EntityIdCounters {
 private readonly counters:EntityCounterState;
 constructor(initial:EntityCounterState={}){this.counters={...initial};this.assertValid();}
 next(type:string,prefix=type.toUpperCase()):string{if(!/^[a-z][a-z0-9_]*$/.test(type))throw new Error(`Invalid entity counter type: ${type}`);const value=(this.counters[type]??0)+1;if(!Number.isSafeInteger(value))throw new Error(`Entity counter overflow: ${type}`);this.counters[type]=value;return`${prefix}-${String(value).padStart(6,"0")}`;}
 observe(type:string,id:string,prefix=type.toUpperCase()):void{const match=new RegExp(`^${prefix.replace(/[.*+?^${}()|[\\]\\]/g,"\\$&")}-(\\d{6,})$`).exec(id);if(!match)return;const value=Number(match[1]);if(!Number.isSafeInteger(value))throw new Error(`Invalid observed ID: ${id}`);this.counters[type]=Math.max(this.counters[type]??0,value);}
 snapshot():EntityCounterState{return{...this.counters};}restore(state:EntityCounterState):void{for(const key of Object.keys(this.counters))delete this.counters[key];Object.assign(this.counters,state);this.assertValid();}
 private assertValid(){for(const[key,value]of Object.entries(this.counters))if(!/^[a-z][a-z0-9_]*$/.test(key)||!Number.isSafeInteger(value)||value<0)throw new Error(`Invalid entity counter state: ${key}`);}
}