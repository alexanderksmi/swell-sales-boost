import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('api-exchange-session: Processing session exchange');

    // Get session_key from query params
    const url = new URL(req.url);
    const sessionKey = url.searchParams.get('session_key');

    if (!sessionKey) {
      console.log('Missing session_key parameter');
      return new Response(
        JSON.stringify({ error: 'Missing session_key parameter' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('Looking up session with key:', sessionKey.substring(0, 8) + '...');

    // Fetch the session token from database
    const { data: sessionData, error: fetchError } = await supabase
      .from('auth_sessions')
      .select('session_token, expires_at')
      .eq('session_key', sessionKey)
      .single();

    if (fetchError || !sessionData) {
      console.log('Session not found or expired:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session key' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // Check if expired
    if (new Date(sessionData.expires_at) < new Date()) {
      console.log('Session expired');
      
      // Delete expired session
      await supabase.from('auth_sessions').delete().eq('session_key', sessionKey);
      
      return new Response(
        JSON.stringify({ error: 'Session expired' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    console.log('Session found, deleting after retrieval (one-time use)');

    // Delete the session (one-time use)
    const { error: deleteError } = await supabase
      .from('auth_sessions')
      .delete()
      .eq('session_key', sessionKey);

    if (deleteError) {
      console.error('Failed to delete session:', deleteError);
    }

    console.log('Session exchanged successfully');

    // Return the session token
    return new Response(
      JSON.stringify({ sessionToken: sessionData.session_token }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('api-exchange-session error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
