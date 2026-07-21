import type { SimulationEngine } from '../core/engine.js';
import type { Yard, OwnedTruck, Driver, Employee, Lane, DispatchOrder } from './types.js';

export interface YardView {
  id: string;
  displayName: string;
  locationId: string;
  usedCapacityMilliM3: number;
  totalCapacityMilliM3: number;
  utilizationBasisPoints: number;
  status: string;
}

export interface TruckView {
  id: string;
  displayName: string;
  capacityMilliM3: number;
  status: string;
  currentLocationId: string;
  driverName: string | undefined;
}

export interface DriverView {
  id: string;
  displayName: string;
  wageMinorPerHour: number;
  status: string;
  assignedTruckDisplayName: string | undefined;
}

export interface EmployeeView {
  id: string;
  displayName: string;
  role: string;
  wageMinorPerHour: number;
  status: string;
}

export interface LaneView {
  id: string;
  displayName: string;
  status: string;
  cleanRepetitions: number;
  isStable: boolean;
  totalTrips: number;
  totalVolumeMilliM3: number;
  truckDisplayName: string | undefined;
  driverDisplayName: string | undefined;
}

export interface DispatchBoardView {
  planned: DispatchOrderView[];
  active: DispatchOrderView[];
  completed: DispatchOrderView[];
}

export interface DispatchOrderView {
  id: string;
  status: string;
  truckDisplayName: string | undefined;
  driverDisplayName: string | undefined;
  originLocationId: string;
  destinationLocationId: string;
  volumeMilliM3: number;
  confirmed: boolean;
  arrivalTimestamp: number | undefined;
  operatingCostMinor: number | undefined;
}

export function yardList(e: SimulationEngine): YardView[] {
  return e.operations.snapshot().yards.map(y => ({
    id: y.id,
    displayName: y.displayName,
    locationId: y.locationId,
    usedCapacityMilliM3: y.usedCapacityMilliM3,
    totalCapacityMilliM3: y.totalCapacityMilliM3,
    utilizationBasisPoints: y.totalCapacityMilliM3 > 0
      ? Math.floor(y.usedCapacityMilliM3 * 10_000 / y.totalCapacityMilliM3)
      : 0,
    status: y.status,
  }));
}

export function yardDetail(e: SimulationEngine, yardId: string): YardView | undefined {
  return yardList(e).find(x => x.id === yardId);
}

export function fleetList(e: SimulationEngine): TruckView[] {
  return e.operations.snapshot().trucks.map(t => {
    const driver = t.assignedDriverId
      ? e.operations.driver(t.assignedDriverId)
      : undefined;
    return {
      id: t.id,
      displayName: t.displayName,
      capacityMilliM3: t.capacityMilliM3,
      status: t.status,
      currentLocationId: t.currentLocationId,
      driverName: driver?.displayName,
    };
  });
}

export function driverList(e: SimulationEngine): DriverView[] {
  return e.operations.snapshot().drivers.map(d => {
    const truck = d.assignedTruckId
      ? e.operations.truck(d.assignedTruckId)
      : undefined;
    return {
      id: d.id,
      displayName: d.displayName,
      wageMinorPerHour: d.wageMinorPerHour,
      status: d.status,
      assignedTruckDisplayName: truck?.displayName,
    };
  });
}

export function employeeList(e: SimulationEngine): EmployeeView[] {
  return e.operations.snapshot().employees.map(emp => ({
    id: emp.id,
    displayName: emp.displayName,
    role: emp.role,
    wageMinorPerHour: emp.wageMinorPerHour,
    status: emp.status,
  }));
}

export function laneList(e: SimulationEngine): LaneView[] {
  return e.operations.snapshot().lanes.map(l => ({
    id: l.id,
    displayName: l.displayName,
    status: l.status,
    cleanRepetitions: l.cleanRepetitions,
    isStable: l.isStable,
    totalTrips: l.totalTrips,
    totalVolumeMilliM3: l.totalVolumeMilliM3,
    truckDisplayName: e.operations.truck(l.truckId)?.displayName,
    driverDisplayName: e.operations.driver(l.driverId)?.displayName,
  }));
}

export function dispatchBoard(e: SimulationEngine): DispatchBoardView {
  const all = e.operations.snapshot().dispatchOrders.map(o => dispatchOrderView(e, o));
  return {
    planned: all.filter(x => !x.confirmed && x.status !== 'COMPLETED' && x.status !== 'CANCELLED'),
    active: all.filter(x => x.confirmed && x.status !== 'COMPLETED' && x.status !== 'CANCELLED'),
    completed: all.filter(x => x.status === 'COMPLETED' || x.status === 'CANCELLED'),
  };
}

export function dispatchOrderView(e: SimulationEngine, idOrOrder: string | DispatchOrder): DispatchOrderView {
  const o = typeof idOrOrder === 'string' ? e.operations.dispatchOrder(idOrOrder)! : idOrOrder;
  const truck = o ? e.operations.truck(o.truckId) : undefined;
  const driver = o ? e.operations.driver(o.driverId) : undefined;
  return {
    id: o.id,
    status: o.status,
    truckDisplayName: truck?.displayName,
    driverDisplayName: driver?.displayName,
    originLocationId: o.originLocationId,
    destinationLocationId: o.destinationLocationId,
    volumeMilliM3: o.volumeMilliM3,
    confirmed: o.status !== 'PLANNED',
    arrivalTimestamp: o.plannedArrivalTimestamp,
    operatingCostMinor: o.operatingCostMinor,
  };
}

export function operationsSummary(e: SimulationEngine): string[] {
  const lines: string[] = [];
  const yards = yardList(e);
  const trucks = fleetList(e);
  const drivers = driverList(e);
  const employees = employeeList(e);
  const lanes = laneList(e);
  const board = dispatchBoard(e);

  if (yards.length) {
    lines.push(`Yards: ${yards.length}`);
    for (const y of yards)
      lines.push(`  ${y.displayName}: ${Math.floor(y.usedCapacityMilliM3 / 1000)}/${Math.floor(y.totalCapacityMilliM3 / 1000)} m³ (${y.status})`);
  }
  if (trucks.length) {
    lines.push(`Fleet: ${trucks.length} truck(s)`);
    for (const t of trucks)
      lines.push(`  ${t.displayName}: ${t.status} at ${t.currentLocationId} driver=${t.driverName ?? 'none'}`);
  }
  if (drivers.length) {
    lines.push(`Drivers: ${drivers.length}`);
    for (const d of drivers)
      lines.push(`  ${d.displayName}: ${d.status} @ ${d.wageMinorPerHour}¢/h`);
  }
  if (employees.length) {
    lines.push(`Employees: ${employees.length}`);
    for (const e of employees)
      lines.push(`  ${e.displayName}: ${e.role} ${e.status} @ ${e.wageMinorPerHour}¢/h`);
  }
  if (lanes.length) {
    lines.push(`Lanes: ${lanes.length}`);
    for (const l of lanes)
      lines.push(`  ${l.displayName}: ${l.status} trips=${l.totalTrips} stable=${l.isStable}`);
  }
  if (board.planned.length || board.active.length || board.completed.length) {
    lines.push(`Dispatch: ${board.planned.length} planned, ${board.active.length} active, ${board.completed.length} completed`);
  }
  return lines;
}
