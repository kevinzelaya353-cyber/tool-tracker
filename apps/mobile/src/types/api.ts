import type {
  DamageKind,
  EventType,
  ToolCondition,
  ToolOwnership,
  ItemOutcome,
  LocationType,
  Permission,
  PhotoStage,
  ReceptionMethod,
  RentalStatus,
  Role,
  ToolStatus,
  TransferStatus,
} from "@tt/shared";

export interface Page<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SessionUser {
  id: string;
  name: string;
  username: string | null;
  email: string | null;
  role: Role;
  permissions: Permission[];
}

export interface Ref {
  id: string;
  name: string;
}

export interface Location extends Ref {
  type: LocationType;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  active: boolean;
  _count?: { tools: number };
}

export interface Vehicle {
  id: string;
  plate: string;
  description?: string | null;
  active: boolean;
}

export interface Category extends Ref {
  _count?: { tools: number };
}

export interface UserLite extends Ref {
  role: Role;
  /** Vehículo que se preselecciona cuando esta persona lleva un traslado. */
  defaultVehicleId?: string | null;
}

/** Lo que ve quien gestiona usuarios. Sin usuario ni correo = persona sin acceso a la app. */
export interface ManagedUser extends UserLite {
  defaultVehicleId: string | null;
  username: string | null;
  email: string | null;
  active: boolean;
  lockedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Tool {
  id: string;
  code: string;
  brand: string;
  model?: string | null;
  serial?: string | null;
  purchasePrice: string; // Decimal serializado
  purchaseDate: string;
  supplier?: string | null;
  status: ToolStatus;
  /** Ausente en APIs anteriores a los alquileres: se trata como propia. */
  ownership?: ToolOwnership;
  statusChangedAt: string;
  category: Ref;
  currentLocation?: (Ref & { type: LocationType }) | null;
  currentCustodian?: Ref | null;
  coverPhotoId?: string | null;
}

export interface ToolDetail extends Tool {
  availableEvents: Exclude<EventType, "PURCHASE">[];
}

export interface PhotoRef {
  id: string;
  thumbKey?: string | null;
  /** Solo en fotos de traslado. */
  stage?: PhotoStage | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface MapPlace extends Ref {
  type: LocationType;
  latitude?: number | null;
  longitude?: number | null;
}

export interface HistoryEvent {
  id: string;
  type: EventType;
  fromStatus: ToolStatus | null;
  toStatus: ToolStatus;
  occurredAt: string;
  cost?: string | null;
  description?: string | null;
  reportedBy: Ref;
  location?: (Ref & { type: LocationType }) | null;
  photos: PhotoRef[];
  /** Evento creado por un reporte de daño: sus fotos están en el reporte. */
  damageReport?: { id: string; kind: DamageKind; photos: PhotoRef[] } | null;
  transfer?: {
    id: string;
    movedAt: string;
    fromLocation: Ref;
    toLocation: Ref;
    deliveredBy: Ref;
    receivedBy: Ref;
    driver?: Ref | null;
    vehicle?: { id: string; plate: string } | null;
    photos: PhotoRef[];
  } | null;
}

export interface TransferSummary {
  id: string;
  movedAt: string;
  notes?: string | null;
  fromLocation: Ref;
  toLocation: Ref;
  deliveredBy: Ref;
  receivedBy: Ref;
  /** Con chofer: va en tránsito hasta que se confirma la recepción. */
  driver?: Ref | null;
  status: TransferStatus;
  receivedAt?: string | null;
  vehicle?: { id: string; plate: string } | null;
  _count: { items: number; photos: number };
}

export interface TransferDetail extends Omit<TransferSummary, "_count" | "fromLocation" | "toLocation"> {
  fromLocation: MapPlace;
  toLocation: MapPlace;
  routeGeometry?: [number, number][] | null;
  routeDistanceM?: number | null;
  routeDurationS?: number | null;
  createdBy: Ref;
  receptionBy?: Ref | null;
  receptionMethod?: ReceptionMethod | null;
  receptionNotes?: string | null;
  items: {
    id: string;
    conditionNote?: string | null;
    outcome?: ItemOutcome | null;
    receptionNote?: string | null;
    tool: { id: string; code: string; brand: string; model?: string | null; category: { name: string } };
  }[];
  photos: PhotoRef[];
  /** A cuántos metros del origen/destino se tomó la foto más cercana de entrega/recepción. */
  photoDistances?: { deliveryM: number | null; receptionM: number | null };
}

export interface UploadedPhoto {
  id: string;
  width: number;
  height: number;
  thumbUrl: string;
}

export interface DamageReport {
  id: string;
  toolId: string;
  kind: DamageKind;
  condition: ToolCondition;
  /** Estado de la herramienta cuando se reportó. */
  toolStatus: ToolStatus;
  description: string;
  notes?: string | null;
  occurredAt: string;
  createdAt: string;
  reportedBy: Ref;
  /** Incidencia de un período de alquiler. */
  rental?: { id: string; lessor: string; status: RentalStatus } | null;
  /** Si el reporte pasó la herramienta a DANADA. */
  lifecycleEvent?: { id: string; fromStatus: ToolStatus | null; toStatus: ToolStatus } | null;
  photos: { id: string }[];
}

export interface RentalSummary {
  id: string;
  lessor: string;
  status: RentalStatus;
  receivedAt: string;
  expectedReturnAt?: string | null;
  returnedAt?: string | null;
  tool: { id: string; code: string; brand: string; model?: string | null; status: ToolStatus; category: Ref };
  location: Ref & { type: LocationType };
}

export interface RentalDetail extends RentalSummary {
  notes?: string | null;
  receptionCondition: ToolCondition;
  receptionDescription?: string | null;
  receptionNotes?: string | null;
  receivedBy: Ref;
  returnCondition?: ToolCondition | null;
  returnDescription?: string | null;
  returnNotes?: string | null;
  returnDifferences?: string | null;
  returnedBy?: Ref | null;
  photos: { id: string; stage: PhotoStage; createdAt: string }[];
  incidents: DamageReport[];
  /** Otros movimientos de la herramienta durante el período (traslados, mantenimiento…). */
  events: {
    id: string;
    type: EventType;
    occurredAt: string;
    toStatus: ToolStatus;
    description?: string | null;
    reportedBy: Ref;
    transfer?: { id: string; fromLocation: { name: string }; toLocation: { name: string } } | null;
  }[];
}
