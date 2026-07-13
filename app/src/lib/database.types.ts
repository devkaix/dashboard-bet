export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      pvrs: {
        Row: {
          id: string;
          exalogic_id: string;
          name: string;
          area_manager: string | null;
          region: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          exalogic_id: string;
          name: string;
          area_manager?: string | null;
          region?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          exalogic_id?: string;
          name?: string;
          area_manager?: string | null;
          region?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      players: {
        Row: { id: string; username: string; email: string | null; first_seen_date: string | null; last_seen_date: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; username: string; email?: string | null; first_seen_date?: string | null; last_seen_date?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; username?: string; email?: string | null; first_seen_date?: string | null; last_seen_date?: string | null; created_at?: string; updated_at?: string };
      };
      daily_player_stats: {
        Row: { id: string; player_id: string; date: string; buy_in: number; buy_in_bonus: number; stack: number; bet: number; won: number; rake: number; payout: number; bet_bonus: number; jackpot: number; jackpot_won: number; overlay: number; refund: number; created_at: string };
        Insert: { id?: string; player_id: string; date: string; buy_in?: number; buy_in_bonus?: number; stack?: number; bet?: number; won?: number; rake?: number; payout?: number; bet_bonus?: number; jackpot?: number; jackpot_won?: number; overlay?: number; refund?: number; created_at?: string };
        Update: { id?: string; player_id?: string; date?: string; buy_in?: number; buy_in_bonus?: number; stack?: number; bet?: number; won?: number; rake?: number; payout?: number; bet_bonus?: number; jackpot?: number; jackpot_won?: number; overlay?: number; refund?: number; created_at?: string };
      };
      daily_network_stats: {
        Row: { id: string; date: string; buy_in: number; buy_in_bonus: number; stack: number; bet: number; won: number; rake: number; payout: number; bet_bonus: number; jackpot: number; jackpot_won: number; overlay: number; refund: number; created_at: string };
        Insert: { id?: string; date: string; buy_in?: number; buy_in_bonus?: number; stack?: number; bet?: number; won?: number; rake?: number; payout?: number; bet_bonus?: number; jackpot?: number; jackpot_won?: number; overlay?: number; refund?: number; created_at?: string };
        Update: { id?: string; date?: string; buy_in?: number; buy_in_bonus?: number; stack?: number; bet?: number; won?: number; rake?: number; payout?: number; bet_bonus?: number; jackpot?: number; jackpot_won?: number; overlay?: number; refund?: number; created_at?: string };
      };
      daily_pvr_stats: {
        Row: { id: string; pvr_id: string; date: string; buy_in: number; buy_in_bonus: number; stack: number; bet: number; won: number; rake: number; payout: number; bet_bonus: number; jackpot: number; jackpot_won: number; overlay: number; refund: number; created_at: string };
        Insert: { id?: string; pvr_id: string; date: string; buy_in?: number; buy_in_bonus?: number; stack?: number; bet?: number; won?: number; rake?: number; payout?: number; bet_bonus?: number; jackpot?: number; jackpot_won?: number; overlay?: number; refund?: number; created_at?: string };
        Update: { id?: string; pvr_id?: string; date?: string; buy_in?: number; buy_in_bonus?: number; stack?: number; bet?: number; won?: number; rake?: number; payout?: number; bet_bonus?: number; jackpot?: number; jackpot_won?: number; overlay?: number; refund?: number; created_at?: string };
      };
      game_types: {
        Row: { id: string; provider: string; game_name: string; created_at: string };
        Insert: { id?: string; provider: string; game_name: string; created_at?: string };
        Update: { id?: string; provider?: string; game_name?: string; created_at?: string };
      };
      daily_player_game_stats: {
        Row: { id: string; player_id: string; game_type_id: string | null; provider: string; game_name: string; date: string; buy_in: number; buy_in_bonus: number; stack: number; bet: number; won: number; rake: number; payout: number; bet_bonus: number; jackpot: number; jackpot_won: number; overlay: number; refund: number; created_at: string };
        Insert: { id?: string; player_id: string; game_type_id?: string | null; provider: string; game_name: string; date: string; buy_in?: number; buy_in_bonus?: number; stack?: number; bet?: number; won?: number; rake?: number; payout?: number; bet_bonus?: number; jackpot?: number; jackpot_won?: number; overlay?: number; refund?: number; created_at?: string };
        Update: { id?: string; player_id?: string; game_type_id?: string | null; provider?: string; game_name?: string; date?: string; buy_in?: number; buy_in_bonus?: number; stack?: number; bet?: number; won?: number; rake?: number; payout?: number; bet_bonus?: number; jackpot?: number; jackpot_won?: number; overlay?: number; refund?: number; created_at?: string };
      };
      tickets: {
        Row: { id: string; ticket_code: string | null; player_id: string | null; pvr_code: string | null; emission_date: string | null; status: string | null; competition_date: string | null; amount: number; win_amount: number; events_count: number; payment_date: string | null; created_at: string };
        Insert: { id?: string; ticket_code?: string | null; player_id?: string | null; pvr_code?: string | null; emission_date?: string | null; status?: string | null; competition_date?: string | null; amount?: number; win_amount?: number; events_count?: number; payment_date?: string | null; created_at?: string };
        Update: { id?: string; ticket_code?: string | null; player_id?: string | null; pvr_code?: string | null; emission_date?: string | null; status?: string | null; competition_date?: string | null; amount?: number; win_amount?: number; events_count?: number; payment_date?: string | null; created_at?: string };
      };
      excel_uploads: {
        Row: { id: string; filename: string; file_type: string | null; storage_path: string | null; status: string; rows_processed: number; error_message: string | null; uploaded_at: string; processed_at: string | null };
        Insert: { id?: string; filename: string; file_type?: string | null; storage_path?: string | null; status?: string; rows_processed?: number; error_message?: string | null; uploaded_at?: string; processed_at?: string | null };
        Update: { id?: string; filename?: string; file_type?: string | null; storage_path?: string | null; status?: string; rows_processed?: number; error_message?: string | null; uploaded_at?: string; processed_at?: string | null };
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
}
