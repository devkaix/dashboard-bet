export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_users: {
        Row: { active: boolean; created_at: string; created_by: string | null; user_id: string }
        Insert: { active?: boolean; created_at?: string; created_by?: string | null; user_id: string }
        Update: { active?: boolean; created_at?: string; created_by?: string | null; user_id?: string }
        Relationships: []
      }
      daily_network_stats: {
        Row: { bet: number | null; bet_bonus: number | null; buy_in: number | null; buy_in_bonus: number | null; created_at: string | null; date: string; id: string; jackpot: number | null; jackpot_won: number | null; overlay: number | null; payout: number | null; rake: number | null; refund: number | null; stack: number | null; won: number | null }
        Insert: { bet?: number | null; bet_bonus?: number | null; buy_in?: number | null; buy_in_bonus?: number | null; created_at?: string | null; date: string; id?: string; jackpot?: number | null; jackpot_won?: number | null; overlay?: number | null; payout?: number | null; rake?: number | null; refund?: number | null; stack?: number | null; won?: number | null }
        Update: { bet?: number | null; bet_bonus?: number | null; buy_in?: number | null; buy_in_bonus?: number | null; created_at?: string | null; date?: string; id?: string; jackpot?: number | null; jackpot_won?: number | null; overlay?: number | null; payout?: number | null; rake?: number | null; refund?: number | null; stack?: number | null; won?: number | null }
        Relationships: []
      }
      daily_player_game_stats: {
        Row: { bet: number | null; bet_bonus: number | null; buy_in: number | null; buy_in_bonus: number | null; created_at: string | null; date: string; game_name: string; game_type_id: string | null; id: string; jackpot: number | null; jackpot_won: number | null; overlay: number | null; payout: number | null; player_id: string; provider: string; rake: number | null; refund: number | null; stack: number | null; won: number | null }
        Insert: { bet?: number | null; bet_bonus?: number | null; buy_in?: number | null; buy_in_bonus?: number | null; created_at?: string | null; date: string; game_name: string; game_type_id?: string | null; id?: string; jackpot?: number | null; jackpot_won?: number | null; overlay?: number | null; payout?: number | null; player_id: string; provider: string; rake?: number | null; refund?: number | null; stack?: number | null; won?: number | null }
        Update: { bet?: number | null; bet_bonus?: number | null; buy_in?: number | null; buy_in_bonus?: number | null; created_at?: string | null; date?: string; game_name?: string; game_type_id?: string | null; id?: string; jackpot?: number | null; jackpot_won?: number | null; overlay?: number | null; payout?: number | null; player_id?: string; provider?: string; rake?: number | null; refund?: number | null; stack?: number | null; won?: number | null }
        Relationships: [
          {
            foreignKeyName: "daily_player_game_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_player_stats: {
        Row: { bet: number | null; bet_bonus: number | null; buy_in: number | null; buy_in_bonus: number | null; created_at: string | null; date: string; id: string; jackpot: number | null; jackpot_won: number | null; overlay: number | null; payout: number | null; player_id: string; rake: number | null; refund: number | null; stack: number | null; won: number | null }
        Insert: { bet?: number | null; bet_bonus?: number | null; buy_in?: number | null; buy_in_bonus?: number | null; created_at?: string | null; date: string; id?: string; jackpot?: number | null; jackpot_won?: number | null; overlay?: number | null; payout?: number | null; player_id: string; rake?: number | null; refund?: number | null; stack?: number | null; won?: number | null }
        Update: { bet?: number | null; bet_bonus?: number | null; buy_in?: number | null; buy_in_bonus?: number | null; created_at?: string | null; date?: string; id?: string; jackpot?: number | null; jackpot_won?: number | null; overlay?: number | null; payout?: number | null; player_id?: string; rake?: number | null; refund?: number | null; stack?: number | null; won?: number | null }
        Relationships: [
          {
            foreignKeyName: "daily_player_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_pvr_stats: {
        Row: { bet: number | null; bet_bonus: number | null; buy_in: number | null; buy_in_bonus: number | null; created_at: string | null; date: string; id: string; jackpot: number | null; jackpot_won: number | null; overlay: number | null; payout: number | null; pvr_id: string; rake: number | null; refund: number | null; stack: number | null; won: number | null }
        Insert: { bet?: number | null; bet_bonus?: number | null; buy_in?: number | null; buy_in_bonus?: number | null; created_at?: string | null; date: string; id?: string; jackpot?: number | null; jackpot_won?: number | null; overlay?: number | null; payout?: number | null; pvr_id: string; rake?: number | null; refund?: number | null; stack?: number | null; won?: number | null }
        Update: { bet?: number | null; bet_bonus?: number | null; buy_in?: number | null; buy_in_bonus?: number | null; created_at?: string | null; date?: string; id?: string; jackpot?: number | null; jackpot_won?: number | null; overlay?: number | null; payout?: number | null; pvr_id?: string; rake?: number | null; refund?: number | null; stack?: number | null; won?: number | null }
        Relationships: [
          {
            foreignKeyName: "daily_pvr_stats_pvr_id_fkey"
            columns: ["pvr_id"]
            isOneToOne: false
            referencedRelation: "pvrs"
            referencedColumns: ["id"]
          },
        ]
      }
      excel_uploads: {
        Row: { error_message: string | null; file_hash: string | null; file_type: string | null; filename: string; id: string; normalized_hash: string | null; period_end: string | null; period_start: string | null; processed_at: string | null; rows_processed: number | null; status: string | null; storage_path: string | null; uploaded_at: string | null; validation_report: Json | null; validation_status: string | null }
        Insert: { error_message?: string | null; file_hash?: string | null; file_type?: string | null; filename: string; id?: string; normalized_hash?: string | null; period_end?: string | null; period_start?: string | null; processed_at?: string | null; rows_processed?: number | null; status?: string | null; storage_path?: string | null; uploaded_at?: string | null; validation_report?: Json | null; validation_status?: string | null }
        Update: { error_message?: string | null; file_hash?: string | null; file_type?: string | null; filename?: string; id?: string; normalized_hash?: string | null; period_end?: string | null; period_start?: string | null; processed_at?: string | null; rows_processed?: number | null; status?: string | null; storage_path?: string | null; uploaded_at?: string | null; validation_report?: Json | null; validation_status?: string | null }
        Relationships: []
      }
      game_types: {
        Row: { created_at: string | null; game_name: string; id: string; provider: string }
        Insert: { created_at?: string | null; game_name: string; id?: string; provider: string }
        Update: { created_at?: string | null; game_name?: string; id?: string; provider?: string }
        Relationships: []
      }
      player_username_aliases: {
        Row: { alias_normalized: string; created_at: string; player_id: string; source: string | null; verified: boolean }
        Insert: { alias_normalized: string; created_at?: string; player_id: string; source?: string | null; verified?: boolean }
        Update: { alias_normalized?: string; created_at?: string; player_id?: string; source?: string | null; verified?: boolean }
        Relationships: []
      }
      players: {
        Row: { balance: number | null; created_at: string | null; email: string | null; first_seen_date: string | null; id: string; kyc_status: string | null; last_seen_date: string | null; pvr_id: string | null; pvr_ref_code: string | null; registration_date: string | null; updated_at: string | null; username: string; username_normalized: string | null; withdrawable_balance: number | null }
        Insert: { balance?: number | null; created_at?: string | null; email?: string | null; first_seen_date?: string | null; id?: string; kyc_status?: string | null; last_seen_date?: string | null; pvr_id?: string | null; pvr_ref_code?: string | null; registration_date?: string | null; updated_at?: string | null; username: string; username_normalized?: string | null; withdrawable_balance?: number | null }
        Update: { balance?: number | null; created_at?: string | null; email?: string | null; first_seen_date?: string | null; id?: string; kyc_status?: string | null; last_seen_date?: string | null; pvr_id?: string | null; pvr_ref_code?: string | null; registration_date?: string | null; updated_at?: string | null; username?: string; username_normalized?: string | null; withdrawable_balance?: number | null }
        Relationships: [
          {
            foreignKeyName: "players_pvr_id_fkey"
            columns: ["pvr_id"]
            isOneToOne: false
            referencedRelation: "pvrs"
            referencedColumns: ["id"]
          },
        ]
      }
      pvr_mapping_audit: {
        Row: { action: string; affected_players: number; created_at: string; id: string; new_pvr_id: string; players_already_correct: number; players_changed: number; players_previously_null: number; players_reassigned: number; previous_pvr_id: string | null; pvr_ref_code: string; reason: string | null; request_id: string | null; total_players: number; verified_by: string | null }
        Insert: { action: string; affected_players?: number; created_at?: string; id?: string; new_pvr_id: string; players_already_correct?: number; players_changed?: number; players_previously_null?: number; players_reassigned?: number; previous_pvr_id?: string | null; pvr_ref_code: string; reason?: string | null; request_id?: string | null; total_players?: number; verified_by?: string | null }
        Update: { action?: string; affected_players?: number; created_at?: string; id?: string; new_pvr_id?: string; players_already_correct?: number; players_changed?: number; players_previously_null?: number; players_reassigned?: number; previous_pvr_id?: string | null; pvr_ref_code?: string; reason?: string | null; request_id?: string | null; total_players?: number; verified_by?: string | null }
        Relationships: []
      }
      pvr_reference_map: {
        Row: { confidence: number; created_at: string; mapping_source: string; notes: string | null; pvr_id: string; pvr_ref_code: string; updated_at: string; verified: boolean }
        Insert: { confidence?: number; created_at?: string; mapping_source: string; notes?: string | null; pvr_id: string; pvr_ref_code: string; updated_at?: string; verified?: boolean }
        Update: { confidence?: number; created_at?: string; mapping_source?: string; notes?: string | null; pvr_id?: string; pvr_ref_code?: string; updated_at?: string; verified?: boolean }
        Relationships: [
          {
            foreignKeyName: "pvr_reference_map_pvr_id_fkey"
            columns: ["pvr_id"]
            isOneToOne: false
            referencedRelation: "pvrs"
            referencedColumns: ["id"]
          },
        ]
      }
      pvrs: {
        Row: { area_manager: string | null; created_at: string | null; exalogic_id: string; id: string; name: string; region: string | null; updated_at: string | null }
        Insert: { area_manager?: string | null; created_at?: string | null; exalogic_id: string; id?: string; name: string; region?: string | null; updated_at?: string | null }
        Update: { area_manager?: string | null; created_at?: string | null; exalogic_id?: string; id?: string; name?: string; region?: string | null; updated_at?: string | null }
        Relationships: []
      }
      tickets: {
        Row: { amount: number | null; competition_date: string | null; created_at: string | null; emission_date: string | null; events_count: number | null; id: string; payment_date: string | null; player_id: string | null; pvr_code: string | null; status: string | null; ticket_code: string | null; win_amount: number | null }
        Insert: { amount?: number | null; competition_date?: string | null; created_at?: string | null; emission_date?: string | null; events_count?: number | null; id?: string; payment_date?: string | null; player_id?: string | null; pvr_code?: string | null; status?: string | null; ticket_code?: string | null; win_amount?: number | null }
        Update: { amount?: number | null; competition_date?: string | null; created_at?: string | null; emission_date?: string | null; events_count?: number | null; id?: string; payment_date?: string | null; player_id?: string | null; pvr_code?: string | null; status?: string | null; ticket_code?: string | null; win_amount?: number | null }
        Relationships: [
          {
            foreignKeyName: "tickets_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      monthly_player_stats_v: {
        Row: { active_days: number | null; bet: number | null; bet_bonus: number | null; buy_in: number | null; buy_in_bonus: number | null; jackpot: number | null; jackpot_won: number | null; month: string | null; overlay: number | null; payout: number | null; player_id: string | null; rake: number | null; refund: number | null; stack: number | null; won: number | null }
        Relationships: []
      }
    }
    Functions: {
      is_admin: { Args: { p_user_id?: string }; Returns: boolean }
      preview_pvr_mapping: { Args: { p_pvr_id: string; p_reference_code: string }; Returns: Json }
      verify_pvr_mapping: { Args: { p_pvr_id: string; p_reason?: string; p_reference_code: string }; Returns: Json }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends { Row: infer R } ? R : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends { Row: infer R } ? R : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends { Insert: infer I } ? I : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Insert: infer I } ? I : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends { Update: infer U } ? U : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Update: infer U } ? U : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: { Enums: {} },
} as const
