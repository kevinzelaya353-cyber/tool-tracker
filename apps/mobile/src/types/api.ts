import type { EventType, LocationType, Permission, Role, ToolStatus } from "@tt/shared";

export interface Page<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
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
}

export interface ToolDetail extends Tool {
  availableEvents: Exclude<EventType, "PURCHASE">[];
}

export interface PhotoRef {
  id: string;
  thumbKey?: string | null;
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
  vehicle?: { id: string; plate: string } | null;
  _count: { items: number; photos: number };
}

export interface TransferDetail extends Omit<TransferSummary, "_count"> {
  createdBy: Ref;
  items: { id: string; conditionNote?: string | null; tool: { id: string; code: string; brand: string; model?: string | null; category: { name: string } } }[];
  photos: PhotoRef[];
}

export interface UploadedPhoto {
  id: string;
  width: number;
  height: number;
  thumbUrl: string;
}
