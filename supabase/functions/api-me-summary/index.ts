import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Extract tenant and user from request body or query params
    let tenant_id: string | null = null;
    let user_id: string | null = null;
    
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      tenant_id = body.tenant_id;
      user_id = body.user_id;
    } else {
      const url = new URL(req.url);
      tenant_id = url.searchParams.get('tenant_id');
      user_id = url.searchParams.get('user_id');
    }
    
    if (!tenant_id || !user_id) {
      throw new Error('tenant_id and user_id required');
    }

    console.log('Fetching summary for user:', user_id, 'tenant:', tenant_id);

    // Fetch user's HubSpot owner ID
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('hs_owner_id, email, full_name')
      .eq('id', user_id)
      .eq('tenant_id', tenant_id)
      .single();

    if (userError || !userData || !userData.hs_owner_id) {
      throw new Error('User not found or missing HubSpot owner ID');
    }

    const ownerIdToFind = userData.hs_owner_id;

    // Fetch leaderboard data
    const leaderboardResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/api-leaderboard`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tenant_id }),
      }
    );

    if (!leaderboardResponse.ok) {
      throw new Error('Failed to fetch leaderboard data');
    }

    const leaderboardData = await leaderboardResponse.json();
    const { full_list } = leaderboardData;

    // Find user's entry in leaderboard
    const myEntry = full_list.find((entry: any) => entry.owner_id === ownerIdToFind);

    if (!myEntry) {
      // User not on leaderboard yet
      return new Response(
        JSON.stringify({
          rank: null,
          total_pipeline: 0,
          largest_deal_amount: 0,
          largest_deal_name: null,
          total_entries: full_list.length,
          message: 'No deals found for your account',
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Fetch all user's deals to calculate total pipeline
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

    const syncData = await syncResponse.json();
    const myDeals = syncData.deals.filter((d: any) => d.owner_id === ownerIdToFind);
    
    // Calculate total pipeline value
    const totalPipeline = myDeals.reduce((sum: number, deal: any) => sum + deal.amount, 0);

    const summary = {
      rank: myEntry.rank,
      total_pipeline: totalPipeline,
      largest_deal_amount: myEntry.largest_deal_amount,
      largest_deal_name: myEntry.largest_deal_name,
      total_entries: full_list.length,
      deals_count: myDeals.length,
    };

    console.log('Summary generated:', summary);

    return new Response(
      JSON.stringify(summary),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'private, max-age=300',
        },
      }
    );
  } catch (error) {
    console.error('Summary error:', error);
    
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
