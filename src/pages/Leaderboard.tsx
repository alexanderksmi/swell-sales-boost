import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, LogOut, Loader2, TrendingUp, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { checkSession } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LeaderboardEntry {
  owner_id: string;
  owner_name: string;
  owner_email: string;
  largest_deal_amount: number;
  largest_deal_name: string;
  rank: number;
}

interface Summary {
  rank: number | null;
  total_pipeline: number;
  largest_deal_amount: number;
  largest_deal_name: string | null;
  total_entries: number;
  deals_count: number;
}

interface Team {
  id: string;
  name: string;
}

const Leaderboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [category, setCategory] = useState("biggest-deal");
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        // Check if this is a fresh login
        const isFreshLogin = localStorage.getItem('swell_fresh_login') === 'true';
        if (isFreshLogin) {
          console.log('[Leaderboard] Fresh login detected, will fetch data');
          localStorage.removeItem('swell_fresh_login');
          toast.success('Velkommen! Henter dine data...');
        }

        // Check session validity via edge function
        const sessionData = await checkSession();

        if (!sessionData.authenticated || !sessionData.user) {
          console.log('[Leaderboard] No valid session, redirecting to home');
          toast.error('Vennligst logg inn på nytt');
          navigate('/');
          return;
        }

        console.log('[Leaderboard] Valid session found:', sessionData.user);
        setUserId(sessionData.user.id);
        setTenantId(sessionData.tenant.id);
        setCompanyName(sessionData.tenant.company_name || '');

        // Get teams from session data (fetched with service role in api-session-me)
        const userTeams = sessionData.teams || [];
        setTeams(userTeams);
        console.log('[Leaderboard] User teams from session:', userTeams);

        // Always set first team as default (user must be part of a team to see data)
        if (userTeams.length > 0) {
          if (!selectedTeamId) {
            setSelectedTeamId(userTeams[0].id);
          }
        } else {
          console.warn('[Leaderboard] User has no teams');
          toast.error('Du er ikke tildelt noe team');
          setLoading(false);
          return;
        }

        // Only fetch leaderboard if we have a selected team
        if (!selectedTeamId) {
          console.log('[Leaderboard] No team selected, skipping leaderboard fetch');
          setLoading(false);
          return;
        }

        // Fetch leaderboard data (always with team filter)
        const { data: leaderboardResponse, error: leaderboardError } = await supabase.functions.invoke(
          'api-leaderboard',
          {
            body: { 
              tenant_id: sessionData.tenant.id,
              team_id: selectedTeamId 
            },
          }
        );

        if (leaderboardError) {
          console.error('Leaderboard error:', leaderboardError);
          toast.error('Kunne ikke hente leaderboard');
        } else {
          setLeaderboardData(leaderboardResponse.full_list || []);
        }

        // Fetch user summary
        const { data: summaryResponse, error: summaryError } = await supabase.functions.invoke(
          'api-me-summary',
          {
            body: { 
              tenant_id: sessionData.tenant.id,
              user_id: sessionData.user.id,
            },
          }
        );

        if (summaryError) {
          console.error('Summary error:', summaryError);
        } else {
          setSummary(summaryResponse);
        }

      } catch (error) {
        console.error('Data fetch error:', error);
        toast.error('En feil oppstod ved lasting av data');
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [navigate, selectedTeamId]);

  const handleTeamChange = (teamId: string) => {
    setSelectedTeamId(teamId);
  };

  const handleLogout = async () => {
    try {
      // Clear session from localStorage
      localStorage.removeItem('swell_session');
      
      // Also clear any cookies
      document.cookie = 'swell_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
      
      toast.success('Logget ut');
      
      // Navigate to home page
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Kunne ikke logge ut');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
              <Trophy className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Swell
            </h1>
          </div>
          
          <div className="flex-1 flex justify-center">
            <h2 className="text-lg font-semibold text-foreground">
              {companyName}
            </h2>
          </div>
          
          <div className="flex items-center gap-4">
            {teams.length > 1 && (
              <Select value={selectedTeamId || ''} onValueChange={handleTeamChange}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Velg team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map(team => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            <span className="text-sm text-muted-foreground">
              Innlogget
            </span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logg ut
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <section className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* My Summary Card */}
          {summary && (
            <Card className="border-border/50 shadow-lg bg-gradient-to-br from-primary/5 to-accent/5">
              <CardHeader>
                <CardTitle className="text-xl">Min plassering</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-primary">
                      {summary.rank ? `#${summary.rank}` : '-'}
                    </div>
                    <div className="text-sm text-muted-foreground">Rangering</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold">
                      {summary.total_entries}
                    </div>
                    <div className="text-sm text-muted-foreground">Totalt</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold flex items-center justify-center gap-1">
                      <DollarSign className="w-5 h-5" />
                      {(summary.total_pipeline || 0).toLocaleString('no-NO')}
                    </div>
                    <div className="text-sm text-muted-foreground">Sum pipeline</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold flex items-center justify-center gap-1">
                      <TrendingUp className="w-5 h-5" />
                      {(summary.largest_deal_amount || 0).toLocaleString('no-NO')}
                    </div>
                    <div className="text-sm text-muted-foreground">Største deal</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Leaderboard Card */}
          <Card className="border-border/50 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-3xl flex items-center gap-3">
                    <Trophy className="w-8 h-8 text-primary" />
                    Leaderboard
                  </CardTitle>
                  <CardDescription className="text-base mt-2">
                    Rangering basert på størst deal i pipeline
                  </CardDescription>
                </div>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="biggest-deal">Størst deal i pipeline</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {leaderboardData.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Ingen data tilgjengelig ennå</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Top 3 podium style */}
                  <div className="grid grid-cols-3 gap-4 mb-8">
                    {leaderboardData.slice(0, 3).map((entry, index) => (
                      <Card 
                        key={entry.owner_id}
                        className={`text-center ${
                          index === 0 ? 'bg-gradient-to-br from-yellow-500/10 to-yellow-600/10 border-yellow-500/20' :
                          index === 1 ? 'bg-gradient-to-br from-gray-400/10 to-gray-500/10 border-gray-400/20' :
                          'bg-gradient-to-br from-orange-600/10 to-orange-700/10 border-orange-600/20'
                        }`}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex justify-center mb-2">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                              index === 0 ? 'bg-yellow-500/20 text-yellow-600' :
                              index === 1 ? 'bg-gray-400/20 text-gray-500' :
                              'bg-orange-600/20 text-orange-600'
                            }`}>
                              <Trophy className="w-6 h-6" />
                            </div>
                          </div>
                          <CardTitle className="text-xl">#{entry.rank}</CardTitle>
                          <CardDescription className="font-semibold">
                            {entry.owner_name}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold flex items-center justify-center gap-1">
                            <DollarSign className="w-5 h-5" />
                            {entry.largest_deal_amount.toLocaleString('no-NO')}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 truncate">
                            {entry.largest_deal_name}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Show All button */}
                  {leaderboardData.length > 3 && !showAll && (
                    <div className="text-center">
                      <Button 
                        variant="outline" 
                        onClick={() => setShowAll(true)}
                      >
                        Se alle ({leaderboardData.length})
                      </Button>
                    </div>
                  )}

                  {/* Full list */}
                  {showAll && (
                    <div className="space-y-2 mt-6">
                      <h3 className="font-semibold text-lg mb-3">Alle resultater</h3>
                      {leaderboardData.map((entry) => (
                        <div
                          key={entry.owner_id}
                          className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-accent/5 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold">
                              #{entry.rank}
                            </div>
                            <div>
                              <div className="font-semibold">{entry.owner_name}</div>
                              <div className="text-sm text-muted-foreground truncate">
                                {entry.largest_deal_name}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold flex items-center gap-1">
                              <DollarSign className="w-4 h-4" />
                              {entry.largest_deal_amount.toLocaleString('no-NO')}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="text-center pt-4">
                        <Button 
                          variant="ghost" 
                          onClick={() => setShowAll(false)}
                        >
                          Vis mindre
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default Leaderboard;
