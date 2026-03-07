/**
 * Supabase Database Types
 * Auto-generated from schema - DO NOT EDIT manually
 * Regenerate with: npx supabase gen types typescript --project-id <project-id>
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      closers: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          balance: number;
          min_balance: number;
          is_available: boolean;
          sip_username: string | null;
          sip_password: string | null;
          twilio_cred_sid: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          full_name: string;
          balance?: number;
          min_balance?: number;
          is_available?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          balance?: number;
          min_balance?: number;
          is_available?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      closer_licenses: {
        Row: {
          id: string;
          closer_id: string;
          state_code: string;
          license_number: string | null;
          verified: boolean;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          closer_id: string;
          state_code: string;
          license_number?: string | null;
          verified?: boolean;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          closer_id?: string;
          state_code?: string;
          license_number?: string | null;
          verified?: boolean;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      call_logs: {
        Row: {
          id: string;
          lead_phone_encrypted: Uint8Array;
          lead_phone_hash: string;
          lead_email: string | null;
          lead_name: string | null;
          lead_company: string | null;
          lead_state: string | null;
          lead_city: string | null;
          vapi_call_id: string | null;
          closer_id: string | null;
          status: string;
          vapi_triggered_at: string | null;
          lead_answered_at: string | null;
          qualified_at: string | null;
          closer_accepted_at: string | null;
          connected_at: string | null;
          ended_at: string | null;
          duration_sec: number | null;
          outcome: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lead_phone_encrypted: Uint8Array;
          lead_phone_hash: string;
          lead_email?: string | null;
          lead_name?: string | null;
          lead_company?: string | null;
          lead_state?: string | null;
          lead_city?: string | null;
          vapi_call_id?: string | null;
          closer_id?: string | null;
          status?: string;
          vapi_triggered_at?: string | null;
          lead_answered_at?: string | null;
          qualified_at?: string | null;
          closer_accepted_at?: string | null;
          connected_at?: string | null;
          ended_at?: string | null;
          duration_sec?: number | null;
          outcome?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lead_phone_encrypted?: Uint8Array;
          lead_phone_hash?: string;
          lead_email?: string | null;
          lead_name?: string | null;
          lead_company?: string | null;
          lead_state?: string | null;
          lead_city?: string | null;
          vapi_call_id?: string | null;
          closer_id?: string | null;
          status?: string;
          vapi_triggered_at?: string | null;
          lead_answered_at?: string | null;
          qualified_at?: string | null;
          closer_accepted_at?: string | null;
          connected_at?: string | null;
          ended_at?: string | null;
          duration_sec?: number | null;
          outcome?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      area_code_mapping: {
        Row: {
          area_code: string;
          state_code: string;
          state_name: string;
          city: string;
        };
        Insert: {
          area_code: string;
          state_code: string;
          state_name: string;
          city: string;
        };
        Update: {
          area_code?: string;
          state_code?: string;
          state_name?: string;
          city?: string;
        };
      };
      callback_queue: {
        Row: {
          id: string;
          call_log_id: string | null;
          scheduled_at: string;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          call_log_id?: string | null;
          scheduled_at: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          call_log_id?: string | null;
          scheduled_at?: string;
          status?: string;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      find_eligible_closers: {
        Args: {
          lead_state_code: string;
        };
        Returns: {
          closer_id: string;
          email: string;
          full_name: string;
        }[];
      };
      claim_call: {
        Args: {
          p_call_id: string;
          p_closer_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

// Convenience types
export type Closer = Database['public']['Tables']['closers']['Row'];
export type CloserLicense = Database['public']['Tables']['closer_licenses']['Row'];
export type CallLog = Database['public']['Tables']['call_logs']['Row'];
export type AreaCodeMapping = Database['public']['Tables']['area_code_mapping']['Row'];

// Call status type
export type CallStatus =
  | 'pending_call'
  | 'calling'
  | 'in_qualification'
  | 'qualified'
  | 'ringing_closers'
  | 'connected'
  | 'no_answer'
  | 'dq'
  | 'completed';

// Call outcome type
export type CallOutcome = 'approved' | 'denied' | 'callback';

// Incoming call event (from Supabase Realtime)
export interface IncomingCallEvent {
  call_id: string;
  lead_state: string;
  lead_city: string;
  display_text: string;  // "Incoming Caller: Los Angeles, California (CA)"
  timestamp: string;
  eligible_closer_ids: string[];
  vapi_call_id: string;
}

// Call claimed event (from Supabase Realtime)
export interface CallClaimedEvent {
  call_id: string;
  claimed_by: string;  // closer_id who claimed it
  timestamp: string;
}
