// Activity-based leaderboard: meetings, calls, emails, follow-ups
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ActivityMetrics {
  owner_id: string;
  owner_name: string;
  owner_email: string;
  meetings_this_week: number;
  calls_this_week: number;
  emails_this_week: number;
  total_activities: number;
  follow_up_rate: number; // percentage of open deals with activity this week
  meetings_last_week: number;
  calls_last_week: number;
  emails_last_week: number;
  total_activities_last_week: number;
  rank: number;
}

// Get week boundaries
function getWeekBoundaries(weeksAgo: number = 0): { start: number; end: number } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysToMonday = (dayOfWeek + 6) % 7; // Days back to last Monday
  
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysToMonday - (weeksAgo * 7));
  weekStart.setHours(0, 0, 0, 0);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  weekEnd.setHours(0, 0, 0, 0);
  
  return {
    start: weekStart.getTime(),
    end: weekEnd.getTime()
  };
}

// Removed - activities are now fetched from database

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Parse request
    let tenantId: string;
    let teamId: string | null = null;
    
    if (req.method === 'POST') {
      const body = await req.json();
      tenantId = body.tenant_id;
      teamId = body.team_id || null;
    } else {
      const url = new URL(req.url);
      tenantId = url.searchParams.get('tenant_id') || '';
      teamId = url.searchParams.get('team_id');
    }

    if (!tenantId) {
      return new Response(
        JSON.stringify({ error: 'tenant_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Activity Leaderboard] tenant_id=${tenantId}, team_id=${teamId}`);

    // Get active users (optionally filtered by team)
    let users;
    let usersError;

    if (teamId) {
      // First get user IDs for the team
      const { data: userTeams } = await supabase
        .from('user_teams')
        .select('user_id')
        .eq('team_id', teamId);
      
      const userIds = (userTeams || []).map(ut => ut.user_id);
      
      // Then get users filtered by those IDs
      const result = await supabase
        .from('users')
        .select('id, hs_owner_id, full_name, email')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .in('id', userIds);
      
      users = result.data;
      usersError = result.error;
    } else {
      // Get all active users for the tenant
      const result = await supabase
        .from('users')
        .select('id, hs_owner_id, full_name, email')
        .eq('tenant_id', tenantId)
        .eq('is_active', true);
      
      users = result.data;
      usersError = result.error;
    }

    if (usersError || !users || users.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No users found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Activity Leaderboard] Found ${users.length} active users`);

    // Get week boundaries
    const thisWeek = getWeekBoundaries(0);
    const lastWeek = getWeekBoundaries(1);

    console.log(`[Activity Leaderboard] This week: ${new Date(thisWeek.start).toISOString()} - ${new Date(thisWeek.end).toISOString()}`);
    console.log(`[Activity Leaderboard] Last week: ${new Date(lastWeek.start).toISOString()} - ${new Date(lastWeek.end).toISOString()}`);

    // Fetch activities from database for both weeks
    const [
      { data: meetingsThisWeek },
      { data: callsThisWeek },
      { data: emailsThisWeek },
      { data: meetingsLastWeek },
      { data: callsLastWeek },
      { data: emailsLastWeek }
    ] = await Promise.all([
      supabase.from('meetings')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('hs_timestamp', thisWeek.start)
        .lt('hs_timestamp', thisWeek.end),
      supabase.from('calls')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('hs_timestamp', thisWeek.start)
        .lt('hs_timestamp', thisWeek.end),
      supabase.from('emails')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('hs_timestamp', thisWeek.start)
        .lt('hs_timestamp', thisWeek.end),
      supabase.from('meetings')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('hs_timestamp', lastWeek.start)
        .lt('hs_timestamp', lastWeek.end),
      supabase.from('calls')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('hs_timestamp', lastWeek.start)
        .lt('hs_timestamp', lastWeek.end),
      supabase.from('emails')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('hs_timestamp', lastWeek.start)
        .lt('hs_timestamp', lastWeek.end),
    ]);

    console.log(`[Activity Leaderboard] Activities this week: meetings=${meetingsThisWeek?.length || 0}, calls=${callsThisWeek?.length || 0}, emails=${emailsThisWeek?.length || 0}`);
    console.log(`[Activity Leaderboard] Activities last week: meetings=${meetingsLastWeek?.length || 0}, calls=${callsLastWeek?.length || 0}, emails=${emailsLastWeek?.length || 0}`);

    // Fetch open deals for follow-up rate calculation
    const { data: openDeals } = await supabase
      .from('deals')
      .select('id, owner_id, dealstage')
      .eq('tenant_id', tenantId)
      .eq('hs_is_closed', false);

    const openDealsByOwner = new Map<string, number>();
    for (const deal of openDeals || []) {
      if (deal.owner_id) {
        openDealsByOwner.set(deal.owner_id, (openDealsByOwner.get(deal.owner_id) || 0) + 1);
      }
    }

    // Build metrics per user
    const metrics: ActivityMetrics[] = [];

    for (const user of users) {
      if (!user.hs_owner_id) continue;

      // Count activities this week - filter by owner_id (user.id)
      const meetingsCount = (meetingsThisWeek || []).filter(m => 
        m.owner_id === user.id
      ).length;
      
      const callsCount = (callsThisWeek || []).filter(c => 
        c.owner_id === user.id
      ).length;
      
      const emailsCount = (emailsThisWeek || []).filter(e => 
        e.owner_id === user.id
      ).length;

      // Count activities last week
      const meetingsLastWeekCount = (meetingsLastWeek || []).filter(m => 
        m.owner_id === user.id
      ).length;
      
      const callsLastWeekCount = (callsLastWeek || []).filter(c => 
        c.owner_id === user.id
      ).length;
      
      const emailsLastWeekCount = (emailsLastWeek || []).filter(e => 
        e.owner_id === user.id
      ).length;

      const totalActivities = meetingsCount + callsCount + emailsCount;
      const totalLastWeek = meetingsLastWeekCount + callsLastWeekCount + emailsLastWeekCount;

      // Calculate follow-up rate
      const openDealsCount = openDealsByOwner.get(user.id) || 0;
      const followUpRate = openDealsCount > 0 
        ? Math.round((totalActivities / openDealsCount) * 100) 
        : 0;

      metrics.push({
        owner_id: user.id,
        owner_name: user.full_name || user.email,
        owner_email: user.email,
        meetings_this_week: meetingsCount,
        calls_this_week: callsCount,
        emails_this_week: emailsCount,
        total_activities: totalActivities,
        follow_up_rate: followUpRate,
        meetings_last_week: meetingsLastWeekCount,
        calls_last_week: callsLastWeekCount,
        emails_last_week: emailsLastWeekCount,
        total_activities_last_week: totalLastWeek,
        rank: 0,
      });
    }

    // Sort by total activities and assign ranks
    metrics.sort((a, b) => b.total_activities - a.total_activities);
    
    let currentRank = 1;
    for (let i = 0; i < metrics.length; i++) {
      if (i > 0 && metrics[i].total_activities < metrics[i - 1].total_activities) {
        currentRank = i + 1;
      }
      metrics[i].rank = currentRank;
    }

    console.log(`[Activity Leaderboard] Returning ${metrics.length} entries`);

    return new Response(
      JSON.stringify({
        full_list: metrics,
        top_3: metrics.slice(0, 3),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Activity Leaderboard] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
