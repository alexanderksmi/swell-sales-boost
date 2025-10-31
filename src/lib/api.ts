// API utility functions for edge function calls
import { supabase } from "@/integrations/supabase/client";

/**
 * Health check endpoint
 * Verifies that the backend is running
 */
export async function checkHealth() {
  try {
    const { data, error } = await supabase.functions.invoke('health', {
      method: 'GET',
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Health check failed:', error);
    throw error;
  }
}

/**
 * Placeholder for HubSpot authentication
 * Will be implemented in Milestone 1
 */
export async function authenticateWithHubSpot(code: string) {
  try {
    const { data, error } = await supabase.functions.invoke('hubspot-auth', {
      body: { code },
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('HubSpot authentication failed:', error);
    throw error;
  }
}

/**
 * Check current session validity
 * Returns user and tenant data if session is valid
 */
export async function checkSession() {
  try {
    // Get the current session to pass the access token
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    
    console.log('[checkSession] Token found:', !!token, token ? `length: ${token.length}` : 'none');
    
    // Call api-session-me with the token explicitly in the header
    const { data, error } = await supabase.functions.invoke('api-session-me', {
      method: 'GET',
      headers: token ? {
        'Authorization': `Bearer ${token}`,
      } : {},
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Session check failed:', error);
    throw error;
  }
}
