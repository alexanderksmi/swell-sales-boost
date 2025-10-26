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
        // Get first user from tenant to fetch owner info
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('hubspot_user_id, email')
          .eq('tenant_id', tenant.id)
          .limit(1);

        if (usersError || !users || users.length === 0) {
          console.log(`No users found for tenant ${tenant.id}`);
          results.push({
            tenant_id: tenant.id,
            success: false,
            error: 'No users found',
          });
          continue;
        }

        const user = users[0];
        let newCompanyName = `HubSpot Portal ${tenant.portal_id}`;

        // Try to fetch owner info
        if (user.hubspot_user_id) {
          const ownerResponse = await fetch(
            `https://api.hubapi.com/crm/v3/owners/${user.hubspot_user_id}`,
            {
              headers: {
                'Authorization': `Bearer ${item.access_token}`,
              },
            }
          );

          if (ownerResponse.ok) {
            const ownerInfo = await ownerResponse.json();
            console.log(`HubSpot owner info for tenant ${tenant.id}:`, JSON.stringify(ownerInfo));
            
            if (ownerInfo.teams && ownerInfo.teams.length > 0 && ownerInfo.teams[0].name) {
              newCompanyName = ownerInfo.teams[0].name;
            } else if (user.email) {
              const emailDomain = user.email.split('@')[1];
              if (emailDomain && !emailDomain.includes('hubspot')) {
                newCompanyName = emailDomain.split('.')[0].charAt(0).toUpperCase() + emailDomain.split('.')[0].slice(1);
              }
            }
          }
        }

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
