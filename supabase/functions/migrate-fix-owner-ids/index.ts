import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface HubSpotOwner {
  id: string;
  email: string;
  userId?: number;
  userIdIncludingInactive?: number;
  firstName?: string;
  lastName?: string;
  archived: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { tenant_id } = await req.json();

    if (!tenant_id) {
      throw new Error('tenant_id is required');
    }

    console.log(`Starting owner ID migration for tenant: ${tenant_id}`);

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

    // Fetch ALL owners from HubSpot (both active and archived)
    console.log('Fetching all owners from HubSpot...');
    const ownersResponse = await fetch(
      'https://api.hubapi.com/crm/v3/owners/?limit=500&archived=false',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!ownersResponse.ok) {
      throw new Error(`Failed to fetch owners: ${await ownersResponse.text()}`);
    }

    const ownersData = await ownersResponse.json();
    const activeOwners: HubSpotOwner[] = ownersData.results || [];

    // Fetch archived owners
    const archivedResponse = await fetch(
      'https://api.hubapi.com/crm/v3/owners/?limit=500&archived=true',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const archivedData = archivedResponse.ok ? await archivedResponse.json() : { results: [] };
    const archivedOwners: HubSpotOwner[] = archivedData.results || [];

    const allOwners = [...activeOwners, ...archivedOwners];
    console.log(`Fetched ${allOwners.length} total owners (${activeOwners.length} active, ${archivedOwners.length} archived)`);

    // Build lookup maps
    const byEmail = new Map<string, { ownerId: string; userId: string | null }>();
    const byUserId = new Map<string, string>();
    const validOwnerIds = new Set<string>();

    allOwners.forEach(owner => {
      if (!owner.id || !owner.email) return;

      validOwnerIds.add(owner.id);
      
      const userId = owner.userId || owner.userIdIncludingInactive;
      const userIdString = userId ? String(userId) : null;

      byEmail.set(owner.email.toLowerCase(), {
        ownerId: owner.id,
        userId: userIdString,
      });

      if (userIdString) {
        byUserId.set(userIdString, owner.id);
      }
    });

    console.log(`Built maps: ${byEmail.size} emails, ${byUserId.size} userIds, ${validOwnerIds.size} valid owner IDs`);

    // Fetch all users from database
    const { data: allUsers, error: usersError } = await supabase
      .from('users')
      .select('id, email, hubspot_user_id, hs_owner_id, is_active')
      .eq('tenant_id', tenant_id);

    if (usersError || !allUsers) {
      throw new Error(`Failed to fetch users: ${usersError?.message}`);
    }

    console.log(`Processing ${allUsers.length} users...`);

    let fixedCount = 0;
    let alreadyCorrectCount = 0;
    let couldNotFixCount = 0;
    const fixedUsers: Array<{ email: string; old_id: string | null; new_id: string }> = [];

    for (const user of allUsers) {
      let newOwnerId: string | null = null;
      const oldOwnerId = user.hs_owner_id;

      // Check if current hs_owner_id is already valid
      if (oldOwnerId && validOwnerIds.has(oldOwnerId)) {
        alreadyCorrectCount++;
        continue;
      }

      // Try to find correct owner ID by hubspot_user_id
      if (user.hubspot_user_id && byUserId.has(user.hubspot_user_id)) {
        newOwnerId = byUserId.get(user.hubspot_user_id)!;
        console.log(`Found owner ID via userId for ${user.email}: ${newOwnerId}`);
      }

      // Fallback: try to find by email
      if (!newOwnerId && user.email) {
        const emailLookup = byEmail.get(user.email.toLowerCase());
        if (emailLookup) {
          newOwnerId = emailLookup.ownerId;
          console.log(`Found owner ID via email for ${user.email}: ${newOwnerId}`);
        }
      }

      // Update user if we found a valid owner ID
      if (newOwnerId) {
        const { error: updateError } = await supabase
          .from('users')
          .update({
            hs_owner_id: newOwnerId,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        if (updateError) {
          console.error(`Failed to update user ${user.email}:`, updateError);
          couldNotFixCount++;
        } else {
          fixedCount++;
          fixedUsers.push({
            email: user.email,
            old_id: oldOwnerId,
            new_id: newOwnerId,
          });
          console.log(`✓ Fixed user ${user.email}: ${oldOwnerId || 'null'} → ${newOwnerId}`);
        }
      } else {
        couldNotFixCount++;
        console.log(`✗ Could not find owner ID for user: ${user.email}`);
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total users processed: ${allUsers.length}`);
    console.log(`Already correct: ${alreadyCorrectCount}`);
    console.log(`Successfully fixed: ${fixedCount}`);
    console.log(`Could not fix: ${couldNotFixCount}`);
    
    if (fixedUsers.length > 0) {
      console.log(`\nFirst 10 fixed users:`);
      fixedUsers.slice(0, 10).forEach(u => {
        console.log(`  ${u.email}: ${u.old_id || 'null'} → ${u.new_id}`);
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total_users: allUsers.length,
          already_correct: alreadyCorrectCount,
          fixed: fixedCount,
          could_not_fix: couldNotFixCount,
        },
        fixed_users: fixedUsers,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error) {
    console.error('Migration error:', error);
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
