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
    let include_closed = false;
    
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      tenant_id = body.tenant_id;
      team_id = body.team_id;
      include_closed = body.include_closed || false;
    } else {
      tenant_id = url.searchParams.get('tenant_id');
      team_id = url.searchParams.get('team_id');
      include_closed = url.searchParams.get('include_closed') === 'true';
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

    // Fetch deals directly from database
    console.log(`Fetching ${include_closed ? 'all' : 'open'} deals from database...`);
    let dealsQuery = supabase
      .from('deals')
      .select(`
        id,
        hubspot_deal_id,
        dealname,
        amount,
        pipeline,
        dealstage,
        hubspot_owner_id,
        owner_id,
        hs_is_closed,
        users (
          id,
          full_name,
          email,
          hs_owner_id,
          is_active
        )
      `)
      .eq('tenant_id', tenant_id);
    
    // Only filter by hs_is_closed if not including closed deals
    if (!include_closed) {
      dealsQuery = dealsQuery.eq('hs_is_closed', false);
    }
    
    const { data: openDealsData, error: dealsError } = await dealsQuery;
    
    if (dealsError) {
      console.error('Failed to fetch deals:', dealsError);
      throw new Error('Failed to fetch deals from database');
    }
    
    console.log(`Fetched ${openDealsData?.length || 0} open deals from database`);
    
    // Fetch team members if team filter is specified
    let teamUserIds: Set<string> | null = null;
    if (team_id) {
      const { data: teamUsers, error: teamUsersError } = await supabase
        .from('user_teams')
        .select('user_id')
        .eq('team_id', team_id);
      
      if (teamUsersError) {
        console.error('Failed to fetch team users:', teamUsersError);
        throw new Error('Failed to fetch team users');
      }
      
      teamUserIds = new Set(teamUsers?.map(tu => tu.user_id) || []);
      console.log(`Found ${teamUserIds.size} users in team ${team_id}`);
      
      if (teamUserIds.size === 0) {
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
    }
    
    // Filter deals by team if specified
    const filteredDeals = teamUserIds 
      ? openDealsData?.filter(d => d.owner_id && teamUserIds.has(d.owner_id))
      : openDealsData;
    
    console.log(`Processing ${filteredDeals?.length || 0} deals (after team filter)`);
    
    // Fetch all active users (filtered by team if specified)
    let usersQuery = supabase
      .from('users')
      .select('id, full_name, email, is_active')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true);
    
    // If team filter is specified, only get users in that team
    if (teamUserIds && teamUserIds.size > 0) {
      usersQuery = usersQuery.in('id', Array.from(teamUserIds));
    }
    
    const { data: activeUsers, error: usersError } = await usersQuery;
    
    if (usersError) {
      console.error('Failed to fetch users:', usersError);
      throw new Error('Failed to fetch users');
    }
    
    console.log(`Found ${activeUsers?.length || 0} active users`);
    
    // Group deals by owner and find largest deal per owner
    const ownerDeals = new Map<string, { maxDeal: any; user: any }>();

    // First, add all active users to the map (even without deals)
    activeUsers?.forEach((user) => {
      ownerDeals.set(user.id, {
        maxDeal: null,
        user,
      });
    });

    // Then update with actual deal data for those who have deals
    filteredDeals?.forEach((deal) => {
      if (!deal.owner_id || !deal.users) return;
      
      const user = Array.isArray(deal.users) ? deal.users[0] : deal.users;
      if (!user || !user.is_active) return;
      
      const existing = ownerDeals.get(deal.owner_id);
      if (!existing) return; // Skip if user not in our active users list
      
      const dealAmount = parseFloat(String(deal.amount || 0));
      
      if (!existing.maxDeal || dealAmount > parseFloat(String(existing.maxDeal.amount || 0))) {
        ownerDeals.set(deal.owner_id, {
          maxDeal: {
            id: deal.hubspot_deal_id,
            name: deal.dealname,
            amount: dealAmount,
          },
          user: existing.user,
        });
      }
    });

    // Build leaderboard entries
    const entries: LeaderboardEntry[] = [];
    
    ownerDeals.forEach((data, ownerId) => {
      entries.push({
        owner_id: ownerId,
        owner_name: data.user.full_name || 'Unknown',
        owner_email: data.user.email || '',
        largest_deal_amount: data.maxDeal?.amount || 0,
        largest_deal_name: data.maxDeal?.name || 'Ingen åpne deals',
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
