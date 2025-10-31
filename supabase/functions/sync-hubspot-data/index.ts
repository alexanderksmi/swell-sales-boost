import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

interface HubSpotOwner {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  teams?: Array<{
    id: string;
    name: string;
  }>;
}

interface HubSpotDeal {
  id: string;
  properties: {
    dealname: string;
    amount: string;
    pipeline: string;
    dealstage: string;
    closedate: string;
    hs_lastmodifieddate: string;
    hubspot_owner_id: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Extract tenant from authorization or body
    const { tenant_id } = await req.json();
    
    if (!tenant_id) {
      throw new Error('tenant_id required');
    }

    console.log('Syncing HubSpot data for tenant:', tenant_id);

    // Fetch HubSpot tokens
    const { data: tokenData, error: tokenError } = await supabase
      .from('hubspot_tokens')
      .select('access_token, refresh_token, expires_at')
      .eq('tenant_id', tenant_id)
      .single();

    if (tokenError || !tokenData) {
      throw new Error('No HubSpot token found for tenant');
    }

    let accessToken = tokenData.access_token;

    // Check if token is expired and refresh if needed
    const tokenExpiry = new Date(tokenData.expires_at);
    const now = new Date();
    
    if (tokenExpiry <= now) {
      console.log('Access token expired, refreshing...');
      
      const clientId = Deno.env.get('HUBSPOT_CLIENT_ID');
      const clientSecret = Deno.env.get('HUBSPOT_CLIENT_SECRET');
      
      if (!clientId || !clientSecret) {
        throw new Error('Missing HubSpot OAuth credentials');
      }
      
      const refreshResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: tokenData.refresh_token,
        }),
      });
      
      if (!refreshResponse.ok) {
        const error = await refreshResponse.text();
        throw new Error(`Token refresh failed: ${error}`);
      }
      
      const refreshData = await refreshResponse.json();
      const { access_token: newAccessToken, refresh_token: newRefreshToken, expires_in } = refreshData;
      
      // Update tokens in database
      const newExpiresAt = new Date(Date.now() + expires_in * 1000).toISOString();
      
      const { error: updateError } = await supabase
        .from('hubspot_tokens')
        .update({
          access_token: newAccessToken,
          refresh_token: newRefreshToken,
          expires_at: newExpiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenant_id);
      
      if (updateError) {
        console.error('Failed to update tokens:', updateError);
        throw new Error('Failed to update refreshed tokens');
      }
      
      accessToken = newAccessToken;
      console.log('Token refreshed successfully');
    }

    // Fetch owners from HubSpot with retry logic
    const fetchWithRetry = async (url: string, options: RequestInit, retries = 3): Promise<Response> => {
      for (let i = 0; i < retries; i++) {
        const response = await fetch(url, options);
        
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
          console.log(`Rate limited, waiting ${retryAfter}s...`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          continue;
        }
        
        return response;
      }
      
      throw new Error('Max retries exceeded');
    };

    console.log('Fetching owners from HubSpot...');
    const ownersResponse = await fetchWithRetry(
      'https://api.hubapi.com/crm/v3/owners?limit=100',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!ownersResponse.ok) {
      const error = await ownersResponse.text();
      throw new Error(`Failed to fetch owners: ${error}`);
    }

    const ownersData = await ownersResponse.json();
    const owners: HubSpotOwner[] = ownersData.results || [];
    
    console.log(`Fetched ${owners.length} owners`);

    // Sync teams from HubSpot owners
    console.log('Syncing teams...');
    const teamsMap = new Map<string, { id: string; name: string }>();
    
    for (const owner of owners) {
      if (owner.teams && owner.teams.length > 0) {
        for (const team of owner.teams) {
          if (team.id && team.name && !teamsMap.has(team.id)) {
            teamsMap.set(team.id, { id: team.id, name: team.name });
          }
        }
      }
    }

    // Upsert teams to database
    const teamIdMapping = new Map<string, string>(); // HubSpot team ID -> DB team UUID
    
    for (const [hubspotTeamId, teamData] of teamsMap) {
      const { data: existingTeam } = await supabase
        .from('teams')
        .select('id')
        .eq('tenant_id', tenant_id)
        .eq('hubspot_team_id', hubspotTeamId)
        .maybeSingle();

      if (existingTeam) {
        // Update existing team
        await supabase
          .from('teams')
          .update({
            name: teamData.name,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingTeam.id);
        
        teamIdMapping.set(hubspotTeamId, existingTeam.id);
      } else {
        // Insert new team
        const { data: newTeam } = await supabase
          .from('teams')
          .insert({
            tenant_id,
            hubspot_team_id: hubspotTeamId,
            name: teamData.name,
          })
          .select('id')
          .single();

        if (newTeam) {
          teamIdMapping.set(hubspotTeamId, newTeam.id);
        }
      }
    }

    console.log(`Synced ${teamIdMapping.size} teams`);

    // Sync users from HubSpot owners
    console.log('Syncing users...');
    const hubspotOwnerIds = new Set<string>();
    
    for (const owner of owners) {
      if (!owner.id || !owner.email) continue;
      
      hubspotOwnerIds.add(owner.id);
      
      // Upsert user
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('tenant_id', tenant_id)
        .eq('hubspot_user_id', owner.id)
        .maybeSingle();

      const fullName = `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || owner.email;
      
      let userId: string;
      
      if (existingUser) {
        // Update existing user
        await supabase
          .from('users')
          .update({
            email: owner.email,
            full_name: fullName,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingUser.id);
        
        userId = existingUser.id;
      } else {
        // Insert new user
        const { data: newUser } = await supabase
          .from('users')
          .insert({
            tenant_id,
            hubspot_user_id: owner.id,
            hs_owner_id: owner.id,
            email: owner.email,
            full_name: fullName,
            is_active: true,
          })
          .select('id')
          .single();

        if (!newUser) continue;
        userId = newUser.id;
        
        // Assign sales_rep role to new users
        await supabase
          .from('user_roles')
          .insert({
            tenant_id,
            user_id: userId,
            role: 'sales_rep',
          });
      }

      // Sync user-team relationships
      if (owner.teams && owner.teams.length > 0) {
        // Remove existing user-team relationships
        await supabase
          .from('user_teams')
          .delete()
          .eq('user_id', userId);

        // Add current team relationships
        for (const team of owner.teams) {
          if (team.id && teamIdMapping.has(team.id)) {
            const teamDbId = teamIdMapping.get(team.id);
            await supabase
              .from('user_teams')
              .insert({
                user_id: userId,
                team_id: teamDbId,
              });
          }
        }
      }
    }

    console.log(`Synced ${hubspotOwnerIds.size} users`);

    // Mark users as inactive if they're not in HubSpot anymore
    const { data: allUsers } = await supabase
      .from('users')
      .select('id, hubspot_user_id')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true);

    if (allUsers) {
      for (const user of allUsers) {
        if (user.hubspot_user_id && !hubspotOwnerIds.has(user.hubspot_user_id)) {
          await supabase
            .from('users')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', user.id);
          
          console.log(`Marked user ${user.hubspot_user_id} as inactive`);
        }
      }
    }

    // Fetch deals from HubSpot
    console.log('Fetching deals from HubSpot...');
    const dealsResponse = await fetchWithRetry(
      'https://api.hubapi.com/crm/v3/objects/deals?limit=100&properties=dealname,amount,pipeline,dealstage,closedate,hs_lastmodifieddate,hubspot_owner_id',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!dealsResponse.ok) {
      const error = await dealsResponse.text();
      throw new Error(`Failed to fetch deals: ${error}`);
    }

    const dealsData = await dealsResponse.json();
    const deals: HubSpotDeal[] = dealsData.results || [];
    
    console.log(`Fetched ${deals.length} deals`);

    // Store sync metadata
    const syncResult = {
      tenant_id,
      owners_count: owners.length,
      deals_count: deals.length,
      synced_at: new Date().toISOString(),
      owners,
      deals: deals.map(d => ({
        id: d.id,
        name: d.properties.dealname,
        amount: parseFloat(d.properties.amount || '0'),
        pipeline: d.properties.pipeline,
        stage: d.properties.dealstage,
        close_date: d.properties.closedate,
        last_modified: d.properties.hs_lastmodifieddate,
        owner_id: d.properties.hubspot_owner_id,
      })),
    };

    console.log('HubSpot sync completed successfully');

    return new Response(
      JSON.stringify(syncResult),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'private, max-age=300', // 5 min cache
        },
      }
    );
  } catch (error) {
    console.error('HubSpot sync error:', error);
    
    return new Response(
      JSON.stringify({
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
