export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Relationship<
  ForeignKeyName extends string,
  ColumnName extends string,
  ReferencedRelation extends string,
  ReferencedColumn extends string,
> = {
  foreignKeyName: ForeignKeyName;
  columns: [ColumnName];
  isOneToOne: false;
  referencedRelation: ReferencedRelation;
  referencedColumns: [ReferencedColumn];
};

// POZNÁMKA: generovaný klient (createServerClient<Database>) číta schému
// VÝHRADNE z tohto súboru. Ručná zmena je prípustná len do najbližšej
// regenerácie cez `npm run supabase:types`, ktorá ju prepíše podľa live DB.
type Table<Row, Insert, Update, Relationships extends unknown[] = []> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: Relationships;
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<
        {
          id: string;
          email: string | null;
          full_name: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id: string;
          email?: string | null;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          email?: string | null;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      roles: Table<
        { id: string; code: string; name: string; description: string | null },
        { id?: string; code: string; name: string; description?: string | null },
        { id?: string; code?: string; name?: string; description?: string | null }
      >;
      permissions: Table<
        { id: string; code: string; name: string; description: string | null },
        { id?: string; code: string; name: string; description?: string | null },
        { id?: string; code?: string; name?: string; description?: string | null }
      >;
      role_permissions: Table<
        { role_id: string; permission_id: string },
        { role_id: string; permission_id: string },
        { role_id?: string; permission_id?: string },
        [
          Relationship<"role_permissions_role_id_fkey", "role_id", "roles", "id">,
          Relationship<"role_permissions_permission_id_fkey", "permission_id", "permissions", "id">,
        ]
      >;
      user_roles: Table<
        { user_id: string; role_id: string },
        { user_id: string; role_id: string },
        { user_id?: string; role_id?: string },
        [Relationship<"user_roles_role_id_fkey", "role_id", "roles", "id">]
      >;
      user_permissions: Table<
        { user_id: string; permission_id: string },
        { user_id: string; permission_id: string },
        { user_id?: string; permission_id?: string },
        [Relationship<"user_permissions_permission_id_fkey", "permission_id", "permissions", "id">]
      >;
      audit_log: Table<
        {
          id: string;
          user_id: string | null;
          action: string;
          module: string;
          entity_id: string | null;
          old_data: Json | null;
          new_data: Json | null;
          created_at: string;
        },
        {
          id?: string;
          user_id?: string | null;
          action: string;
          module: string;
          entity_id?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
          created_at?: string;
        },
        {
          id?: string;
          user_id?: string | null;
          action?: string;
          module?: string;
          entity_id?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
          created_at?: string;
        }
      >;
      members: Table<
        {
          id: string;
          auth_user_id: string | null;
          member_number: string;
          first_name: string;
          last_name: string;
          title: string | null;
          phone: string | null;
          email: string | null;
          birth_date: string | null;
          address: string | null;
          membership_type: "adult" | "youth" | "preparatory" | "dorast";
          status: "active" | "inactive";
          joined_at: string;
          left_at: string | null;
          notes: string | null;
          photo_path: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        },
        {
          id?: string;
          auth_user_id?: string | null;
          member_number?: string;
          first_name?: string;
          last_name?: string;
          title?: string | null;
          phone?: string | null;
          email?: string | null;
          birth_date?: string | null;
          address?: string | null;
          membership_type?: "adult" | "youth" | "preparatory" | "dorast";
          status?: "active" | "inactive";
          joined_at?: string;
          left_at?: string | null;
          notes?: string | null;
          photo_path?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        },
        {
          id?: string;
          auth_user_id?: string | null;
          member_number?: string;
          first_name?: string;
          last_name?: string;
          title?: string | null;
          phone?: string | null;
          email?: string | null;
          birth_date?: string | null;
          address?: string | null;
          membership_type?: "adult" | "youth" | "preparatory" | "dorast";
          status?: "active" | "inactive";
          joined_at?: string;
          left_at?: string | null;
          notes?: string | null;
          photo_path?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        }
      >;
      member_guardians: Table<
        {
          id: string;
          member_id: string;
          user_id: string | null;
          relationship: string;
          guardian_full_name: string;
          is_primary_contact: boolean;
          phone: string | null;
          email: string | null;
          created_at: string;
          created_by: string | null;
        },
        {
          id?: string;
          member_id?: string;
          user_id?: string | null;
          relationship?: string;
          guardian_full_name?: string;
          is_primary_contact?: boolean;
          phone?: string | null;
          email?: string | null;
          created_at?: string;
          created_by?: string | null;
        },
        {
          id?: string;
          member_id?: string;
          user_id?: string | null;
          relationship?: string;
          guardian_full_name?: string;
          is_primary_contact?: boolean;
          phone?: string | null;
          email?: string | null;
          created_at?: string;
          created_by?: string | null;
        }
      >;
      trainings: Table<
        {
          id: string;
          title: string;
          description: string | null;
          target_group: "ALL" | "ADULT" | "YOUTH" | "PREPARATORY" | "DORAST";
          start_time: string;
          end_time: string;
          location: string | null;
          trainer_id: string | null;
          status: "PLANNED" | "COMPLETED" | "CANCELLED";
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        },
        {
          id?: string;
          title?: string;
          description?: string | null;
          target_group?: "ALL" | "ADULT" | "YOUTH" | "PREPARATORY" | "DORAST";
          start_time?: string;
          end_time?: string;
          location?: string | null;
          trainer_id?: string | null;
          status?: "PLANNED" | "COMPLETED" | "CANCELLED";
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        },
        {
          id?: string;
          title?: string;
          description?: string | null;
          target_group?: "ALL" | "ADULT" | "YOUTH" | "PREPARATORY" | "DORAST";
          start_time?: string;
          end_time?: string;
          location?: string | null;
          trainer_id?: string | null;
          status?: "PLANNED" | "COMPLETED" | "CANCELLED";
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        },
        [Relationship<"trainings_trainer_id_fkey", "trainer_id", "members", "id">]
      >;
      training_attendance: Table<
        {
          id: string;
          training_id: string;
          member_id: string;
          status: "PRESENT" | "ABSENT" | "EXCUSED" | "LATE";
          note: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        },
        {
          id?: string;
          training_id?: string;
          member_id?: string;
          status?: "PRESENT" | "ABSENT" | "EXCUSED" | "LATE";
          note?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        },
        {
          id?: string;
          training_id?: string;
          member_id?: string;
          status?: "PRESENT" | "ABSENT" | "EXCUSED" | "LATE";
          note?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        },
        [
          Relationship<"training_attendance_training_id_fkey", "training_id", "trainings", "id">,
          Relationship<"training_attendance_member_id_fkey", "member_id", "members", "id">,
        ]
      >;
      competitions: Table<
        {
          id: string;
          title: string;
          location: string | null;
          date: string;
          end_time: string | null;
          league: string | null;
          category:
            | "MEN"
            | "WOMEN"
            | "DORAST_BOYS"
            | "DORAST_GIRLS"
            | "PLAMEN_BOYS"
            | "PLAMEN_GIRLS"
            | "MIX";
          description: string | null;
          organizer: string | null;
          status: "PLANNED" | "COMPLETED" | "CANCELLED";
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        },
        {
          id?: string;
          title?: string;
          location?: string | null;
          date?: string;
          end_time?: string | null;
          league?: string | null;
          category?:
            | "MEN"
            | "WOMEN"
            | "DORAST_BOYS"
            | "DORAST_GIRLS"
            | "PLAMEN_BOYS"
            | "PLAMEN_GIRLS"
            | "MIX";
          description?: string | null;
          organizer?: string | null;
          status?: "PLANNED" | "COMPLETED" | "CANCELLED";
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        },
        {
          id?: string;
          title?: string;
          location?: string | null;
          date?: string;
          end_time?: string | null;
          league?: string | null;
          category?:
            | "MEN"
            | "WOMEN"
            | "DORAST_BOYS"
            | "DORAST_GIRLS"
            | "PLAMEN_BOYS"
            | "PLAMEN_GIRLS"
            | "MIX";
          description?: string | null;
          organizer?: string | null;
          status?: "PLANNED" | "COMPLETED" | "CANCELLED";
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        }
      >;
      competition_teams: Table<
        {
          id: string;
          competition_id: string;
          name: string;
          result_time: number | null;
          result_points: number | null;
          rank: number | null;
          note: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        },
        {
          id?: string;
          competition_id?: string;
          name?: string;
          result_time?: number | null;
          result_points?: number | null;
          rank?: number | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        },
        {
          id?: string;
          competition_id?: string;
          name?: string;
          result_time?: number | null;
          result_points?: number | null;
          rank?: number | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        },
        [
          Relationship<"competition_teams_competition_id_fkey", "competition_id", "competitions", "id">,
        ]
      >;
      competition_lineups: Table<
        {
          id: string;
          team_id: string;
          member_id: string;
          position: string;
          created_at: string;
        },
        {
          id?: string;
          team_id?: string;
          member_id?: string;
          position?: string;
          created_at?: string;
        },
        {
          id?: string;
          team_id?: string;
          member_id?: string;
          position?: string;
          created_at?: string;
        },
        [
          Relationship<"competition_lineups_team_id_fkey", "team_id", "competition_teams", "id">,
          Relationship<"competition_lineups_member_id_fkey", "member_id", "members", "id">,
        ]
      >;
      equipment_categories: Table<
        {
          id: string;
          name: string;
          code: string;
          description: string | null;
          requires_inspection: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          name?: string;
          code?: string;
          description?: string | null;
          requires_inspection?: boolean;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          name?: string;
          code?: string;
          description?: string | null;
          requires_inspection?: boolean;
          created_at?: string;
          updated_at?: string;
        }
      >;
      equipment_items: Table<
        {
          id: string;
          category_id: string;
          name: string;
          inventory_number: string | null;
          serial_number: string | null;
          status: "AVAILABLE" | "IN_SERVICE" | "RESERVED" | "DAMAGED" | "DISPOSED";
          condition: "NEW" | "GOOD" | "FAIR" | "POOR" | "UNSERVICEABLE";
          location: string | null;
          purchase_date: string | null;
          purchase_price: number | null;
          next_inspection_date: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          category_id?: string;
          name?: string;
          inventory_number?: string | null;
          serial_number?: string | null;
          status?: "AVAILABLE" | "IN_SERVICE" | "RESERVED" | "DAMAGED" | "DISPOSED";
          condition?: "NEW" | "GOOD" | "FAIR" | "POOR" | "UNSERVICEABLE";
          location?: string | null;
          purchase_date?: string | null;
          purchase_price?: number | null;
          next_inspection_date?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          category_id?: string;
          name?: string;
          inventory_number?: string | null;
          serial_number?: string | null;
          status?: "AVAILABLE" | "IN_SERVICE" | "RESERVED" | "DAMAGED" | "DISPOSED";
          condition?: "NEW" | "GOOD" | "FAIR" | "POOR" | "UNSERVICEABLE";
          location?: string | null;
          purchase_date?: string | null;
          purchase_price?: number | null;
          next_inspection_date?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        [
          Relationship<"equipment_items_category_id_fkey", "category_id", "equipment_categories", "id">,
        ]
      >;
      vehicle_details: Table<
        {
          id: string;
          license_plate: string | null;
          vin: string | null;
          fuel_type: string | null;
          mileage_km: number;
          engine_hours: number;
          stk_valid_until: string | null;
          ek_valid_until: string | null;
        },
        {
          id?: string;
          license_plate?: string | null;
          vin?: string | null;
          fuel_type?: string | null;
          mileage_km?: number;
          engine_hours?: number;
          stk_valid_until?: string | null;
          ek_valid_until?: string | null;
        },
        {
          id?: string;
          license_plate?: string | null;
          vin?: string | null;
          fuel_type?: string | null;
          mileage_km?: number;
          engine_hours?: number;
          stk_valid_until?: string | null;
          ek_valid_until?: string | null;
        },
        [Relationship<"vehicle_details_id_fkey", "id", "equipment_items", "id">]
      >;
      equipment_assignments: Table<
        {
          id: string;
          equipment_id: string;
          member_id: string;
          assigned_at: string;
          returned_at: string | null;
          assigned_by: string | null;
          condition_on_assign: "NEW" | "GOOD" | "FAIR" | "POOR" | "UNSERVICEABLE" | null;
          condition_on_return: "NEW" | "GOOD" | "FAIR" | "POOR" | "UNSERVICEABLE" | null;
          notes: string | null;
          created_at: string;
        },
        {
          id?: string;
          equipment_id?: string;
          member_id?: string;
          assigned_at?: string;
          returned_at?: string | null;
          assigned_by?: string | null;
          condition_on_assign?: "NEW" | "GOOD" | "FAIR" | "POOR" | "UNSERVICEABLE" | null;
          condition_on_return?: "NEW" | "GOOD" | "FAIR" | "POOR" | "UNSERVICEABLE" | null;
          notes?: string | null;
          created_at?: string;
        },
        {
          id?: string;
          equipment_id?: string;
          member_id?: string;
          assigned_at?: string;
          returned_at?: string | null;
          assigned_by?: string | null;
          condition_on_assign?: "NEW" | "GOOD" | "FAIR" | "POOR" | "UNSERVICEABLE" | null;
          condition_on_return?: "NEW" | "GOOD" | "FAIR" | "POOR" | "UNSERVICEABLE" | null;
          notes?: string | null;
          created_at?: string;
        },
        [
          Relationship<"equipment_assignments_equipment_id_fkey", "equipment_id", "equipment_items", "id">,
          Relationship<"equipment_assignments_member_id_fkey", "member_id", "members", "id">,
        ]
      >;
      equipment_maintenance_logs: Table<
        {
          id: string;
          equipment_id: string;
          type: "STK_EK" | "REVISION" | "SERVICE_CHECK" | "REPAIR" | "INSPECTION";
          title: string;
          description: string | null;
          performed_at: string;
          next_due_date: string | null;
          cost: number;
          performed_by: string | null;
          status: string;
          created_by: string | null;
          created_at: string;
        },
        {
          id?: string;
          equipment_id?: string;
          type?: "STK_EK" | "REVISION" | "SERVICE_CHECK" | "REPAIR" | "INSPECTION";
          title?: string;
          description?: string | null;
          performed_at?: string;
          next_due_date?: string | null;
          cost?: number;
          performed_by?: string | null;
          status?: string;
          created_by?: string | null;
          created_at?: string;
        },
        {
          id?: string;
          equipment_id?: string;
          type?: "STK_EK" | "REVISION" | "SERVICE_CHECK" | "REPAIR" | "INSPECTION";
          title?: string;
          description?: string | null;
          performed_at?: string;
          next_due_date?: string | null;
          cost?: number;
          performed_by?: string | null;
          status?: string;
          created_by?: string | null;
          created_at?: string;
        },
        [
          Relationship<"equipment_maintenance_logs_equipment_id_fkey", "equipment_id", "equipment_items", "id">,
        ]
      >;
      incidents: Table<
        {
          id: string;
          incident_number: string | null;
          title: string;
          type: "FIRE" | "TECHNICAL" | "FLOOD" | "TRAFFIC_ACCIDENT" | "TACTICAL_EXERCISE" | "OTHER";
          status: "REPORTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
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
        },
        {
          id?: string;
          incident_number?: string | null;
          title?: string;
          type?: "FIRE" | "TECHNICAL" | "FLOOD" | "TRAFFIC_ACCIDENT" | "TACTICAL_EXERCISE" | "OTHER";
          status?: "REPORTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
          location?: string;
          gps_coordinates?: string | null;
          reported_at?: string;
          dispatched_at?: string | null;
          arrived_at?: string | null;
          returned_at?: string | null;
          description?: string | null;
          command_notes?: string | null;
          weather_conditions?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        },
        {
          id?: string;
          incident_number?: string | null;
          title?: string;
          type?: "FIRE" | "TECHNICAL" | "FLOOD" | "TRAFFIC_ACCIDENT" | "TACTICAL_EXERCISE" | "OTHER";
          status?: "REPORTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
          location?: string;
          gps_coordinates?: string | null;
          reported_at?: string;
          dispatched_at?: string | null;
          arrived_at?: string | null;
          returned_at?: string | null;
          description?: string | null;
          command_notes?: string | null;
          weather_conditions?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        }
      >;
      incident_responders: Table<
        {
          id: string;
          incident_id: string;
          member_id: string;
          role: "COMMANDER" | "DRIVER" | "FIREFIGHTER" | "SUPPORT";
          notes: string | null;
          created_at: string;
        },
        {
          id?: string;
          incident_id?: string;
          member_id?: string;
          role?: "COMMANDER" | "DRIVER" | "FIREFIGHTER" | "SUPPORT";
          notes?: string | null;
          created_at?: string;
        },
        {
          id?: string;
          incident_id?: string;
          member_id?: string;
          role?: "COMMANDER" | "DRIVER" | "FIREFIGHTER" | "SUPPORT";
          notes?: string | null;
          created_at?: string;
        },
        [
          Relationship<"incident_responders_incident_id_fkey", "incident_id", "incidents", "id">,
          Relationship<"incident_responders_member_id_fkey", "member_id", "members", "id">,
        ]
      >;
      incident_equipment: Table<
        {
          id: string;
          incident_id: string;
          equipment_id: string;
          engine_hours_used: number | null;
          kilometers_driven: number | null;
          notes: string | null;
          created_at: string;
        },
        {
          id?: string;
          incident_id?: string;
          equipment_id?: string;
          engine_hours_used?: number | null;
          kilometers_driven?: number | null;
          notes?: string | null;
          created_at?: string;
        },
        {
          id?: string;
          incident_id?: string;
          equipment_id?: string;
          engine_hours_used?: number | null;
          kilometers_driven?: number | null;
          notes?: string | null;
          created_at?: string;
        },
        [
          Relationship<"incident_equipment_incident_id_fkey", "incident_id", "incidents", "id">,
          Relationship<"incident_equipment_equipment_id_fkey", "equipment_id", "equipment_items", "id">,
        ]
      >;
      finance_accounts: Table<
        {
          id: string;
          name: string;
          type: "CASH" | "BANK" | "OTHER";
          currency: string;
          opening_balance_minor: number;
          opening_balance_date: string;
          is_active: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        },
        {
          id?: string;
          name?: string;
          type?: "CASH" | "BANK" | "OTHER";
          currency?: string;
          opening_balance_minor?: number;
          opening_balance_date?: string;
          is_active?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        },
        {
          id?: string;
          name?: string;
          type?: "CASH" | "BANK" | "OTHER";
          currency?: string;
          opening_balance_minor?: number;
          opening_balance_date?: string;
          is_active?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        }
      >;
      finance_categories: Table<
        {
          id: string;
          name: string;
          code: string;
          direction: "INCOME" | "EXPENSE";
          description: string | null;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        },
        {
          id?: string;
          name?: string;
          code?: string;
          direction?: "INCOME" | "EXPENSE";
          description?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        },
        {
          id?: string;
          name?: string;
          code?: string;
          direction?: "INCOME" | "EXPENSE";
          description?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        }
      >;

      finance_transactions: Table<
        {
          id: string;
          account_id: string;
          category_id: string | null;
          type: "INCOME" | "EXPENSE" | "TRANSFER_IN" | "TRANSFER_OUT";
          status: "DRAFT" | "POSTED" | "VOID";
          amount_minor: number;
          transaction_date: string;
          document_number: string | null;
          counterparty: string | null;
          description: string | null;
          member_id: string | null;
          transfer_group_id: string | null;
          posted_at: string | null;
          posted_by: string | null;
          void_reason: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        },
        {
          id?: string;
          account_id?: string;
          category_id?: string | null;
          type?: "INCOME" | "EXPENSE" | "TRANSFER_IN" | "TRANSFER_OUT";
          status?: "DRAFT" | "POSTED" | "VOID";
          amount_minor?: number;
          transaction_date?: string;
          document_number?: string | null;
          counterparty?: string | null;
          description?: string | null;
          member_id?: string | null;
          transfer_group_id?: string | null;
          posted_at?: string | null;
          posted_by?: string | null;
          void_reason?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        },
        {
          id?: string;
          account_id?: string;
          category_id?: string | null;
          type?: "INCOME" | "EXPENSE" | "TRANSFER_IN" | "TRANSFER_OUT";
          status?: "DRAFT" | "POSTED" | "VOID";
          amount_minor?: number;
          transaction_date?: string;
          document_number?: string | null;
          counterparty?: string | null;
          description?: string | null;
          member_id?: string | null;
          transfer_group_id?: string | null;
          posted_at?: string | null;
          posted_by?: string | null;
          void_reason?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        },
        [
          Relationship<"finance_transactions_account_id_fkey", "account_id", "finance_accounts", "id">,
          Relationship<"finance_transactions_category_id_fkey", "category_id", "finance_categories", "id">,
          Relationship<"finance_transactions_member_id_fkey", "member_id", "members", "id">,
        ]
      >;
      finance_plans: Table<
        {
          id: string;
          name: string;
          plan_type: string;
          direction: "INCOME" | "EXPENSE";
          amount_minor: number;
          planned_date: string;
          description: string | null;
          status: "PLANNED" | "APPROVED" | "COMPLETED" | "CANCELLED";
          transaction_id: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        },
        {
          id?: string;
          name?: string;
          plan_type?: string;
          direction?: "INCOME" | "EXPENSE";
          amount_minor?: number;
          planned_date?: string;
          description?: string | null;
          status?: "PLANNED" | "APPROVED" | "COMPLETED" | "CANCELLED";
          transaction_id?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        },
        {
          id?: string;
          name?: string;
          plan_type?: string;
          direction?: "INCOME" | "EXPENSE";
          amount_minor?: number;
          planned_date?: string;
          description?: string | null;
          status?: "PLANNED" | "APPROVED" | "COMPLETED" | "CANCELLED";
          transaction_id?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        },
        [
          Relationship<"finance_plans_transaction_id_fkey", "transaction_id", "finance_transactions", "id">,
        ]
      >;
      finance_transaction_attachments: Table<
        {
          id: string;
          transaction_id: string;
          storage_path: string;
          file_name: string;
          mime_type: string | null;
          file_size_bytes: number | null;
          uploaded_at: string;
          uploaded_by: string | null;
        },
        {
          id?: string;
          transaction_id?: string;
          storage_path?: string;
          file_name?: string;
          mime_type?: string | null;
          file_size_bytes?: number | null;
          uploaded_at?: string;
          uploaded_by?: string | null;
        },
        {
          id?: string;
          transaction_id?: string;
          storage_path?: string;
          file_name?: string;
          mime_type?: string | null;
          file_size_bytes?: number | null;
          uploaded_at?: string;
          uploaded_by?: string | null;
        },
        [
          Relationship<"finance_transaction_attachments_transaction_id_fkey", "transaction_id", "finance_transactions", "id">,
        ]
      >;

    };
    Views: {
      finance_account_balances: {
        Row: {
          account_id: string;
          account_name: string;
          currency: string;
          opening_balance_minor: number;
          posted_movement_minor: number;
          current_balance_minor: number;
        };
      };
    };
    Functions: {
      has_permission: {
        // Skutočná signatúra v DB (20261006:321): (p_user_id uuid, p_permission_code text)
        Args: { p_user_id: string; p_permission_code: string };
        Returns: boolean;
      };
      has_role: {
        // Skutočná signatúra v DB (20261006:305): (p_user_id uuid, p_role_code text)
        Args: { p_user_id: string; p_role_code: string };
        Returns: boolean;
      };
      set_updated_at: {
        Args: Record<string, never>;
        Returns: "trigger";
      };
      audit_member_changes: {
        Args: Record<string, never>;
        Returns: "trigger";
      };
      audit_training_changes: {
        Args: Record<string, never>;
        Returns: "trigger";
      };
      audit_competition_changes: {
        Args: Record<string, never>;
        Returns: "trigger";
      };
      save_team_with_lineup: {
        Args: {
          p_team_id: string | null;
          p_competition_id: string;
          p_name: string;
          p_result_time: number | null;
          p_result_points: number | null;
          p_rank: number | null;
          p_note: string | null;
          p_lineup: Json | null;
        };
        Returns: string;
      };
      audit_equipment_changes: {
      calendar_events: Table<
        {
          id: string;
          title: string;
          description: string | null;
          event_type: string;
          start_at: string;
          end_at: string;
          all_day: boolean;
          location: string | null;
          is_recurring: boolean;
          recurrence_rule: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        },
        {
          id?: string;
          title: string;
          description?: string | null;
          event_type?: string;
          start_at: string;
          end_at: string;
          all_day?: boolean;
          location?: string | null;
          is_recurring?: boolean;
          recurrence_rule?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        },
        {
          id?: string;
          title?: string;
          description?: string | null;
          event_type?: string;
          start_at?: string;
          end_at?: string;
          all_day?: boolean;
          location?: string | null;
          is_recurring?: boolean;
          recurrence_rule?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        }
      >;
      announcements: Table<
        {
          id: string;
          title: string;
          content: string;
          priority: string;
          published_at: string;
          expires_at: string | null;
          target_roles: string[] | null;
          is_pinned: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        },
        {
          id?: string;
          title: string;
          content: string;
          priority?: string;
          published_at?: string;
          expires_at?: string | null;
          target_roles?: string[] | null;
          is_pinned?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        },
        {
          id?: string;
          title?: string;
          content?: string;
          priority?: string;
          published_at?: string;
          expires_at?: string | null;
          target_roles?: string[] | null;
          is_pinned?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        }
      >;
      meetings: Table<
        {
          id: string;
          title: string;
          description: string | null;
          meeting_type: string;
          scheduled_at: string;
          duration_minutes: number;
          location: string | null;
          agenda: string | null;
          minutes: string | null;
          is_remote: boolean;
          remote_link: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        },
        {
          id?: string;
          title: string;
          description?: string | null;
          meeting_type?: string;
          scheduled_at: string;
          duration_minutes?: number;
          location?: string | null;
          agenda?: string | null;
          minutes?: string | null;
          is_remote?: boolean;
          remote_link?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        },
        {
          id?: string;
          title?: string;
          description?: string | null;
          meeting_type?: string;
          scheduled_at?: string;
          duration_minutes?: number;
          location?: string | null;
          agenda?: string | null;
          minutes?: string | null;
          is_remote?: boolean;
          remote_link?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        }
      >;
      work_parties: Table<
        {
          id: string;
          title: string;
          description: string | null;
          work_date: string;
          duration_hours: number;
          location: string | null;
          status: string;
          max_volunteers: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        },
        {
          id?: string;
          title: string;
          description?: string | null;
          work_date: string;
          duration_hours?: number;
          location?: string | null;
          status?: string;
          max_volunteers?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        },
        {
          id?: string;
          title?: string;
          description?: string | null;
          work_date?: string;
          duration_hours?: number;
          location?: string | null;
          status?: string;
          max_volunteers?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        }
      >;
        Args: Record<string, never>;
        Returns: "trigger";
      };
      audit_incident_changes: {
        Args: Record<string, never>;
        Returns: "trigger";
      };
      finance_guard_transactions: {
        Args: Record<string, never>;
        Returns: "trigger";
      };
      finance_guard_transfer_group: {
        Args: Record<string, never>;
        Returns: "trigger";
      };
      audit_finance_changes: {
        Args: Record<string, never>;
        Returns: "trigger";
      };
      finance_create_transfer: {
        Args: {
          p_from_account_id: string;
          p_to_account_id: string;
          p_amount_minor: number;
          p_transaction_date: string;
          p_description?: string | null;
          p_document_number?: string | null;
          p_post?: boolean;
        };
        Returns: string;
      };
    };
    Enums: {
      membership_type: "adult" | "youth" | "preparatory" | "dorast";
      member_status: "active" | "inactive";
      equipment_status: "AVAILABLE" | "IN_SERVICE" | "RESERVED" | "DAMAGED" | "DISPOSED";
      equipment_condition: "NEW" | "GOOD" | "FAIR" | "POOR" | "UNSERVICEABLE";
      maintenance_type: "STK_EK" | "REVISION" | "SERVICE_CHECK" | "REPAIR" | "INSPECTION";
      incident_type:
        | "FIRE"
        | "TECHNICAL"
        | "FLOOD"
        | "TRAFFIC_ACCIDENT"
        | "TACTICAL_EXERCISE"
        | "OTHER";
      incident_status: "REPORTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
      responder_role: "COMMANDER" | "DRIVER" | "FIREFIGHTER" | "SUPPORT";
      finance_account_type: "CASH" | "BANK" | "OTHER";
      finance_transaction_type: "INCOME" | "EXPENSE" | "TRANSFER_IN" | "TRANSFER_OUT";
      finance_transaction_status: "DRAFT" | "POSTED" | "VOID";
      finance_direction: "INCOME" | "EXPENSE";
      finance_plan_status: "PLANNED" | "APPROVED" | "COMPLETED" | "CANCELLED";
    };
    CompositeTypes: { [_ in never]: never };
  };
}

