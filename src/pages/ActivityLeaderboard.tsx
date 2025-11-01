import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, LogOut, Loader2, TrendingUp, TrendingDown, Minus, Phone, Mail, Calendar, Activity } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ActivityMetrics {
  owner_id: string;
  owner_name: string;
  owner_email: string;
  meetings_this_week: number;
  calls_this_week: number;
  emails_this_week: number;
  total_activities: number;
  follow_up_rate: number;
  meetings_last_week: number;
  calls_last_week: number;
  emails_last_week: number;
  total_activities_last_week: number;
  rank: number;
}

interface Team {
  id: string;
  name: string;
}

const ActivityLeaderboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [activityData, setActivityData] = useState<ActivityMetrics[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const sessionData = await checkSession();

        if (!sessionData.authenticated || !sessionData.user) {
          console.log('[ActivityLeaderboard] No valid session, redirecting to home');
          toast.error('Vennligst logg inn på nytt');
          navigate('/');
          return;
        }

        console.log('[ActivityLeaderboard] Valid session found:', sessionData.user);
        setUserId(sessionData.user.id);
        setTenantId(sessionData.tenant.id);
        setCompanyName(sessionData.tenant.company_name || '');
        setIsAdmin(sessionData.isAdmin || false);

        const userTeams = sessionData.teams || [];
        setTeams(userTeams);

        if (userTeams.length > 0) {
          if (!selectedTeamId) {
            setSelectedTeamId(sessionData.isAdmin ? null : userTeams[0].id);
          }
        } else if (!sessionData.isAdmin) {
          console.warn('[ActivityLeaderboard] User has no teams');
          toast.error('Du er ikke tildelt noe team');
          setLoading(false);
          return;
        }

        // Fetch activity leaderboard data
        const { data: activityResponse, error: activityError } = await supabase.functions.invoke(
          'api-activity-leaderboard',
          {
            body: { 
              tenant_id: sessionData.tenant.id,
              team_id: selectedTeamId,
            },
          }
        );

        if (activityError) {
          console.error('Activity leaderboard error:', activityError);
          toast.error('Kunne ikke hente aktivitetsdata');
        } else {
          setActivityData(activityResponse.full_list || []);
        }

      } catch (error) {
        console.error('Data fetch error:', error);
        toast.error('En feil oppstod ved lasting av data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate, selectedTeamId]);

  const handleTeamChange = (teamId: string) => {
    setSelectedTeamId(teamId === 'all' ? null : teamId);
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('swell_session');
      document.cookie = 'swell_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
      toast.success('Logget ut');
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Kunne ikke logge ut');
    }
  };

  const getTrendIcon = (thisWeek: number, lastWeek: number) => {
    if (thisWeek > lastWeek) return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (thisWeek < lastWeek) return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  const myMetrics = activityData.find(m => m.owner_id === userId);

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
            {(isAdmin || teams.length > 1) && (
              <Select value={selectedTeamId || 'all'} onValueChange={handleTeamChange}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Velg team" />
                </SelectTrigger>
                <SelectContent>
                  {isAdmin && <SelectItem value="all">Alle teams</SelectItem>}
                  {teams.map(team => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            <Button variant="outline" size="sm" onClick={() => navigate('/leaderboard')}>
              Deal Leaderboard
            </Button>
            
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
          {/* My Activity Summary */}
          {myMetrics && (
            <Card className="border-border/50 shadow-lg bg-gradient-to-br from-primary/5 to-accent/5">
              <CardHeader>
                <CardTitle className="text-xl">Min aktivitet</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-primary">
                      #{myMetrics.rank}
                    </div>
                    <div className="text-sm text-muted-foreground">Rangering</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold flex items-center justify-center gap-1">
                      <Calendar className="w-5 h-5" />
                      {myMetrics.meetings_this_week}
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                      Møter {getTrendIcon(myMetrics.meetings_this_week, myMetrics.meetings_last_week)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold flex items-center justify-center gap-1">
                      <Phone className="w-5 h-5" />
                      {myMetrics.calls_this_week}
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                      Samtaler {getTrendIcon(myMetrics.calls_this_week, myMetrics.calls_last_week)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold flex items-center justify-center gap-1">
                      <Mail className="w-5 h-5" />
                      {myMetrics.emails_this_week}
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                      E-poster {getTrendIcon(myMetrics.emails_this_week, myMetrics.emails_last_week)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold flex items-center justify-center gap-1">
                      <Activity className="w-5 h-5" />
                      {myMetrics.total_activities}
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                      Totalt {getTrendIcon(myMetrics.total_activities, myMetrics.total_activities_last_week)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Activity Leaderboard Card */}
          <Card className="border-border/50 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-3xl flex items-center gap-3">
                    <Activity className="w-8 h-8 text-primary" />
                    Aktivitets Leaderboard
                  </CardTitle>
                  <CardDescription className="text-base mt-2">
                    Rangering basert på totale aktiviteter denne uken
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="total" className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="total">Totalt</TabsTrigger>
                  <TabsTrigger value="meetings">Møter</TabsTrigger>
                  <TabsTrigger value="calls">Samtaler</TabsTrigger>
                  <TabsTrigger value="emails">E-poster</TabsTrigger>
                  <TabsTrigger value="followup">Oppfølging</TabsTrigger>
                </TabsList>

                {/* Total Activities Tab */}
                <TabsContent value="total" className="space-y-4 mt-6">
                  {activityData.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>Ingen aktivitetsdata tilgjengelig ennå</p>
                    </div>
                  ) : (
                    <>
                      {/* Top 3 horizontal cards */}
                      <div className="grid grid-cols-3 gap-4">
                        {activityData.slice(0, 3).map((entry, index) => (
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
                              <div className="text-3xl font-bold flex items-center justify-center gap-1">
                                {entry.total_activities}
                                {getTrendIcon(entry.total_activities, entry.total_activities_last_week)}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                aktiviteter
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                      {/* Show All button */}
                      {activityData.length > 3 && !showAll && (
                        <div className="text-center">
                          <Button 
                            variant="outline" 
                            onClick={() => setShowAll(true)}
                          >
                            Se alle ({activityData.length})
                          </Button>
                        </div>
                      )}

                      {/* Full list */}
                      {showAll && (
                        <div className="space-y-2 mt-6">
                          <h3 className="font-semibold text-lg mb-3">Alle resultater</h3>
                          {activityData.map((entry) => (
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
                                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                                    <span className="flex items-center gap-1">
                                      <Calendar className="w-3 h-3" /> {entry.meetings_this_week}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Phone className="w-3 h-3" /> {entry.calls_this_week}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Mail className="w-3 h-3" /> {entry.emails_this_week}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-xl font-bold flex items-center gap-1">
                                  {entry.total_activities}
                                  {getTrendIcon(entry.total_activities, entry.total_activities_last_week)}
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
                    </>
                  )}
                </TabsContent>

                {/* Similar structure for other tabs - abbreviated for brevity */}
                <TabsContent value="meetings">
                  <div className="text-center py-12 text-muted-foreground">
                    Møter-spesifikk visning kommer her
                  </div>
                </TabsContent>
                
                <TabsContent value="calls">
                  <div className="text-center py-12 text-muted-foreground">
                    Samtaler-spesifikk visning kommer her
                  </div>
                </TabsContent>
                
                <TabsContent value="emails">
                  <div className="text-center py-12 text-muted-foreground">
                    E-post-spesifikk visning kommer her
                  </div>
                </TabsContent>
                
                <TabsContent value="followup">
                  <div className="text-center py-12 text-muted-foreground">
                    Oppfølgingsgrad-visning kommer her
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default ActivityLeaderboard;
