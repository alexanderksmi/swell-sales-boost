import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface HubSpotDeal {
  id: string;
  properties: {
    dealname: string;
    hubspot_owner_id: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Get tenant_id from query params or request body
    const url = new URL(req.url);
    const tenant_id = url.searchParams.get('tenant_id');

    if (!tenant_id) {
      throw new Error('tenant_id is required as query parameter');
    }

    console.log(`Checking owner matching for tenant: ${tenant_id}`);

    // Get HubSpot access token
    const { data: tokenData, error: tokenError } = await supabase
      .from('hubspot_tokens')
      .select('access_token')
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    if (tokenError || !tokenData) {
      throw new Error('No HubSpot token found');
    }

    const accessToken = tokenData.access_token;

    // Fetch 20 open deals from HubSpot
    console.log('Fetching 20 open deals from HubSpot...');
    const dealsResponse = await fetch(
      'https://api.hubapi.com/crm/v3/objects/deals?limit=20&properties=dealname,hubspot_owner_id',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!dealsResponse.ok) {
      throw new Error(`Failed to fetch deals: ${await dealsResponse.text()}`);
    }

    const dealsData = await dealsResponse.json();
    const deals: HubSpotDeal[] = dealsData.results || [];

    console.log(`Fetched ${deals.length} deals`);

    // Fetch all active users from database
    const { data: activeUsers, error: usersError } = await supabase
      .from('users')
      .select('hs_owner_id, full_name, email')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true);

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }

    // Build a set of active owner IDs from database
    const activeOwnerIds = new Set(
      activeUsers?.map(u => u.hs_owner_id).filter(Boolean) || []
    );

    console.log(`Found ${activeOwnerIds.size} active owner IDs in database`);
    console.log(`Active owner IDs (first 10):`, Array.from(activeOwnerIds).slice(0, 10));

    // Check for unmatched owners
    const unmatchedOwners: Array<{ dealId: string; dealName: string; ownerId: string }> = [];
    const matchedCount = { matched: 0, unmatched: 0 };

    for (const deal of deals) {
      const ownerId = deal.properties.hubspot_owner_id;
      
      if (!ownerId) {
        console.log(`Deal ${deal.id} (${deal.properties.dealname}) has no owner`);
        continue;
      }

      if (activeOwnerIds.has(ownerId)) {
        matchedCount.matched++;
        console.log(`✓ Deal ${deal.id} owner ${ownerId} matched`);
      } else {
        matchedCount.unmatched++;
        unmatchedOwners.push({
          dealId: deal.id,
          dealName: deal.properties.dealname,
          ownerId: ownerId,
        });
        console.log(`✗ Deal ${deal.id} (${deal.properties.dealname}) owner ${ownerId} NOT matched`);
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Total deals checked: ${deals.length}`);
    console.log(`Matched: ${matchedCount.matched}`);
    console.log(`Unmatched: ${matchedCount.unmatched}`);

    return new Response(
      JSON.stringify({
        success: true,
        totalDealsChecked: deals.length,
        matched: matchedCount.matched,
        unmatched: matchedCount.unmatched,
        unmatchedOwners: unmatchedOwners.slice(0, 20),
        activeOwnerIdsCount: activeOwnerIds.size,
        sampleActiveOwnerIds: Array.from(activeOwnerIds).slice(0, 10),
      }, null, 2),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error) {
    console.error('Debug check error:', error);
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
