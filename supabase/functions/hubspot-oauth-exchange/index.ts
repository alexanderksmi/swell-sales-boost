import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://swell-sales-boost.lovable.app',
  'https://preview--swell-sales-boost.lovable.app'
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Credentials': 'true',
    };
  }
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers = getCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    // Hent miljøvariabler
    const appBaseUrl = Deno.env.get('APP_BASE_URL') || '';
    const clientId = Deno.env.get('HUBSPOT_CLIENT_ID');
    const clientSecret = Deno.env.get('HUBSPOT_CLIENT_SECRET');
    const redirectUri = Deno.env.get('HUBSPOT_REDIRECT_URI');

    if (!code || !state) {
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${appBaseUrl}/auth/hubspot/callback?error=hubspot_oauth_failed`,
        },
      });
    }

    if (!clientId || !clientSecret || !redirectUri || !appBaseUrl) {
      console.error('Missing HubSpot credentials or APP_BASE_URL');
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${appBaseUrl}/auth/hubspot/callback?error=hubspot_oauth_failed`,
        },
      });
    }

    // Token-bytte med HubSpot
    const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code: code,
      }),
    });

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', await tokenResponse.text());
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${appBaseUrl}/auth/hubspot/callback?error=hubspot_oauth_failed`,
        },
      });
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    // Hent brukerinfo fra HubSpot
    const userInfoResponse = await fetch('https://api.hubapi.com/oauth/v1/access-tokens/' + access_token);
    const userInfo = await userInfoResponse.json();

    // Beregn utløpstidspunkt
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    // Lagre i Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Hent auth header fra request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header');
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${appBaseUrl}/auth/hubspot/callback?error=hubspot_oauth_failed`,
        },
      });
    }

    // Verifiser bruker
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('User verification failed:', userError);
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${appBaseUrl}/auth/hubspot/callback?error=hubspot_oauth_failed`,
        },
      });
    }

    // Lagre tokens
    const { error: insertError } = await supabase
      .from('hubspot_tokens')
      .upsert({
        user_id: user.id,
        access_token,
        refresh_token,
        expires_at: expiresAt,
        hubspot_user: userInfo.user,
      });

    if (insertError) {
      console.error('Failed to store tokens:', insertError);
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${appBaseUrl}/auth/hubspot/callback?error=hubspot_oauth_failed`,
        },
      });
    }

    // Vellykket - redirect
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `${appBaseUrl}/auth/hubspot/callback?ok=1`,
      },
    });

  } catch (error) {
    console.error('Error in hubspot-oauth-exchange:', error);
    const appBaseUrl = Deno.env.get('APP_BASE_URL') || '';
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `${appBaseUrl}/auth/hubspot/callback?error=hubspot_oauth_failed`,
      },
    });
  }
});
