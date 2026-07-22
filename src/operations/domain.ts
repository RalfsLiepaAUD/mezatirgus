import type { DomainEvent } from '../core/events.js';
import type { OperationsSnapshot } from './types.js';
import type { InvariantMode } from '../core/constants.js';

const cp = <T>(x: T): T => structuredClone(x);

const EVENTS = new Set([
  'YardCreated',
  'YardCapacityAdjusted',
  'TruckCreated',
  'TruckMaintenanceScheduled',
  'TruckMaintenanceCompleted',
  'TruckRetired',
  'DriverCreated',
  'DriverAssigned',
  'DriverUnassigned',
  'EmployeeCreated',
  'EmployeeAssigned',
  'EmployeeUnassigned',
  'LaneCreated',
  'LanePaused',
  'LaneRetired',
  'LaneTripCompleted',
  'DispatchOrderCreated',
  'DispatchOrderConfirmed',
  'DispatchOrderArrived',
  'DispatchOrderUnloaded',
  'DispatchOrderCompleted',
  'DispatchOrderCancelled',
  'OperationsCostPosted',
  'YardSortingRecorded',
  'YardSortingConductRecorded',
  'SortJobQueued',
  'SortJobCompleted',
  'SortJobFailed',
]);

export const emptyOperations = (): OperationsSnapshot => ({
  appliedEventIds: [],
  yards: [],
  trucks: [],
  drivers: [],
  employees: [],
  lanes: [],
  dispatchOrders: [],
  sortJobs: [],
});

export class OperationsDomain {
  private state: OperationsSnapshot;
  private invariantMode: InvariantMode = 'FULL';
  setInvariantMode(m: InvariantMode) { this.invariantMode = m; }

  constructor(initial?: OperationsSnapshot) {
    this.state = initial ? cp(initial) : emptyOperations();
    this.assertInvariants();
  }

  snapshot(): OperationsSnapshot { return cp(this.state); }

  yard(id: string) { return this.state.yards.find(x => x.id === id); }
  truck(id: string) { return this.state.trucks.find(x => x.id === id); }
  driver(id: string) { return this.state.drivers.find(x => x.id === id); }
  employee(id: string) { return this.state.employees.find(x => x.id === id); }
  lane(id: string) { return this.state.lanes.find(x => x.id === id); }
  dispatchOrder(id: string) { return this.state.dispatchOrders.find(x => x.id === id); }
  sortJob(id: string) { return this.state.sortJobs.find(x => x.id === id); }
  // Read-access (deep-cloned, mutation-safe)
  allEmployees() { return this.state.employees.map(e => cp(e)); }
  allYards() { return this.state.yards.map(y => cp(y)); }
  checkInvariants() { this.assertInvariants(); }

  activeDispatchForLoad(loadId: string) {
    return this.state.dispatchOrders.find(x =>
      x.loadId === loadId && !['COMPLETED', 'CANCELLED'].includes(x.status)
    );
  }

