import { createHash } from "node:crypto";
import { RNG_STREAM_NAMES } from "./constants.js";
const MASK=(1n<<64n)-1n;
export interface RngStreamState { stateHex:string; drawCount:number; }
export type RngRegistryState=Record<string,RngStreamState>;
function initialState(seed:string,name:string):bigint { const hex=createHash("sha256").update(`${seed}\0${name}`,"utf8").digest("hex").slice(0,16); return BigInt(`0x${hex}`); }
export class DeterministicRngStream {
  private state:bigint; private draws:number;
  constructor(state:bigint,drawCount=0){this.state=state&MASK;this.draws=drawCount;}
  nextUint32():number { this.state=(this.state+0x9e3779b97f4a7c15n)&MASK;let z=this.state;z=((z^(z>>30n))*0xbf58476d1ce4e5b9n)&MASK;z=((z^(z>>27n))*0x94d049bb133111ebn)&MASK;z=z^(z>>31n);this.draws++;return Number(z&0xffffffffn); }
  nextInt(maxExclusive:number):number { if(!Number.isSafeInteger(maxExclusive)||maxExclusive<=0)throw new Error("maxExclusive must be a positive safe integer");return this.nextUint32()%maxExclusive; }
  snapshot():RngStreamState{return{stateHex:this.state.toString(16).padStart(16,"0"),drawCount:this.draws};}
}
export class NamedRngRegistry {
  private readonly streams=new Map<string,DeterministicRngStream>();
  constructor(readonly seed:string,initial:RngRegistryState={}){for(const [name,state] of Object.entries(initial))this.streams.set(name,new DeterministicRngStream(BigInt(`0x${state.stateHex}`),state.drawCount));}
  stream(name:string):DeterministicRngStream { if(!/^[a-z][a-z0-9_.-]*$/.test(name))throw new Error(`Invalid RNG stream name: ${name}`);let stream=this.streams.get(name);if(!stream){stream=new DeterministicRngStream(initialState(this.seed,name));this.streams.set(name,stream);}return stream; }
  initializeStandardStreams():void { for(const name of RNG_STREAM_NAMES)this.stream(name); }
  snapshot():RngRegistryState{return Object.fromEntries([...this.streams.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([name,stream])=>[name,stream.snapshot()]));}
}