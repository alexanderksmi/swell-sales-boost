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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

interface Deal {
  id: string;
  name: string;
  amount: number;
  pipeline: string;
  stage: string;
  close_date: string;
  last_modified: string;
  properties: {
    hubspot_owner_id: string;
  };
}

interface LeaderboardEntry {
  owner_id: string;
  owner_name: string;
  owner_email: string;
  largest_deal_amount: number;
  largest_deal_name: string;
  rank: number;
}

// Cache disabled to always fetch fresh data
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 0; // Cache disabled

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers = getCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname;

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Extract tenant and optional team_id from request
    let tenant_id: string | null = null;
    let team_id: string | null = null;
    
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      tenant_id = body.tenant_id;
      team_id = body.team_id;
    } else {
      tenant_id = url.searchParams.get('tenant_id');
      team_id = url.searchParams.get('team_id');
    }
    
    if (!tenant_id) {
      throw new Error('tenant_id required');
    }
    
    console.log(`Fetching leaderboard for tenant: ${tenant_id}, team: ${team_id || 'all'}`);

    const cacheKey = `${tenant_id}-${path}`;
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('Returning cached data');
      return new Response(
        JSON.stringify(cached.data),
        {
          status: 200,
          headers: {
            ...headers,
            'Content-Type': 'application/json',
            'X-Cache': 'HIT',
          },
        }
      );
    }

    // Fetch fresh HubSpot data
    console.log('Fetching fresh HubSpot data...');
    const syncResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/sync-hubspot-data`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tenant_id }),
      }
    );

    if (!syncResponse.ok) {
      throw new Error('Failed to sync HubSpot data');
    }

    const syncData = await syncResponse.json();
    const { deals } = syncData;

    // Fetch users from database with optional team filter
    // TEMPORARY: Removed is_active filter to show all users while debugging sync issue
    let usersQuery = supabase
      .from('users')
      .select('id, hubspot_user_id, hs_owner_id, full_name, email, is_active')
      .eq('tenant_id', tenant_id);
    
    // If team filter is provided, join with user_teams
    if (team_id) {
      const { data: teamUsers, error: teamUsersError } = await supabase
        .from('user_teams')
        .select('user_id')
        .eq('team_id', team_id);
      
      if (teamUsersError) {
        console.error('Failed to fetch team users:', teamUsersError);
        throw new Error('Failed to fetch team users');
      }
      
      const userIds = teamUsers?.map(tu => tu.user_id) || [];
      console.log(`Found ${userIds.length} users in team ${team_id}`);
      
      if (userIds.length === 0) {
        console.log('No users in selected team, returning empty leaderboard');
        return new Response(
          JSON.stringify({
            category: 'Størst deal i pipeline',
            top_3: [],
            full_list: [],
            total_entries: 0,
            last_updated: new Date().toISOString(),
          }),
          {
            status: 200,
            headers: {
              ...headers,
              'Content-Type': 'application/json',
              'X-Cache': 'MISS',
            },
          }
        );
      }
      
      usersQuery = usersQuery.in('id', userIds);
    }
    
    const { data: activeUsers, error: usersError } = await usersQuery;
    
    if (usersError) {
      console.error('Failed to fetch active users:', usersError);
      throw new Error('Failed to fetch active users');
    }
    
    const activeCount = activeUsers?.filter(u => u.is_active).length || 0;
    console.log(`Found ${activeUsers?.length || 0} total users (${activeCount} active)${team_id ? ' in team' : ''}`);
    
    // Create a map of HubSpot owner IDs to user info
    const ownerMap = new Map(
      activeUsers?.map(u => [String(u.hs_owner_id), u]) || []
    );
    
    console.log(`OwnerMap keys (first 10):`, Array.from(ownerMap.keys()).slice(0, 10));
    console.log(`OwnerMap size: ${ownerMap.size}`);

    // Fetch closed stages to filter out
    const { data: dealStagesData } = await supabase
      .from('org_defaults')
      .select('setting_value')
      .eq('tenant_id', tenant_id)
      .eq('setting_key', 'closed_deal_stages')
      .maybeSingle();

    const closedStages = dealStagesData?.setting_value?.stages || ['closedwon', 'closedlost'];

    // Filter out closed deals
    let openDeals: Deal[] = deals.filter(
      (d: Deal) => !closedStages.some((stage: string) => 
        d.stage.toLowerCase().includes(stage.toLowerCase())
      )
    );

    console.log(`Processing ${openDeals.length} open deals`);
    
    // Filter deals by team if team_id is specified
    if (team_id) {
      const teamOwnerIds = new Set(Array.from(ownerMap.keys()));
      const dealsBeforeFilter = openDeals.length;
      openDeals = openDeals.filter(d => 
        teamOwnerIds.has(String(d.properties.hubspot_owner_id))
      );
      console.log(`Filtered deals from ${dealsBeforeFilter} to ${openDeals.length} for team ${team_id}`);
    }
    
    // Log first few owner_ids from deals
    const dealOwnerIds = openDeals.map(d => d.properties.hubspot_owner_id).filter(Boolean);
    console.log(`Deal owner_ids (first 10):`, dealOwnerIds.slice(0, 10));
    console.log(`Deal owner_ids types:`, dealOwnerIds.slice(0, 3).map(id => `${id} (${typeof id})`));

    // Group by owner and find largest deal per owner
    const ownerDeals = new Map<string, { maxDeal: Deal; totalPipeline: number }>();

    openDeals.forEach((deal: Deal) => {
      const ownerId = String(deal.properties.hubspot_owner_id);
      if (!ownerId) return;

      const existing = ownerDeals.get(ownerId);
      
      if (!existing || deal.amount > existing.maxDeal.amount) {
        ownerDeals.set(ownerId, {
          maxDeal: deal,
          totalPipeline: (existing?.totalPipeline || 0) + deal.amount,
        });
      } else {
        existing.totalPipeline += deal.amount;
      }
    });

    // Build leaderboard entries - only for active users
    const entries: LeaderboardEntry[] = [];
    
    ownerDeals.forEach((data, ownerId) => {
      const user = ownerMap.get(ownerId);
      
      if (!user) {
        console.log(`Skipping inactive/unknown owner: ${ownerId}`);
        return; // Skip inactive or users not in the team
      }
      
      entries.push({
        owner_id: ownerId,
        owner_name: user.full_name || 'Unknown',
        owner_email: user.email || '',
        largest_deal_amount: data.maxDeal.amount,
        largest_deal_name: data.maxDeal.name,
        rank: 0, // Will be set after sorting
      });
    });

    // Sort by largest deal amount descending
    entries.sort((a, b) => b.largest_deal_amount - a.largest_deal_amount);
    
    // Assign ranks
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    const result = {
      category: 'Størst deal i pipeline',
      top_3: entries.slice(0, 3),
      full_list: entries,
      total_entries: entries.length,
      last_updated: new Date().toISOString(),
    };

    // Cache the result
    cache.set(cacheKey, { data: result, timestamp: Date.now() });

    console.log(`Leaderboard generated with ${entries.length} entries`);

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'X-Cache': 'MISS',
          'Cache-Control': 'private, max-age=300',
        },
      }
    );
  } catch (error) {
    console.error('Leaderboard error:', error);
    
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
