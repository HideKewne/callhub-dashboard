/**
 * Supabase Client Configuration
 *
 * SECURITY NOTE:
 * - Only the anon key is used here (safe for frontend)
 * - RLS policies protect data access
 * - Sensitive operations (phone lookup, call claiming) go through n8n backend
 * - Service role key is NEVER used in frontend
 */

import { createClient } from '@supabase/supabase-js';

// Environment variables (set in .env file, injected by Vite)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env file.'
  );
}

// Create Supabase client (untyped for flexibility)
// Type safety is enforced at the application layer
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Backend API base URL (n8n endpoints for sensitive operations)
export const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL ||
  'https://www.n8n.fairintech.com/webhook';

/**
 * Helper to make authenticated requests to the backend
 * Includes the Supabase session token for verification
 */
export async function backendRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();

  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  return fetch(`${BACKEND_API_URL}/${endpoint}`, {
    ...options,
    headers,
  });
}

/**
 * Claim a call (goes through backend for security)
 * Backend verifies auth and handles race conditions
 */
export async function claimCall(callId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // Use WhiteRock-specific claim endpoint for Telnyx calls
    // The generic wingman-tech-claim is for Vapi calls
    const response = await backendRequest('wingman-tech-claim-whiterock', {
      method: 'POST',
      body: JSON.stringify({ call_id: callId }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to claim call',
    };
  }
}

/**
 * Update closer availability status
 * Uses Supabase directly (RLS allows users to update their own record)
 */
export async function updateAvailability(isAvailable: boolean): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { error } = await supabase
      .from('closers')
      .update({
        is_available: isAvailable,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (error) {
      console.error('Supabase update error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update availability',
    };
  }
}

/**
 * Create SIP credentials for a new closer
 * Called after signup to enable WebRTC calling
 */
export async function createSipCredentials(closerId: string, email: string): Promise<{
  success: boolean;
  sip_username?: string;
  sip_domain?: string;
  error?: string;
}> {
  try {
    const response = await fetch(`${BACKEND_API_URL}/wingman-tech-new-closer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ closer_id: closerId, email }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to create SIP credentials:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create SIP credentials',
    };
  }
}
