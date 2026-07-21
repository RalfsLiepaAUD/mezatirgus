export interface Yard {
  id: string;
  companyId: string;
  locationId: string;
  displayName: string;
  totalCapacityMilliM3: number;
  usedCapacityMilliM3: number;
  storageCostMinorPerTickPerM3: number;
  sortingCostMinorPerM3: number;
  status: 'ACTIVE' | 'FULL' | 'INACTIVE';
  createdTimestamp: number;
  sourceEventIds: string[];
}

export interface OwnedTruck {
  id: string;
  companyId: string;
  displayName: string;
  capacityMilliM3: number;
  status: 'IDLE' | 'LOADING' | 'DISPATCHED' | 'IN_TRANSIT' | 'ARRIVED' | 'UNLOADING' | 'MAINTENANCE' | 'RETIRED';
  currentLocationId: string;
  assignedDriverId?: string;
  currentDispatchId?: string;
  maintenanceDueTimestamp?: number;
  createdTimestamp: number;
  sourceEventIds: string[];
}

export interface Driver {
  id: string;
  companyId: string;
  displayName: string;
  wageMinorPerHour: number;
  status: 'AVAILABLE' | 'ASSIGNED' | 'DRIVING' | 'OFF_DUTY' | 'UNAVAILABLE';
  assignedTruckId?: string;
  createdTimestamp: number;
  sourceEventIds: string[];
}

export interface Employee {
  id: string;
  companyId: string;
  displayName: string;
  role: 'YARD_WORKER' | 'FOREMAN' | 'ADMIN';
  wageMinorPerHour: number;
  status: 'AVAILABLE' | 'ASSIGNED' | 'OFF_DUTY' | 'UNAVAILABLE';
  assignedYardId?: string;
  createdTimestamp: number;
  sourceEventIds: string[];
}

export interface Lane {
  id: string;
  companyId: string;
  displayName: string;
  truckId: string;
  driverId: string;
  originLocationId: string;
  destinationLocationId: string;
  routeEdgeIds: string[];
  distanceMetres: number;
  travelSeconds: number;
  status: 'ACTIVE' | 'PAUSED' | 'RETIRED';
  cleanRepetitions: number;
  repetitionsUntilStable: number;
  isStable: boolean;
  totalTrips: number;
  totalVolumeMilliM3: number;
  createdTimestamp: number;
  sourceEventIds: string[];
}

export interface DispatchOrder {
  id: string;
  companyId: string;
  truckId: string;
  driverId: string;
  loadId: string;
  originLocationId: string;
  destinationLocationId: string;
  routeEdgeIds: string[];
  volumeMilliM3: number;
  distanceMetres: number;
  travelSeconds: number;
  status: 'PLANNED' | 'CONFIRMED' | 'IN_TRANSIT' | 'ARRIVED' | 'UNLOADED' | 'COMPLETED' | 'CANCELLED';
  confirmedTimestamp?: number;
  plannedArrivalTimestamp?: number;
  actualArrivalTimestamp?: number;
  operatingCostMinor?: number;
  payableId?: string;
  laneId?: string;
  cleanTrip: boolean;
  createdTimestamp: number;
  sourceEventIds: string[];
}

export interface OperationsSnapshot {
  appliedEventIds: string[];
  yards: Yard[];
  trucks: OwnedTruck[];
  drivers: Driver[];
  employees: Employee[];
  lanes: Lane[];
  dispatchOrders: DispatchOrder[];
}
