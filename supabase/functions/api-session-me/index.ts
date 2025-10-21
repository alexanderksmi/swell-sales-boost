import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-swell-session',
  'Access-Control-Allow-Credentials': 'true',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('api-session-me: Checking session');

    // Try custom header first (from fetch), then cookie
    let sessionToken = req.headers.get('x-swell-session');
    
    if (!sessionToken) {
      // Fall back to cookie
      const cookies = req.headers.get('cookie') || '';
      const sessionMatch = cookies.match(/swell_session=([^;]+)/);
      sessionToken = sessionMatch ? sessionMatch[1] : null;
    }
    
    if (!sessionToken) {
      console.log('No session token found in header or cookie');
      return new Response(
        JSON.stringify({ authenticated: false }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }
    
    // Decode JWT (simple validation - in production use proper JWT library)
    try {
      const [headerB64, payloadB64] = sessionToken.split('.');
      const payload = JSON.parse(atob(payloadB64));
      
      // Check if token is expired
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        console.log('Session token expired');
        return new Response(
          JSON.stringify({ authenticated: false, error: 'Token expired' }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        );
      }

      // Verify user exists in database
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      const { data: user, error } = await supabase
        .from('users')
        .select('id, email, tenant_id')
        .eq('id', payload.user_id)
        .eq('tenant_id', payload.tenant_id)
        .single();

      if (error || !user) {
        console.log('User not found in database:', error);
        return new Response(
          JSON.stringify({ authenticated: false, error: 'User not found' }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        );
      }

      console.log('Valid session found for user:', user.email);
      return new Response(
        JSON.stringify({
          authenticated: true,
          user: {
            id: user.id,
            email: user.email,
          },
          tenant: {
            id: user.tenant_id,
          },
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (decodeError) {
      console.error('JWT decode error:', decodeError);
      return new Response(
        JSON.stringify({ authenticated: false, error: 'Invalid token format' }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }
  } catch (error) {
    console.error('Session check error:', error);
    return new Response(
      JSON.stringify({
        authenticated: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