// =============================================================================
// Finance module aliases (doménové typy odvodené z generovaného Database)
// =============================================================================

export type FinanceAccountType = Database["public"]["Enums"]["finance_account_type"];
export type FinanceTransactionType = Database["public"]["Enums"]["finance_transaction_type"];
export type FinanceTransactionStatus = Database["public"]["Enums"]["finance_transaction_status"];
export type FinanceDirection = Database["public"]["Enums"]["finance_direction"];
export type FinanceAccountRow = Database["public"]["Tables"]["finance_accounts"]["Row"];
export type FinanceAccountInsert = Database["public"]["Tables"]["finance_accounts"]["Insert"];
export type FinanceAccountsRow = FinanceAccountRow;
export type FinanceCategoryRow = Database["public"]["Tables"]["finance_categories"]["Row"];
export type FinanceCategoriesRow = FinanceCategoryRow;
export type FinanceTransactionRow = Database["public"]["Tables"]["finance_transactions"]["Row"];
export type FinanceTransactionInsert = Database["public"]["Tables"]["finance_transactions"]["Insert"];
export type FinanceAccountBalanceRow = Database["public"]["Views"]["finance_account_balances"]["Row"];
export type FinanceTransactionAttachmentRow =
  Database["public"]["Tables"]["finance_transaction_attachments"]["Row"];
export type FinanceTransactionAttachmentInsert =
  Database["public"]["Tables"]["finance_transaction_attachments"]["Insert"];