  apply(event: DomainEvent) {
    if (!EVENTS.has(event.eventType)) return;
    if (this.state.appliedEventIds.includes(event.eventId))
      throw new Error('Duplicate operations event: ' + event.eventId);

    const p = event.payload as any;

    if (event.eventType === 'YardCreated') {
      const x = cp(p.yard);
      x.sourceEventIds = [event.eventId];
      this.state.yards.push(x);

    } else if (event.eventType === 'YardCapacityAdjusted') {
      const y = this.yard(p.yardId);
      if (y) {
        y.usedCapacityMilliM3 = Math.max(0, y.usedCapacityMilliM3 + Number(p.deltaMilliM3));
        if (y.usedCapacityMilliM3 >= y.totalCapacityMilliM3 && y.status === 'ACTIVE')
          y.status = 'FULL';
        else if (y.usedCapacityMilliM3 < y.totalCapacityMilliM3 && y.status === 'FULL')
          y.status = 'ACTIVE';
        y.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'TruckCreated') {
      const x = cp(p.truck);
      x.sourceEventIds = [event.eventId];
      this.state.trucks.push(x);

    } else if (event.eventType === 'TruckMaintenanceScheduled') {
      const t = this.truck(p.truckId);
      if (t && t.status !== 'RETIRED') {
        t.maintenanceDueTimestamp = p.maintenanceDueTimestamp;
        t.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'TruckMaintenanceCompleted') {
      const t = this.truck(p.truckId);
      if (t) {
        (t as any).maintenanceDueTimestamp = undefined;
        if (t.status === 'MAINTENANCE') t.status = 'IDLE';
        t.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'TruckRetired') {
      const t = this.truck(p.truckId);
      if (t) {
        t.status = 'RETIRED';
        t.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'DriverCreated') {
      const x = cp(p.driver);
      x.sourceEventIds = [event.eventId];
      this.state.drivers.push(x);

    } else if (event.eventType === 'DriverAssigned') {
      const d = this.driver(p.driverId);
      const t = this.truck(p.truckId);
      if (d && t && d.status === 'AVAILABLE' && !t.assignedDriverId) {
        d.status = 'ASSIGNED';
        d.assignedTruckId = t.id;
        t.assignedDriverId = d.id;
        d.sourceEventIds.push(event.eventId);
        t.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'DriverUnassigned') {
      const d = this.driver(p.driverId);
      if (d && d.assignedTruckId) {
        const t = this.truck(d.assignedTruckId);
        if (t) {
          (t as any).assignedDriverId = undefined;
          t.sourceEventIds.push(event.eventId);
        }
        d.status = 'AVAILABLE';
        (d as any).assignedTruckId = undefined;
        d.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'EmployeeCreated') {
      const x = cp(p.employee);
      x.sourceEventIds = [event.eventId];
      this.state.employees.push(x);

    } else if (event.eventType === 'EmployeeAssigned') {
      const e = this.employee(p.employeeId);
      if (e && e.status === 'AVAILABLE') {
        e.status = 'ASSIGNED';
        e.assignedYardId = p.yardId;
        e.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'EmployeeUnassigned') {
      const e = this.employee(p.employeeId);
      if (e) {
        e.status = 'AVAILABLE';
        (e as any).assignedYardId = undefined;
        e.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'LaneCreated') {
      const x = cp(p.lane);
      x.sourceEventIds = [event.eventId];
      this.state.lanes.push(x);

    } else if (event.eventType === 'LanePaused') {
      const l = this.lane(p.laneId);
      if (l && l.status === 'ACTIVE') {
        l.status = 'PAUSED';
        l.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'LaneRetired') {
      const l = this.lane(p.laneId);
      if (l && l.status !== 'RETIRED') {
        l.status = 'RETIRED';
        l.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'LaneTripCompleted') {
      const l = this.lane(p.laneId);
      if (l) {
        l.totalTrips += 1;
        l.totalVolumeMilliM3 += p.volumeMilliM3;
        if (p.cleanTrip) {
          l.cleanRepetitions += 1;
          l.repetitionsUntilStable = Math.max(0, l.repetitionsUntilStable - 1);
          if (l.repetitionsUntilStable === 0 && !l.isStable) {
            l.isStable = true;
          }
        } else {
          l.cleanRepetitions = 0;
          l.repetitionsUntilStable = l.repetitionsUntilStable; // keep threshold
        }
        l.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'DispatchOrderCreated') {
      const x = cp(p.order);
      x.sourceEventIds = [event.eventId];
      this.state.dispatchOrders.push(x);

    } else if (event.eventType === 'DispatchOrderConfirmed') {
      const o = this.dispatchOrder(p.orderId);
      if (o && o.status === 'PLANNED') {
        o.status = 'CONFIRMED';
        o.confirmedTimestamp = event.gameTime;
        o.plannedArrivalTimestamp = p.arrivalTimestamp;
        o.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'DispatchOrderArrived') {
      const o = this.dispatchOrder(p.orderId);
      if (o && ['CONFIRMED', 'IN_TRANSIT'].includes(o.status)) {
        o.status = 'ARRIVED';
        o.actualArrivalTimestamp = event.gameTime;
        o.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'DispatchOrderUnloaded') {
      const o = this.dispatchOrder(p.orderId);
      if (o && o.status === 'ARRIVED') {
        o.status = 'UNLOADED';
        o.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'DispatchOrderCompleted') {
      const o = this.dispatchOrder(p.orderId);
      if (o && o.status === 'UNLOADED') {
        o.status = 'COMPLETED';
        o.operatingCostMinor = p.operatingCostMinor;
        o.payableId = p.payableId;
        o.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'DispatchOrderCancelled') {
      const o = this.dispatchOrder(p.orderId);
      if (o && !['COMPLETED', 'CANCELLED'].includes(o.status)) {
        o.status = 'CANCELLED';
        o.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'OperationsCostPosted') {
      // Cost event — no state mutation needed, finance handles the posting

    } else if (event.eventType === 'YardSortingRecorded') {
      // If there was a queued sort job for this batch, mark it as completed
      const sj = this.state.sortJobs.find(x => x.batchId === p.batchId && x.status === 'QUEUED');
      if (sj) {
        sj.status = 'COMPLETED';
        sj.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'YardSortingConductRecorded') {
      // Tracks player conduct choices at the yard
      // Payload: { yardId, loadId, conductType: 'ETHICAL' | 'OPPORTUNISTIC', ... }
    } else if (event.eventType === 'SortJobQueued') {
      const sj = cp(p.job);
      sj.sourceEventIds = [event.eventId];
      this.state.sortJobs.push(sj);

    } else if (event.eventType === 'SortJobCompleted') {
      const sj = this.sortJob(p.jobId);
      if (sj && sj.status === 'QUEUED') {
        sj.status = 'COMPLETED';
        sj.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'SortJobFailed') {
      const sj = this.sortJob(p.jobId);
      if (sj && sj.status === 'QUEUED') {
        sj.status = 'FAILED';
        sj.sourceEventIds.push(event.eventId);
      }
    }

    this.state.appliedEventIds.push(event.eventId);
    if (this.invariantMode === 'FULL') this.assertInvariants();
  }

  assertInvariants() {
    if (new Set(this.state.appliedEventIds).size !== this.state.appliedEventIds.length)
      throw new Error('Duplicate operations event ID');

    const ids = new Set<string>();
    for (const x of [...this.state.yards, ...this.state.trucks, ...this.state.drivers,
                      ...this.state.employees, ...this.state.lanes, ...this.state.dispatchOrders]) {
      if (ids.has(x.id)) throw new Error('Duplicate operations ID: ' + x.id);
      ids.add(x.id);
    }

    for (const y of this.state.yards) {
      if (!Number.isSafeInteger(y.totalCapacityMilliM3) || y.totalCapacityMilliM3 <= 0)
        throw new Error('Invalid yard capacity');
      if (y.usedCapacityMilliM3 < 0 || y.usedCapacityMilliM3 > y.totalCapacityMilliM3)
        throw new Error('Yard capacity exceeded');
    }

    for (const t of this.state.trucks) {
      if (!Number.isSafeInteger(t.capacityMilliM3) || t.capacityMilliM3 <= 0)
        throw new Error('Invalid truck capacity');
    }

    for (const d of this.state.drivers) {
      if (d.assignedTruckId && !this.truck(d.assignedTruckId))
        throw new Error('Driver assigned to missing truck');
    }

    for (const l of this.state.lanes) {
      if (!this.truck(l.truckId) || !this.driver(l.driverId))
        throw new Error('Lane references missing truck or driver');
    }

    for (const o of this.state.dispatchOrders) {
      if (!this.truck(o.truckId) || !this.driver(o.driverId))
        throw new Error('Dispatch order references missing truck or driver');
      if (!Number.isSafeInteger(o.volumeMilliM3) || o.volumeMilliM3 <= 0)
        throw new Error('Invalid dispatch order volume');
    }
  }
}
