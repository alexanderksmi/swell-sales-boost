import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting tenant name sync...');

    // Get all tenants with their tokens
    const { data: tenantsWithTokens, error: fetchError } = await supabase
      .from('hubspot_tokens')
      .select(`
        tenant_id,
        access_token,
        tenants (
          id,
          portal_id,
          company_name
        )
      `);

    if (fetchError) {
      throw new Error(`Failed to fetch tenants: ${fetchError.message}`);
    }

    if (!tenantsWithTokens || tenantsWithTokens.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No tenants found to sync' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Found ${tenantsWithTokens.length} tenants to sync`);

    const results = [];

    // Update each tenant's company name from HubSpot
    for (const item of tenantsWithTokens) {
      const tenant = Array.isArray(item.tenants) ? item.tenants[0] : item.tenants;
      
      if (!tenant) {
        console.log(`Skipping - no tenant data for token`);
        continue;
      }

      console.log(`Syncing tenant ${tenant.id} (portal: ${tenant.portal_id})`);

      try {
        // Fetch account info from HubSpot
        const accountInfoResponse = await fetch(
          'https://api.hubapi.com/account-info/v3/details',
          {
            headers: {
              'Authorization': `Bearer ${item.access_token}`,
            },
          }
        );

        if (accountInfoResponse.ok) {
          const accountInfo = await accountInfoResponse.json();
          console.log(`HubSpot account info for portal ${tenant.portal_id}:`, JSON.stringify(accountInfo));
          const newCompanyName = accountInfo.portalName || accountInfo.name || `HubSpot Portal ${tenant.portal_id}`;

          console.log(`Updating ${tenant.company_name} -> ${newCompanyName}`);

          // Update tenant with new company name
          const { error: updateError } = await supabase
            .from('tenants')
            .update({
              company_name: newCompanyName,
              updated_at: new Date().toISOString(),
            })
            .eq('id', tenant.id);

          if (updateError) {
            console.error(`Failed to update tenant ${tenant.id}:`, updateError);
            results.push({
              tenant_id: tenant.id,
              success: false,
              error: updateError.message,
            });
          } else {
            results.push({
              tenant_id: tenant.id,
              success: true,
              old_name: tenant.company_name,
              new_name: newCompanyName,
            });
          }
        } else {
          const errorText = await accountInfoResponse.text();
          console.error(`Failed to fetch account info for tenant ${tenant.id}:`, errorText);
          results.push({
            tenant_id: tenant.id,
            success: false,
            error: `HubSpot API error: ${accountInfoResponse.status}`,
          });
        }
      } catch (error) {
        console.error(`Error syncing tenant ${tenant.id}:`, error);
        results.push({
          tenant_id: tenant.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('Tenant name sync completed');

    return new Response(
      JSON.stringify({
        message: 'Sync completed',
        total: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Tenant sync error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
