import { createHash } from "node:crypto";
import { canonicalJson } from "../config/canonical.js";
import { SNAPSHOT_SCHEMA_VERSION } from "../core/constants.js";
import type { AuthoritativeCoreState, SimulationEngine } from "../core/engine.js";
export interface CoreSnapshot { snapshotSchemaVersion:number; snapshotSequence:number; createdGameTime:number; eventLogIndex:number; state:AuthoritativeCoreState; snapshotChecksum:string; }
export function snapshotChecksum(value:Omit<CoreSnapshot,"snapshotChecksum">):string{return createHash("sha256").update(canonicalJson(value),"utf8").digest("hex");}
export function createSnapshot(engine:SimulationEngine):CoreSnapshot { engine.snapshotSequence=engine.snapshotSequence+1;const bare={snapshotSchemaVersion:SNAPSHOT_SCHEMA_VERSION,snapshotSequence:engine.snapshotSequence,createdGameTime:engine.clock.currentGameTime,eventLogIndex:engine.eventLog.length,state:engine.authoritativeState()};return{...structuredClone(bare),snapshotChecksum:snapshotChecksum(bare)}; }
export function validateSnapshot(snapshot:CoreSnapshot):void { if(snapshot.snapshotSchemaVersion!==SNAPSHOT_SCHEMA_VERSION)throw new Error(`Unsupported snapshot schema version: ${snapshot.snapshotSchemaVersion}`);const {snapshotChecksum:stored,...bare}=snapshot;if(snapshotChecksum(bare)!==stored)throw new Error("Snapshot checksum mismatch"); }