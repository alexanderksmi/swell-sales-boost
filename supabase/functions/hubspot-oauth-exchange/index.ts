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

    const appBaseUrl = Deno.env.get('APP_BASE_URL') || '';
    const clientId = Deno.env.get('HUBSPOT_CLIENT_ID');
    const clientSecret = Deno.env.get('HUBSPOT_CLIENT_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!code || !state) {
      console.error('Missing code or state parameter');
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${appBaseUrl}/auth/hubspot/callback?error=missing_parameters`,
        },
      });
    }

    if (!clientId || !clientSecret || !appBaseUrl) {
      console.error('Missing required environment variables');
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${appBaseUrl}/auth/hubspot/callback?error=server_configuration`,
        },
      });
    }

    console.log('Validating OAuth state');

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate state against database
    const { data: stateData, error: stateError } = await supabase
      .from('oauth_states')
      .select('*')
      .eq('state_value', state)
      .eq('used', false)
      .maybeSingle();

    if (stateError || !stateData) {
      console.error('Invalid or expired OAuth state:', stateError);
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${appBaseUrl}/auth/hubspot/callback?error=state_mismatch`,
        },
      });
    }

    // Check if state is expired
    if (new Date(stateData.expires_at) < new Date()) {
      console.error('OAuth state expired');
      await supabase.from('oauth_states').delete().eq('id', stateData.id);
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${appBaseUrl}/auth/hubspot/callback?error=state_expired`,
        },
      });
    }

    // Mark state as used
    await supabase
      .from('oauth_states')
      .update({ used: true })
      .eq('id', stateData.id);

    console.log('State validated successfully');

    // Token exchange with HubSpot - use hardcoded redirect_uri to match authorize step
    const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: 'https://ffbdcvvxiklzgfwrhbta.supabase.co/functions/v1/hubspot-oauth-exchange',
        code: code,
      }),
    });

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', await tokenResponse.text());
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${appBaseUrl}/auth/hubspot/callback?error=token_exchange_failed`,
        },
      });
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    // Fetch user info from HubSpot
    const userInfoResponse = await fetch('https://api.hubapi.com/oauth/v1/access-tokens/' + access_token);
    const userInfo = await userInfoResponse.json();
    const portalId = userInfo.hub_id.toString();
    const hubspotUserId = userInfo.user_id.toString();
    const userEmail = userInfo.user || `user${hubspotUserId}@hubspot.local`;

    console.log('HubSpot user info:', { portalId, hubspotUserId, userEmail });

    // Fetch account info to get company name
    let companyName = `HubSpot Portal ${portalId}`;
    try {
      const accountInfoResponse = await fetch(
        'https://api.hubapi.com/account-info/v3/details',
        {
          headers: {
            'Authorization': `Bearer ${access_token}`,
          },
        }
      );
      
      if (accountInfoResponse.ok) {
        const accountInfo = await accountInfoResponse.json();
        if (accountInfo.portalName) {
          companyName = accountInfo.portalName;
          console.log('Retrieved company name from HubSpot:', companyName);
        }
      } else {
        console.log('Failed to fetch account info, using default company name');
      }
    } catch (error) {
      console.log('Error fetching account info:', error);
    }

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    // Upsert tenant with portal ID and company name
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .upsert(
        {
          portal_id: portalId,
          hubspot_portal_id: portalId,
          company_name: companyName,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'portal_id' }
      )
      .select()
      .single();

    if (tenantError || !tenant) {
      console.error('Tenant upsert error:', tenantError);
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${appBaseUrl}/auth/hubspot/callback?error=tenant_creation_failed`,
        },
      });
    }

    console.log('Tenant upserted:', tenant.id);

    // Check if this is the first user in the tenant
    const { data: existingUsers } = await supabase
      .from('users')
      .select('id')
      .eq('tenant_id', tenant.id)
      .limit(1);

    const isFirstUser = !existingUsers || existingUsers.length === 0;
    const initialRole = isFirstUser ? 'org_admin' : 'sales_rep';

    // Upsert user
    let user;
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
      if (insertError.code === '23505') {
        // User exists, update hs fields only
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
          return new Response(null, {
            status: 302,
            headers: {
              'Location': `${appBaseUrl}/auth/hubspot/callback?error=user_update_failed`,
            },
          });
        }
        user = updatedUser;
      } else {
        console.error('User insert error:', insertError);
        return new Response(null, {
          status: 302,
          headers: {
            'Location': `${appBaseUrl}/auth/hubspot/callback?error=user_creation_failed`,
          },
        });
      }
    } else {
      user = insertedUser;

      // Assign role for new user
      await supabase
        .from('user_roles')
        .insert({
          user_id: user.id,
          tenant_id: tenant.id,
          role: initialRole,
        });

      console.log('New user created with role:', initialRole);
    }

    console.log('User processed:', user.id);

    // Store HubSpot tokens tied to tenant
    const { error: tokenError } = await supabase
      .from('hubspot_tokens')
      .upsert(
        {
          tenant_id: tenant.id,
          access_token,
          refresh_token,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id' }
      );

    if (tokenError) {
      console.error('Token storage error (details hidden for security)');
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${appBaseUrl}/auth/hubspot/callback?error=token_storage_failed`,
        },
      });
    }

    console.log('HubSpot tokens stored for tenant:', tenant.id);

    // Create session JWT
    const sessionPayload = {
      tenant_id: tenant.id,
      user_id: user.id,
      email: userEmail,
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7), // 7 days
    };

    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify(sessionPayload));
    const jwtSecret = supabaseKey;

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

    // Generate unique session key
    const sessionKey = crypto.randomUUID();

    // Save session to database
    const { error: sessionError } = await supabase
      .from('auth_sessions')
      .insert({
        session_key: sessionKey,
        session_token: sessionToken
      });

    if (sessionError) {
      console.error('Failed to save session:', sessionError);
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${appBaseUrl}/auth/hubspot/callback?error=session_creation_failed`,
        },
      });
    }

    console.log('Session created, redirecting to callback with session_key');

    // Redirect to callback with session_key
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `${appBaseUrl}/auth/hubspot/callback?ok=1&session_key=${sessionKey}`,
      },
    });

  } catch (error) {
    console.error('Error in hubspot-oauth-exchange:', error);
    const appBaseUrl = Deno.env.get('APP_BASE_URL') || '';
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `${appBaseUrl}/auth/hubspot/callback?error=unexpected_error`,
      },
    });
  }
});
