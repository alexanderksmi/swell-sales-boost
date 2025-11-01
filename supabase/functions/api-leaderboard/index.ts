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

// Cache for pipeline stage categories
interface StageCategories {
  openStageIds: Set<string>;
  closedWonStageIds: Set<string>;
  closedLostStageIds: Set<string>;
}

const stageCategoriesCache = new Map<string, { data: StageCategories; timestamp: number }>();
const STAGE_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Function to fetch and categorize pipeline stages from HubSpot
async function getStageCategories(tenantId: string): Promise<StageCategories> {
  const cached = stageCategoriesCache.get(tenantId);
  
  if (cached && Date.now() - cached.timestamp < STAGE_CACHE_TTL) {
    console.log('Using cached stage categories');
    return cached.data;
  }

  console.log('Fetching pipeline stages from HubSpot...');
  
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  
  // Get HubSpot access token
  const { data: tokenData, error: tokenError } = await supabase
    .from('hubspot_tokens')
    .select('access_token')
    .eq('tenant_id', tenantId)
    .single();
  
  if (tokenError || !tokenData) {
    console.error('Failed to get HubSpot token:', tokenError);
    throw new Error('Failed to get HubSpot access token');
  }

  // Fetch all pipelines from HubSpot
  const response = await fetch('https://api.hubapi.com/crm/v3/pipelines/deals', {
    headers: {
      'Authorization': `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error('HubSpot API error:', response.status, await response.text());
    throw new Error('Failed to fetch pipelines from HubSpot');
  }

  const pipelinesData = await response.json();
  
  const openStageIds = new Set<string>();
  const closedWonStageIds = new Set<string>();
  const closedLostStageIds = new Set<string>();

  // Helper to convert to boolean
  const toBool = (val: any): boolean => {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') return val.toLowerCase() === 'true';
    return false;
  };

  // Process all pipelines and their stages - metadata-based with fallback to label
  for (const pipeline of pipelinesData.results || []) {
    console.log(`Processing pipeline: ${pipeline.label} (${pipeline.id})`);
    
    for (const stage of pipeline.stages || []) {
      const isClosed = toBool(stage.metadata?.isClosed);
      const isWon = toBool(stage.metadata?.isWon);
      
      console.log(`Stage ${stage.id} (${stage.label}):`, {
        isClosed,
        isWon,
        metadata: stage.metadata
      });
      
      // Metadata-based categorization first
      if (isClosed && isWon) {
        closedWonStageIds.add(stage.id);
        console.log(`  → Closed Won`);
      } else if (isClosed && !isWon) {
        closedLostStageIds.add(stage.id);
        console.log(`  → Closed Lost`);
      } else if (!isClosed) {
        openStageIds.add(stage.id);
        console.log(`  → Open`);
      } else {
        // Fallback to label if metadata is ambiguous
        const labelLower = (stage.label || '').toLowerCase();
        if (labelLower.includes('won') || labelLower.includes('vunnet')) {
          closedWonStageIds.add(stage.id);
          console.log(`  → Closed Won (from label)`);
        } else if (labelLower.includes('lost') || labelLower.includes('tapt')) {
          closedLostStageIds.add(stage.id);
          console.log(`  → Closed Lost (from label)`);
        } else {
          openStageIds.add(stage.id);
          console.log(`  → Open (fallback)`);
        }
      }
    }
  }
  
  console.log('Stage categories:', {
    open: Array.from(openStageIds),
    closedWon: Array.from(closedWonStageIds),
    closedLost: Array.from(closedLostStageIds)
  });

  const categories: StageCategories = {
    openStageIds,
    closedWonStageIds,
    closedLostStageIds,
  };

  console.log(`Categorized stages - Open: ${openStageIds.size}, Won: ${closedWonStageIds.size}, Lost: ${closedLostStageIds.size}`);

  // Cache the result
  stageCategoriesCache.set(tenantId, { data: categories, timestamp: Date.now() });

  return categories;
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
    
    console.log(`Fetching leaderboard for tenant: ${tenant_id}, team: ${team_id || 'all'}`);

    // Get stage categories from HubSpot pipelines
    const stageCategories = await getStageCategories(tenant_id);

    // Fetch all deals with amount > 0 from database
    console.log('Fetching deals from database...');
    const { data: allDealsData, error: dealsError } = await supabase
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
      .gt('amount', 0);
    
    if (dealsError) {
      console.error('Failed to fetch deals:', dealsError);
      throw new Error('Failed to fetch deals from database');
    }
    
    console.log(`Total deals fetched: ${allDealsData?.length || 0}`);
    console.log('Deal filtering - sample stages:', {
      totalDeals: allDealsData?.length || 0,
      sampleDealStages: allDealsData?.slice(0, 5).map(d => ({ 
        name: d.dealname, 
        stage: d.dealstage,
        amount: d.amount 
      }))
    });

    // Filter deals based on stage categories
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const filteredByStage = allDealsData?.filter(deal => {
      if (!deal.dealstage) return false;

      // Always exclude Closed Lost
      if (stageCategories.closedLostStageIds.has(deal.dealstage)) {
        return false;
      }

      // Include all open deals
      if (stageCategories.openStageIds.has(deal.dealstage)) {
        return true;
      }

      // If include_closed is true, include Closed Won from last 12 months
      if (include_closed && stageCategories.closedWonStageIds.has(deal.dealstage)) {
        if (deal.closedate) {
          const closeDate = new Date(deal.closedate);
          return closeDate >= twelveMonthsAgo;
        }
      }

      return false;
    });

    console.log('After stage filtering:', {
      filteredCount: filteredByStage?.length || 0,
      openDeals: filteredByStage?.filter(d => stageCategories.openStageIds.has(d.dealstage)).length || 0,
      closedWonDeals: filteredByStage?.filter(d => stageCategories.closedWonStageIds.has(d.dealstage)).length || 0,
      closedLostDeals: filteredByStage?.filter(d => stageCategories.closedLostStageIds.has(d.dealstage)).length || 0
    });
    
    const openDealsData = filteredByStage;
    
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
            closedate: deal.closedate,
            lastModified: deal.hs_lastmodifieddate,
          },
          user: existing.user,
        });
      } else if (dealAmount === parseFloat(String(existing.maxDeal.amount || 0))) {
        // If amounts are equal, prefer the newer deal
        const existingDate = new Date(existing.maxDeal.closedate || existing.maxDeal.lastModified || 0);
        const newDate = new Date(deal.closedate || deal.hs_lastmodifieddate || 0);
        
        if (newDate > existingDate) {
          ownerDeals.set(deal.owner_id, {
            maxDeal: {
              id: deal.hubspot_deal_id,
              name: deal.dealname,
              amount: dealAmount,
              closedate: deal.closedate,
              lastModified: deal.hs_lastmodifieddate,
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
