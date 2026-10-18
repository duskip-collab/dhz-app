// Incident & Operations types (Výjazdová činnosť a zásahy)
// K12 – mirrors 20261014_incidents_module.sql (K12.1)

export type IncidentType =
  | "FIRE"
  | "TECHNICAL"
  | "FLOOD"
  | "TRAFFIC_ACCIDENT"
  | "TACTICAL_EXERCISE"
  | "OTHER";

export type IncidentStatus = "REPORTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export type ResponderRole = "COMMANDER" | "DRIVER" | "FIREFIGHTER" | "SUPPORT";

// =============================================================================
// Row types (zrkadlia schému)
// =============================================================================

export interface Incident {
  id: string;
  incident_number: string | null;
  title: string;
  type: IncidentType;
  status: IncidentStatus;
  location: string;
  gps_coordinates: string | null;
  reported_at: string;
  dispatched_at: string | null;
  arrived_at: string | null;
  returned_at: string | null;
  description: string | null;
  command_notes: string | null;
  weather_conditions: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface IncidentResponder {
  id: string;
  incident_id: string;
  member_id: string;
  role: ResponderRole;
  notes: string | null;
  created_at: string;
}

export interface IncidentEquipment {
  id: string;
  incident_id: string;
  equipment_id: string;
  engine_hours_used: number | null;
  kilometers_driven: number | null;
  notes: string | null;
  created_at: string;
}

// =============================================================================
// Joined / detail types
// =============================================================================

export interface ResponderMember {
  id: string;
  first_name: string;
  last_name: string;
  member_number: string;
}

export interface ResponderWithMember extends IncidentResponder {
  member: ResponderMember | null;
}

export interface EquipmentItemRef {
  id: string;
  name: string;
  inventory_number: string | null;
}

export interface EquipmentWithItem extends IncidentEquipment {
  equipment: EquipmentItemRef | null;
}

export interface IncidentWithDetails extends Incident {
  responders: ResponderWithMember[];
  equipment: EquipmentWithItem[];
}

// =============================================================================
// Form / payload types
// =============================================================================

export interface ResponderInput {
  member_id: string;
  role: ResponderRole;
  notes?: string | null;
}

export interface EquipmentInput {
  equipment_id: string;
  engine_hours_used?: number | null;
  kilometers_driven?: number | null;
  notes?: string | null;
}

export interface CreateIncidentInput {
  incident_number?: string | null;
  title: string;
  type: IncidentType;
  status?: IncidentStatus;
  location: string;
  gps_coordinates?: string | null;
  reported_at?: string;
  dispatched_at?: string | null;
  arrived_at?: string | null;
  returned_at?: string | null;
  description?: string | null;
  command_notes?: string | null;
  weather_conditions?: string | null;
  responders?: ResponderInput[];
  equipment?: EquipmentInput[];
}

export interface UpdateIncidentInput {
  incident_number?: string | null;
  title?: string;
  type?: IncidentType;
  status?: IncidentStatus;
  location?: string;
  gps_coordinates?: string | null;
  reported_at?: string;
  dispatched_at?: string | null;
  arrived_at?: string | null;
  returned_at?: string | null;
  description?: string | null;
  command_notes?: string | null;
  weather_conditions?: string | null;
  responders?: ResponderInput[];
  equipment?: EquipmentInput[];
}

export interface ListIncidentsFilters {
  type?: IncidentType;
  status?: IncidentStatus;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

// Štatistiky pre dashboard / prehľad.
export interface IncidentStats {
  total: number;
  completedCount: number;
  totalEngineHours: number;
  totalKilometers: number;
  mostFrequentType: IncidentType | null;
  byType: Record<IncidentType, number>;
}
