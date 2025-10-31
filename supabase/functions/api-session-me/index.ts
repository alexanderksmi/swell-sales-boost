import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Read token from Authorization header
    const authHeader = req.headers.get('authorization');
    const sessionToken = authHeader?.replace('Bearer ', '');
    
    if (!sessionToken) {
      console.log('No session token provided');
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
    
    // Decode JWT
    try {
      const parts = sessionToken.split('.');
      if (parts.length !== 3) {
        console.log('Invalid JWT format: expected 3 parts, got', parts.length);
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

      const [headerB64, payloadB64] = parts;
      
      // Base64url decode helper
      const base64urlDecode = (str: string) => {
        str = str.replace(/-/g, '+').replace(/_/g, '/');
        const pad = str.length % 4;
        if (pad) {
          str += '='.repeat(4 - pad);
        }
        return atob(str);
      };

      const payload = JSON.parse(base64urlDecode(payloadB64));
      console.log('Decoded JWT payload:', JSON.stringify(payload, null, 2));
      
      // Extract user_id and tenant_id from JWT claims
      const userId = payload.sub; // Supabase uses 'sub' for user ID
      const tenantId = payload.tenant_id;

      if (!userId || !tenantId) {
        console.log('Missing required claims - userId:', userId, 'tenantId:', tenantId);
        return new Response(
          JSON.stringify({ authenticated: false, error: 'Invalid token claims' }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        );
      }
      
      // Check if token is expired
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        console.log('Session token expired at', payload.exp, 'current time:', now);
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

      // Verify user exists in database using service role
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      console.log('Querying user with id:', userId, 'tenant:', tenantId);
      const { data: user, error } = await supabase
        .from('users')
        .select('id, email, tenant_id')
        .eq('id', userId)
        .eq('tenant_id', tenantId)
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

      // Fetch tenant information including company name
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('id, company_name')
        .eq('id', user.tenant_id)
        .single();

      // Fetch user's teams
      const { data: userTeams, error: teamsError } = await supabase
        .from('user_teams')
        .select(`
          team_id,
          teams:team_id (
            id,
            name,
            description
          )
        `)
        .eq('user_id', user.id);

      const teams = userTeams?.map(ut => ({
        id: (ut.teams as any).id,
        name: (ut.teams as any).name,
        description: (ut.teams as any).description,
      })) || [];

      console.log('Valid session found for user:', user.email, 'with', teams.length, 'teams');
      return new Response(
        JSON.stringify({
          authenticated: true,
          user: {
            id: user.id,
            email: user.email,
          },
          tenant: {
            id: user.tenant_id,
            company_name: tenant?.company_name || 'Unknown Company',
          },
          teams,
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
