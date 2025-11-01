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

interface HubSpotPipelineStage {
  id: string;
  label: string;
  metadata: {
    isClosed?: string;
    probability?: string;
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

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429 && i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error('Max retries exceeded');
}

async function getClosedStageIds(tenantId: string, supabase: any): Promise<Set<string>> {
  console.log('Fetching pipeline configurations from HubSpot...');
  
  // Get HubSpot access token for this tenant
  const { data: tokenData, error: tokenError } = await supabase
    .from('hubspot_tokens')
    .select('access_token')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  
  if (tokenError || !tokenData?.access_token) {
    console.error('Failed to get HubSpot token:', tokenError);
    return new Set<string>();
  }
  
  const closedStageIds = new Set<string>();
  
  try {
    const pipelinesResponse = await fetchWithRetry(
      'https://api.hubapi.com/crm/v3/pipelines/deals',
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    const pipelinesData = await pipelinesResponse.json();
    
    if (pipelinesData.results) {
      for (const pipeline of pipelinesData.results) {
        if (pipeline.stages) {
          for (const stage of pipeline.stages) {
            const isClosed = stage.metadata?.isClosed === 'true' || stage.metadata?.isClosed === true;
            if (isClosed) {
              closedStageIds.add(stage.id);
              console.log(`Closed stage: ${stage.label} (${stage.id})`);
            }
          }
        }
      }
    }
    
    console.log(`Found ${closedStageIds.size} closed stage IDs`);
  } catch (error) {
    console.error('Failed to fetch pipeline configurations:', error);
  }
  
  return closedStageIds;
}

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
    
    console.log(`Fetching leaderboard for tenant: ${tenant_id}, team: ${team_id || 'all'}, include_closed: ${include_closed}`);

    // Fetch closed stage IDs from HubSpot
    const closedStageIds = await getClosedStageIds(tenant_id, supabase);

    // Fetch all deals from database (we'll filter by stage)
    console.log('Fetching all deals from database...');
    const dealsQuery = supabase
      .from('deals')
      .select(`
        id,
        hubspot_deal_id,
        dealname,
        amount,
        pipeline,
        dealstage,
        closedate,
        hs_lastmodifieddate,
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
      .eq('tenant_id', tenant_id)
      .not('amount', 'is', null)
      .gt('amount', 0);
    
    const { data: allDealsData, error: dealsError } = await dealsQuery;
    
    if (dealsError) {
      console.error('Failed to fetch deals:', dealsError);
      throw new Error('Failed to fetch deals from database');
    }
    
    console.log(`Fetched ${allDealsData?.length || 0} deals from database`);
    
    // Filter deals based on closed stages and toggle
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate());
    
    const filteredDealsPreTeam = allDealsData?.filter(deal => {
      if (!deal.dealstage) return false;
      
      const isClosedStage = closedStageIds.has(deal.dealstage);
      
      if (!include_closed) {
        // Only open deals (dealstage not in closed stages)
        return !isClosedStage;
      } else {
        // Include open deals AND Closed Won from last 12 months
        if (!isClosedStage) {
          return true; // Open deal
        }
        
        // For closed deals, check if it's won and within 12 months
        // Closed Won typically has "won" in the stage name or is marked as closed with amount > 0
        // We'll use hs_is_closed and closedate
        if (deal.closedate) {
          const closeDate = new Date(deal.closedate);
          const isWithin12Months = closeDate >= twelveMonthsAgo;
          
          // Only include if within 12 months and has amount (indicates won, not lost)
          return isWithin12Months && deal.amount && deal.amount > 0;
        }
        
        return false;
      }
    }) || [];
    
    console.log(`After stage filtering: ${filteredDealsPreTeam.length} deals`);
    
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
            },
          }
        );
      }
    }
    
    // Filter deals by team if specified
    const filteredDeals = teamUserIds 
      ? filteredDealsPreTeam.filter(d => d.owner_id && teamUserIds.has(d.owner_id))
      : filteredDealsPreTeam;
    
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
      
      // Pick the deal with highest amount, with tiebreaker by most recent date
      if (!existing.maxDeal) {
        ownerDeals.set(deal.owner_id, {
          maxDeal: {
            id: deal.hubspot_deal_id,
            name: deal.dealname,
            amount: dealAmount,
            closedate: deal.closedate,
            lastmodified: deal.hs_lastmodifieddate,
          },
          user: existing.user,
        });
      } else {
        const existingAmount = parseFloat(String(existing.maxDeal.amount || 0));
        
        if (dealAmount > existingAmount) {
          // Higher amount wins
          ownerDeals.set(deal.owner_id, {
            maxDeal: {
              id: deal.hubspot_deal_id,
              name: deal.dealname,
              amount: dealAmount,
              closedate: deal.closedate,
              lastmodified: deal.hs_lastmodifieddate,
            },
            user: existing.user,
          });
        } else if (dealAmount === existingAmount) {
          // Tiebreaker: use most recent date (closedate for closed, lastmodified for open)
          const dealDate = deal.closedate ? new Date(deal.closedate) : (deal.hs_lastmodifieddate ? new Date(deal.hs_lastmodifieddate) : new Date(0));
          const existingDate = existing.maxDeal.closedate ? new Date(existing.maxDeal.closedate) : (existing.maxDeal.lastmodified ? new Date(existing.maxDeal.lastmodified) : new Date(0));
          
          if (dealDate > existingDate) {
            ownerDeals.set(deal.owner_id, {
              maxDeal: {
                id: deal.hubspot_deal_id,
                name: deal.dealname,
                amount: dealAmount,
                closedate: deal.closedate,
                lastmodified: deal.hs_lastmodifieddate,
              },
              user: existing.user,
            });
          }
        }
      }
    });

    // Build leaderboard entries
    const entries: LeaderboardEntry[] = [];
    
    ownerDeals.forEach((data, ownerId) => {
      // Only include users who have at least one deal matching our criteria
      if (data.maxDeal) {
        entries.push({
          owner_id: ownerId,
          owner_name: data.user.full_name || 'Unknown',
          owner_email: data.user.email || '',
          largest_deal_amount: data.maxDeal.amount || 0,
          largest_deal_name: data.maxDeal.name || 'Ingen deal',
          rank: 0, // Will be set after sorting
        });
      }
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

    console.log(`Leaderboard generated with ${entries.length} entries`);

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
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
