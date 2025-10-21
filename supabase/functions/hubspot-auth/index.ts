import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HUBSPOT_CLIENT_ID = Deno.env.get('HUBSPOT_CLIENT_ID');
const HUBSPOT_CLIENT_SECRET = Deno.env.get('HUBSPOT_CLIENT_SECRET');
const HUBSPOT_REDIRECT_URI = Deno.env.get('HUBSPOT_REDIRECT_URI');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// OAuth scopes required for HubSpot integration
const SCOPES = [
  'crm.objects.contacts.read',
  'crm.objects.deals.read',
  'crm.objects.owners.read',
  'crm.schemas.deals.read',
  'oauth',
].join(' ');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  console.log('HubSpot auth endpoint called:', path);

  try {
    // Route: /start - Initiate OAuth flow
    if (path.includes('/start')) {
      const hubspotAuthUrl = new URL('https://app.hubspot.com/oauth/authorize');
      hubspotAuthUrl.searchParams.set('client_id', HUBSPOT_CLIENT_ID!);
      hubspotAuthUrl.searchParams.set('redirect_uri', HUBSPOT_REDIRECT_URI!);
      hubspotAuthUrl.searchParams.set('scope', SCOPES);
      
      console.log('Redirecting to HubSpot OAuth:', hubspotAuthUrl.toString());
      
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          'Location': hubspotAuthUrl.toString(),
        },
      });
    }

    // Route: /callback - Handle OAuth callback
    if (path.includes('/callback')) {
      const code = url.searchParams.get('code');
      
      if (!code) {
        throw new Error('No authorization code provided');
      }

      console.log('Received OAuth code, exchanging for tokens');

      // Exchange code for access token
      const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: HUBSPOT_CLIENT_ID!,
          client_secret: HUBSPOT_CLIENT_SECRET!,
          redirect_uri: HUBSPOT_REDIRECT_URI!,
          code: code,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        console.error('Token exchange failed:', error);
        throw new Error(`Failed to exchange code for token: ${error}`);
      }

      const tokens = await tokenResponse.json();
      console.log('Tokens received successfully');

      // Fetch HubSpot account info to get portal ID
      const accountInfoResponse = await fetch('https://api.hubapi.com/oauth/v1/access-tokens/' + tokens.access_token);
      
      if (!accountInfoResponse.ok) {
        const error = await accountInfoResponse.text();
        console.error('Failed to fetch account info:', error);
        throw new Error(`Failed to fetch account info: ${error}`);
      }

      const accountInfo = await accountInfoResponse.json();
      const portalId = accountInfo.hub_id.toString();
      const hubspotUserId = accountInfo.user_id.toString();
      const userEmail = accountInfo.user || `user${hubspotUserId}@hubspot.local`;

      console.log('Portal ID:', portalId, 'User ID:', hubspotUserId);

      // Initialize Supabase admin client
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      // Upsert tenant with portal ID (using portal_id for upsert, tenant_id auto-generated)
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .upsert(
          {
            portal_id: portalId,
            hubspot_portal_id: portalId,
            company_name: `HubSpot Portal ${portalId}`,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'portal_id' }
        )
        .select()
        .single();

      if (tenantError) {
        console.error('Tenant upsert error:', tenantError);
        throw new Error(`Failed to create/update tenant: ${tenantError.message}`);
      }

      console.log('Tenant upserted:', tenant.id);

      // Check if this is the first user in the tenant to determine initial role
      const { data: existingUsers, error: usersCheckError } = await supabase
        .from('users')
        .select('id')
        .eq('tenant_id', tenant.id)
        .limit(1);

      if (usersCheckError) {
        console.error('Error checking existing users:', usersCheckError);
        throw new Error(`Failed to check existing users: ${usersCheckError.message}`);
      }

      const isFirstUser = !existingUsers || existingUsers.length === 0;
      const initialRole = isFirstUser ? 'org_admin' : 'sales_rep';

      console.log('Is first user:', isFirstUser, 'Initial role:', initialRole);

      // Upsert user: ON CONFLICT (tenant_id, email) UPDATE only hs fields, not role
      // First try to insert with role
      let user;
      let userError;
      
      const { data: insertedUser, error: insertError } = await supabase
        .from('users')
        .insert({
          tenant_id: tenant.id,
          email: userEmail,
          hubspot_user_id: hubspotUserId,
          hs_owner_id: hubspotUserId,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        // User exists, do update without touching role
        if (insertError.code === '23505') { // unique violation
          console.log('User exists, updating hs fields only');
          const { data: updatedUser, error: updateError } = await supabase
            .from('users')
            .update({
              hubspot_user_id: hubspotUserId,
              hs_owner_id: hubspotUserId,
              updated_at: new Date().toISOString(),
            })
            .eq('tenant_id', tenant.id)
            .eq('email', userEmail)
            .select()
            .single();
          
          if (updateError) {
            console.error('User update error:', updateError);
            throw new Error(`Failed to update user: ${updateError.message}`);
          }
          user = updatedUser;
        } else {
          console.error('User insert error:', insertError);
          throw new Error(`Failed to create user: ${insertError.message}`);
        }
      } else {
        user = insertedUser;
        
        // Only assign role if this is a new user
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({
            user_id: user.id,
            tenant_id: tenant.id,
            role: initialRole,
          });

        if (roleError && roleError.code !== '23505') { // ignore duplicate role
          console.error('Role assignment error:', roleError);
          throw new Error(`Failed to assign role: ${roleError.message}`);
        }

        console.log('New user created with role:', initialRole);
      }

      console.log('User processed:', user.id);

      // Store HubSpot tokens
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
      
      const { error: tokenError } = await supabase
        .from('hubspot_tokens')
        .upsert(
          {
            tenant_id: tenant.id,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id' }
        );

      if (tokenError) {
        console.error('Token storage error:', tokenError);
        throw new Error(`Failed to store tokens: ${tokenError.message}`);
      }

      console.log('Tokens stored successfully');

      // Create session JWT with tenant_id and user_id
      const sessionPayload = {
        tenant_id: tenant.id,
        user_id: user.id,
        email: userEmail,
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7), // 7 days
      };

      // Simple JWT creation (for production, use proper JWT library)
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify(sessionPayload));
      const jwtSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      
      // Create signature using Web Crypto API
      const encoder = new TextEncoder();
      const data = encoder.encode(`${header}.${payload}`);
      const keyData = encoder.encode(jwtSecret);
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, data);
      const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      
      const sessionToken = `${header}.${payload}.${signature}`;

      console.log('Session JWT created, closing popup');

      // Get frontend origin from redirect URI
      const frontendOrigin = new URL(HUBSPOT_REDIRECT_URI!).origin;

      // Return HTML that sends postMessage and closes the popup
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authentication Success</title>
        </head>
        <body>
          <script>
            // Send success message to parent window
            if (window.opener) {
              window.opener.postMessage({ type: 'hubspot-auth-success' }, '${frontendOrigin}');
              window.close();
            } else {
              // Fallback if opened in same window
              window.location.href = '/app/leaderboard';
            }
          </script>
          <p>Authentication successful. This window should close automatically...</p>
        </body>
        </html>
      `;
      
      return new Response(html, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/html',
          'Set-Cookie': `swell_session=${sessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 7}`,
        },
      });
    }

    // Invalid path
    return new Response(
      JSON.stringify({
        error: 'Invalid endpoint. Use /start or /callback',
      }),
      {
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('HubSpot auth error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Get frontend origin from redirect URI
    const frontendOrigin = new URL(HUBSPOT_REDIRECT_URI!).origin;
    
    // Return HTML that sends error message and closes popup
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Error</title>
      </head>
      <body>
        <script>
          if (window.opener) {
            window.opener.postMessage({ 
              type: 'hubspot-auth-error', 
              error: '${errorMessage.replace(/'/g, "\\'")}'
            }, '${frontendOrigin}');
            window.close();
          } else {
            document.body.innerHTML = '<p>Error: ${errorMessage.replace(/'/g, "\\'")}</p>';
          }
        </script>
        <p>An error occurred during authentication...</p>
      </body>
      </html>
    `;

    return new Response(html, {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html',
      },
    });
  }
});
