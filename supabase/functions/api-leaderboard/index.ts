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

interface StageCategories {
  openStageIds: Set<string>;
  closedWonStageIds: Set<string>;
  closedLostStageIds: Set<string>;
}

// Cache for stage categories per tenant
const stageCategoriesCache = new Map<string, { categories: StageCategories; timestamp: number }>();
const STAGE_CATEGORIES_CACHE_TTL = 3600000; // 1 hour

async function getStageCategories(tenant_id: string, supabase: any): Promise<StageCategories> {
  const cached = stageCategoriesCache.get(tenant_id);
  if (cached && Date.now() - cached.timestamp < STAGE_CATEGORIES_CACHE_TTL) {
    console.log('Using cached stage categories');
    return cached.categories;
  }

  console.log('Fetching pipeline configuration from HubSpot');
  
  // Get HubSpot token
  const { data: tokenData, error: tokenError } = await supabase
    .from('hubspot_tokens')
    .select('access_token')
    .eq('tenant_id', tenant_id)
    .single();

  if (tokenError || !tokenData) {
    console.error('Failed to get HubSpot token:', tokenError);
    return {
      openStageIds: new Set<string>(),
      closedWonStageIds: new Set<string>(),
      closedLostStageIds: new Set<string>(),
    };
  }

  try {
    // Fetch all pipelines from HubSpot
    const response = await fetch('https://api.hubapi.com/crm/v3/pipelines/deals', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch pipelines:', response.status);
      return {
        openStageIds: new Set<string>(),
        closedWonStageIds: new Set<string>(),
        closedLostStageIds: new Set<string>(),
      };
    }

    const data = await response.json();
    const openStageIds = new Set<string>();
    const closedWonStageIds = new Set<string>();
    const closedLostStageIds = new Set<string>();

    // Process all pipelines and categorize stages based on metadata flags
    if (data.results) {
      for (const pipeline of data.results) {
        console.log(`Processing pipeline: ${pipeline.label || pipeline.id}`);
        if (pipeline.stages) {
          for (const stage of pipeline.stages) {
            const isClosed = stage.metadata?.isClosed === 'true' || stage.metadata?.isClosed === true;
            const isWon = stage.metadata?.isWon === 'true' || stage.metadata?.isWon === true;
            
            if (!isClosed) {
              // Open stages
              openStageIds.add(stage.id);
            } else if (isWon) {
              // Closed Won stages
              closedWonStageIds.add(stage.id);
            } else {
              // Closed Lost stages
              closedLostStageIds.add(stage.id);
            }
          }
        }
      }
    }

    console.log(`Stage categorization complete:`);
    console.log(`- Open stages: ${openStageIds.size}`);
    console.log(`- Closed Won stages: ${closedWonStageIds.size}`);
    console.log(`- Closed Lost stages: ${closedLostStageIds.size}`);
    
    const categories: StageCategories = {
      openStageIds,
      closedWonStageIds,
      closedLostStageIds,
    };
    
    // Cache the result
    stageCategoriesCache.set(tenant_id, { categories, timestamp: Date.now() });
    
    return categories;
  } catch (error) {
    console.error('Error fetching stage categories:', error);
    return {
      openStageIds: new Set<string>(),
      closedWonStageIds: new Set<string>(),
      closedLostStageIds: new Set<string>(),
    };
  }
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

    // Get stage categories from HubSpot
    const stageCategories = await getStageCategories(tenant_id, supabase);

    // Fetch ALL deals from database (we'll filter by stage)
    console.log('Fetching deals from database...');
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
        closedate,
        hs_lastmodifieddate,
        users (
          id,
          full_name,
          email,
          hs_owner_id,
          is_active
        )
      `)
      .eq('tenant_id', tenant_id)
      .gt('amount', 0); // Only deals with amount > 0
    
    const { data: allDealsData, error: dealsError } = await dealsQuery;
    
    if (dealsError) {
      console.error('Failed to fetch deals:', dealsError);
      throw new Error('Failed to fetch deals from database');
    }
    
    console.log(`Fetched ${allDealsData?.length || 0} deals from database (amount > 0)`);
    
    // Filter deals based on stage categories
    let filteredByStage = allDealsData?.filter(deal => {
      if (!deal.dealstage) return false;
      
      const isOpen = stageCategories.openStageIds.has(deal.dealstage);
      const isClosedWon = stageCategories.closedWonStageIds.has(deal.dealstage);
      const isClosedLost = stageCategories.closedLostStageIds.has(deal.dealstage);
      
      if (!include_closed) {
        // Only open deals
        return isOpen;
      } else {
        // Include open deals + Closed Won from last 12 months
        if (isOpen) return true;
        
        if (isClosedWon && deal.closedate) {
          const closeDate = new Date(deal.closedate);
          const twelveMonthsAgo = new Date();
          twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
          return closeDate >= twelveMonthsAgo;
        }
        
        // Never include Closed Lost
        return false;
      }
    });
    
    console.log(`After stage filtering: ${filteredByStage?.length || 0} deals`);
    
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
      ? filteredByStage?.filter(d => d.owner_id && teamUserIds.has(d.owner_id))
      : filteredByStage;
    
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
      const existingAmount = existing.maxDeal ? parseFloat(String(existing.maxDeal.amount || 0)) : 0;
      
      // Update if this deal is larger, or if equal amount, use most recent
      if (!existing.maxDeal || dealAmount > existingAmount) {
        ownerDeals.set(deal.owner_id, {
          maxDeal: {
            id: deal.hubspot_deal_id,
            name: deal.dealname,
            amount: dealAmount,
            date: deal.closedate || deal.hs_lastmodifieddate,
          },
          user: existing.user,
        });
      } else if (dealAmount === existingAmount) {
        // Same amount - pick most recent
        const existingDate = existing.maxDeal.date ? new Date(existing.maxDeal.date) : new Date(0);
        const currentDate = deal.closedate ? new Date(deal.closedate) : 
                           deal.hs_lastmodifieddate ? new Date(deal.hs_lastmodifieddate) : new Date(0);
        
        if (currentDate > existingDate) {
          ownerDeals.set(deal.owner_id, {
            maxDeal: {
              id: deal.hubspot_deal_id,
              name: deal.dealname,
              amount: dealAmount,
              date: deal.closedate || deal.hs_lastmodifieddate,
            },
            user: existing.user,
          });
        }
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

    console.log(`Leaderboard generated with ${entries.length} entries`);

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
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
