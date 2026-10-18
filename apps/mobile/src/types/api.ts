import type {
  EventType,
  ItemOutcome,
  LocationType,
  Permission,
  PhotoStage,
  ReceptionMethod,
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
