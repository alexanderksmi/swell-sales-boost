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
