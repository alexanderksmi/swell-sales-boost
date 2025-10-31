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
  userId?: number;
  userIdIncludingInactive?: number;
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

    console.log('Fetching ALL owners from HubSpot (including archived)...');
    // Fetch archived owners too since they might still have active deals
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
            console.log(`Found team: ${team.id} - ${team.name}`);
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
    
    // One-time fix: Update hs_owner_id for existing users where it's null
    // This ensures all users synced before this fix get their hs_owner_id populated
    const { data: usersToFix } = await supabase
      .from('users')
      .select('id, hubspot_user_id')
      .eq('tenant_id', tenant_id)
      .is('hs_owner_id', null)
      .not('hubspot_user_id', 'is', null);
    
    if (usersToFix && usersToFix.length > 0) {
      for (const user of usersToFix) {
        await supabase
          .from('users')
          .update({ hs_owner_id: user.hubspot_user_id })
          .eq('id', user.id);
      }
      console.log(`✓ Fixed hs_owner_id for ${usersToFix.length} existing users`);
    }
    
    for (const owner of owners) {
      // Deals reference owner.id in their hubspot_owner_id property
      if (!owner.id || !owner.email) {
        console.log(`Skipping owner without id or email: ${JSON.stringify(owner)}`);
        continue;
      }
      
      hubspotOwnerIds.add(owner.id); // Track by owner.id which deals use
      
      const userIdForLog = (owner.userId || owner.userIdIncludingInactive)?.toString() || 'none';
      console.log(`Processing owner: ${owner.id} (userId: ${userIdForLog}) - ${owner.email} - Teams: ${owner.teams?.map(t => t.name).join(', ') || 'none'}`);
      
      // Find existing user by email since hubspot_user_id may have changed
      const { data: existingUser } = await supabase
        .from('users')
        .select('id, hubspot_user_id, hs_owner_id')
        .eq('tenant_id', tenant_id)
        .eq('email', owner.email)
        .maybeSingle();
      
      const fullName = `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || owner.email;
      const userIdString = (owner.userId || owner.userIdIncludingInactive)?.toString() || owner.id;
      
      let userId: string;
      
      if (existingUser) {
        // Update existing user - hs_owner_id should match what deals use in hubspot_owner_id
        // Deals reference userId (not owner.id!) in their hubspot_owner_id property
        const { error: updateError } = await supabase
          .from('users')
          .update({
            hubspot_user_id: userIdString, // Store userId/userIdIncludingInactive
            hs_owner_id: userIdString, // Match deals' hubspot_owner_id (uses userId!)
            full_name: fullName,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingUser.id);
        
        if (updateError) {
          console.error(`❌ Failed to update user ${owner.id}:`, updateError);
          continue;
        }
        
        console.log(`✓ Updated user ${owner.id} - ${fullName}`);
        userId = existingUser.id;
      } else {
        // Insert new user - hs_owner_id should match deals' hubspot_owner_id (userId!)
        const { data: newUser, error: insertError } = await supabase
          .from('users')
          .insert({
            tenant_id,
            hubspot_user_id: userIdString,
            hs_owner_id: userIdString, // Match deals' hubspot_owner_id (uses userId!)
            email: owner.email,
            full_name: fullName,
            is_active: true,
          })
          .select('id')
          .single();

        if (insertError || !newUser) {
          console.error(`❌ Failed to insert user ${owner.id}:`, insertError);
          continue;
        }
        
        console.log(`✓ Inserted new user ${owner.id} - ${fullName}`);
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
      .select('id, hubspot_user_id, hs_owner_id')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true);

    if (allUsers) {
      let deactivatedCount = 0;
      for (const user of allUsers) {
        // Check if user's hs_owner_id is still in active owners (using userId not owner.id!)
        if (user.hs_owner_id && !hubspotOwnerIds.has(user.hs_owner_id)) {
          const { error: updateError } = await supabase
            .from('users')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', user.id);
          
          if (updateError) {
            console.error(`Failed to deactivate user ${user.hubspot_user_id}:`, updateError);
          } else {
            deactivatedCount++;
            console.log(`✓ Deactivated user: ${user.hubspot_user_id} (id: ${user.id})`);
          }
        }
      }
      console.log(`Total deactivated users: ${deactivatedCount}`);
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
