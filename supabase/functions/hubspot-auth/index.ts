import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.1';

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
  // Check if origin is allowed
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Credentials': 'true',
    };
  }
  // Check if origin is a Lovable preview domain
  if (origin) {
    try {
      const url = new URL(origin);
      if (url.hostname.endsWith('.lovableproject.com') || url.hostname.endsWith('.lovable.app')) {
        return {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
          'Access-Control-Allow-Credentials': 'true',
        };
      }
    } catch (e) {
      // Invalid URL, continue to default
    }
  }
  // Default to first allowed origin if origin not provided or not allowed
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

// Environment variables - Required for OAuth flow
const HUBSPOT_CLIENT_ID = Deno.env.get('HUBSPOT_CLIENT_ID');
const HUBSPOT_CLIENT_SECRET = Deno.env.get('HUBSPOT_CLIENT_SECRET');
const HUBSPOT_REDIRECT_URI = Deno.env.get('HUBSPOT_REDIRECT_URI');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const APP_BASE_URL = Deno.env.get('APP_BASE_URL');

// Validate required environment variables at startup
function validateEnvVars(): { valid: boolean; missing: string[] } {
  const required = [
    'HUBSPOT_CLIENT_ID',
    'HUBSPOT_CLIENT_SECRET', 
    'HUBSPOT_REDIRECT_URI',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'APP_BASE_URL'
  ];
  
  const missing = required.filter(key => !Deno.env.get(key));
  return { valid: missing.length === 0, missing };
}

const envCheck = validateEnvVars();
if (!envCheck.valid) {
  console.error('CRITICAL: Missing required environment variables:', envCheck.missing);
}

// OAuth scopes required for HubSpot integration
const SCOPES = [
  'crm.objects.contacts.read',
  'crm.objects.deals.read',
  'crm.objects.users.read',
  'oauth',
].join(' ');

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers = getCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  console.log('HubSpot auth endpoint called:', path);

  try {
      // Validate environment variables before proceeding
      if (!envCheck.valid) {
        console.error('Cannot proceed - missing environment variables');
        return new Response(
          JSON.stringify({ error: 'Server configuration error' }),
          { 
            status: 500, 
            headers: { ...headers, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Route: /start - Generate OAuth URL and return to client
    if (path.includes('/start')) {
      // Get frontend URL from query params
      const frontendUrl = url.searchParams.get('frontend_url') || req.headers.get('referer') || '';
      const cleanFrontendUrl = frontendUrl ? new URL(frontendUrl).origin : '';
      
      console.log('[START] Generating OAuth URL for frontend:', cleanFrontendUrl);
      
      // Generate cryptographic random state server-side
      const stateArray = new Uint8Array(32);
      crypto.getRandomValues(stateArray);
      const randomState = Array.from(stateArray, byte => byte.toString(16).padStart(2, '0')).join('');
      
      // Create state data with frontend URL
      const stateData = {
        frontend_url: cleanFrontendUrl,
        server_state: randomState
      };
      const state = btoa(JSON.stringify(stateData));
      
      console.log('[START] Generated state (first 8 chars):', state.substring(0, 8));
      
      // Initialize Supabase client
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      
      // Store state in database for server-side validation
      const { error: stateError } = await supabase
        .from('oauth_states')
        .insert({
          state_value: state,
          client_state: randomState,
          frontend_url: cleanFrontendUrl,
        });
      
      if (stateError) {
        console.error('[START] Failed to store OAuth state:', stateError);
        throw new Error('Failed to initialize OAuth flow');
      }
      
      console.log('[START] State stored in database');
      
      // Build HubSpot authorize URL
      const hubspotAuthUrl = new URL('https://app.hubspot.com/oauth/authorize');
      hubspotAuthUrl.searchParams.set('client_id', HUBSPOT_CLIENT_ID!);
      hubspotAuthUrl.searchParams.set('redirect_uri', 'https://ffbdcvvxiklzgfwrhbta.supabase.co/functions/v1/hubspot-oauth-exchange');
      hubspotAuthUrl.searchParams.set('scope', SCOPES);
      hubspotAuthUrl.searchParams.set('state', state);
      
      console.log('[START] Returning authorize URL to client');
      
      // Return URL to client as JSON
      return new Response(
        JSON.stringify({ 
          authorizeUrl: hubspotAuthUrl.toString() 
        }),
        {
          status: 200,
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
        }
      );
    }


    // Invalid path
    return new Response(
      JSON.stringify({
        error: 'Invalid endpoint. Use /start',
      }),
      {
        status: 404,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('HubSpot auth error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const allowedOrigins = ALLOWED_ORIGINS;
    
    // Use APP_BASE_URL as fallback origin
    const appOrigin = new URL(APP_BASE_URL!).origin;
    console.log('Error fallbackOrigin:', appOrigin);
    
    // Return HTML that sends error message via postMessage and closes popup
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Error</title>
      </head>
      <body>
        <script>
          (function() {
            const allowedOrigins = ${JSON.stringify(allowedOrigins)};
            const fallbackOrigin = '${appOrigin}';
            
            function isAllowedOrigin(origin) {
              // Check exact matches
              if (allowedOrigins.includes(origin)) {
                return true;
              }
              // Check if it's a Lovable project preview domain
              try {
                const url = new URL(origin);
                if (url.hostname.endsWith('.lovableproject.com')) {
                  return true;
                }
              } catch (e) {
                return false;
              }
              return false;
            }
            
            if (window.opener && window.opener.location) {
              try {
                const openerOrigin = window.opener.location.origin;
                console.log('[CALLBACK ERROR] openerOrigin:', openerOrigin);
                
                const isAllowed = isAllowedOrigin(openerOrigin);
                console.log('[CALLBACK ERROR] openerOrigin is allowed:', isAllowed);
                
                const targetOrigin = isAllowed ? openerOrigin : fallbackOrigin;
                console.log('[CALLBACK ERROR] targetOrigin:', targetOrigin);
                
                window.opener.postMessage({ 
                  type: 'hubspot-auth-error', 
                  source: 'hubspot',
                  error: '${errorMessage.replace(/'/g, "\\'")}'
                }, targetOrigin);
                
                window.close();
              } catch (e) {
                console.error('Error accessing opener origin:', e);
              }
            }
          })();
        </script>
      </body>
      </html>
    `;

    return new Response(html, {
      status: 500,
      headers: {
        ...headers,
        'Content-Type': 'text/html; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
});
