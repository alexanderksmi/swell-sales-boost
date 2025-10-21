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

    const accessToken = tokenData.access_token;

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
