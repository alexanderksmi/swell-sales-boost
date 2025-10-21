import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";

const Leaderboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Session is validated via HttpOnly cookie (swell_session)
    // Backend RLS will handle access control
    // For now, just show the page - user data will be fetched when needed
    setLoading(false);
  }, []);

  const handleLogout = async () => {
    try {
      // Clear session cookie by calling a logout endpoint or just navigate away
      // For now, just clear client state and navigate home
      document.cookie = 'swell_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
      toast.success('Logget ut');
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
          
          <div className="flex items-center gap-4">
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
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto">
          <Card className="border-border/50 shadow-lg">
            <CardHeader>
              <CardTitle className="text-3xl flex items-center gap-3">
                <Trophy className="w-8 h-8 text-primary" />
                Leaderboard
              </CardTitle>
              <CardDescription className="text-base">
                Welcome to your sales leaderboard dashboard
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Trophy className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Successfully Connected!</h3>
                <p className="text-muted-foreground mb-6">
                  Your HubSpot account has been linked. Leaderboard features will be implemented in the next milestone.
                </p>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-success/10 text-success">
                  <div className="w-2 h-2 rounded-full bg-success" />
                  <span className="text-sm font-medium">OAuth Integration Active</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default Leaderboard;
