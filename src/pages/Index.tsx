import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Zap, Target, TrendingUp, Users, Settings, AlertCircle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { checkSession } from "@/lib/api";

const EDGE_ORIGIN = 'https://ffbdcvvxiklzgfwrhbta.supabase.co';

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [popup, setPopup] = useState<Window | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  // Check if user is already logged in
  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        const sessionData = await checkSession();
        if (sessionData.authenticated) {
          console.log('[Index] Existing session found, redirecting to leaderboard');
          navigate('/app/leaderboard');
        }
      } catch (error) {
        console.log('[Index] No existing session');
      } finally {
        setCheckingSession(false);
      }
    };

    checkExistingSession();
  }, [navigate]);

  const handleSuccess = () => {
    setIsLoggingIn(false);
    setAuthError(null);
    if (popup && !popup.closed) {
      popup.close();
    }
    toast({
      title: "Innlogging vellykket",
      description: "Du blir omdirigert til leaderboard...",
    });
    setTimeout(() => {
      navigate('/app/leaderboard');
    }, 500);
  };

  // Always-active listener for postMessage from popup
  useEffect(() => {
    console.log('[Frontend] Setting up permanent postMessage listener...');
    
    const handleMessage = (event: MessageEvent) => {
      console.log('[Frontend] Received message:', event.data);
      
      // Security: validate message structure
      if (event.data?.type === 'hubspot-auth-complete' && event.data?.sessionKey) {
        const sessionKey = event.data.sessionKey;
        console.log('[Frontend] Received session_key from popup, exchanging for token');
        
        // Exchange session key for actual token
        const exchangeUrl = new URL(`${EDGE_ORIGIN}/functions/v1/api-exchange-session`);
        exchangeUrl.searchParams.set('session_key', sessionKey);
        
        fetch(exchangeUrl.toString())
          .then(response => response.json())
          .then(data => {
            if (data.error) {
              console.error('[Frontend] Failed to exchange session:', data.error);
              toast({
                title: "Innlogging feilet",
                description: "Kunne ikke fullføre autentisering. Prøv igjen.",
                variant: "destructive"
              });
              setIsLoggingIn(false);
              return;
            }

            if (data.sessionToken) {
              console.log('[Frontend] Session token received, storing in localStorage');
              localStorage.setItem('swell_session', data.sessionToken);
              
              toast({
                title: "Innlogging vellykket",
                description: "Velkommen til Swell!",
              });
              
              setIsLoggingIn(false);
              navigate('/app/leaderboard');
            }
          })
          .catch(error => {
            console.error('[Frontend] Exchange request failed:', error);
            toast({
              title: "Innlogging feilet",
              description: "Kunne ikke fullføre autentisering. Prøv igjen.",
              variant: "destructive"
            });
            setIsLoggingIn(false);
          });
      } else if (event.data?.type === 'hubspot-auth-error') {
        console.error('[Frontend] Auth error from popup:', event.data.error);
        setAuthError(event.data.error);
        setIsLoggingIn(false);
        toast({
          title: "Innlogging feilet",
          description: event.data.error,
          variant: "destructive"
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      console.log('[Frontend] Cleaning up postMessage listener');
      window.removeEventListener('message', handleMessage);
    };
  }, [navigate, toast]);

  // Fallback polling - only active during login
  useEffect(() => {
    if (!isLoggingIn) return;
    
    console.log('[Frontend] Starting fallback polling timeout (3s)...');
    const pollTimeout = setTimeout(async () => {
      console.log('[Frontend] Fallback: polling for session after 3s timeout...');
      try {
        const sessionData = await checkSession();
        if (sessionData.authenticated) {
          console.log('[Frontend] Session found via polling, redirecting');
          toast({
            title: "Innlogging vellykket",
            description: "Velkommen til Swell!",
          });
          setIsLoggingIn(false);
          navigate('/app/leaderboard');
        } else {
          console.log('[Frontend] No session found via polling');
          setIsLoggingIn(false);
        }
      } catch (error) {
        console.error('[Frontend] Polling failed:', error);
        setIsLoggingIn(false);
      }
    }, 3000);

    return () => {
      console.log('[Frontend] Cleaning up polling timeout');
      clearTimeout(pollTimeout);
    };
  }, [isLoggingIn, navigate, toast]);

  const handleHubSpotLogin = () => {
    setAuthError(null);
    setIsLoggingIn(true);
    
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    
    // Pass frontend URL to edge function so it knows where to redirect back
    const frontendUrl = encodeURIComponent(window.location.origin);
    const startUrl = `${EDGE_ORIGIN}/functions/v1/hubspot-auth/start?frontend_url=${frontendUrl}`;
    
    console.log('[Frontend] Opening OAuth popup with frontend URL:', window.location.origin);
    
    const newPopup = window.open(
      startUrl,
      'hubspot-oauth',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (!newPopup) {
      // Popup was blocked - fallback to redirect flow
      setAuthError("Popup ble blokkert. Omdirigerer...");
      toast({
        title: "Popup blokkert",
        description: "Omdirigerer til innlogging i samme vindu...",
      });
      
      setTimeout(() => {
        window.location.href = startUrl;
      }, 1000);
      return;
    }

    setPopup(newPopup);

    // Popup will send postMessage with session_key when auth completes
    // The useEffect listener will handle the exchange and navigation
  };
  const features = [
    {
      icon: Trophy,
      title: "Leaderboards",
      description: "Dynamiske rangeringer basert på HubSpot-aktivitet",
    },
    {
      icon: Zap,
      title: "Poeng-system",
      description: "Automatisk poengberegning fra CRM-data",
    },
    {
      icon: Target,
      title: "Kategorier",
      description: "Fleksible målekategorier tilpasset ditt team",
    },
    {
      icon: TrendingUp,
      title: "Sanntidsdata",
      description: "Oppdateres kontinuerlig fra HubSpot",
    },
    {
      icon: Users,
      title: "Team-basert",
      description: "Støtte for flere team og avdelinger",
    },
    {
      icon: Settings,
      title: "Konfigurerbart",
      description: "Tilpass poengregler og innstillinger",
    },
  ];

  // Show loading while checking session
  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Sjekker sesjon...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
              <Trophy className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Swell
            </h1>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <Button variant="outline" size="sm">
              Status: Milestone 0-1
            </Button>
          </motion.div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6">
            <Zap className="w-4 h-4" />
            <span className="text-sm font-medium">Motivasjonsplattform for B2B-salgsteam</span>
          </div>
          
          <h2 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            Gjør salg til en{" "}
            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              konkurransearena
            </span>
          </h2>
          
          <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
            Swell kobler seg mot HubSpot og transformerer salgsteamets aktivitet til 
            engasjerende konkurranse med sanntids leaderboards og poengberegning.
          </p>

          {authError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-md mx-auto mb-6"
            >
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Innlogging feilet</AlertTitle>
                <AlertDescription>{authError}</AlertDescription>
              </Alert>
            </motion.div>
          )}

          <div className="flex flex-wrap gap-4 justify-center">
            <Button 
              size="lg" 
              className="bg-gradient-to-r from-primary to-primary-glow hover:opacity-90 transition-opacity shadow-lg"
              onClick={handleHubSpotLogin}
              disabled={isLoggingIn}
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Logger inn...
                </>
              ) : authError ? (
                'Prøv igjen'
              ) : (
                'Logg inn med HubSpot'
              )}
            </Button>
            <Button size="lg" variant="outline">
              Les dokumentasjon
            </Button>
          </div>
        </motion.div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-20">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <h3 className="text-3xl font-bold text-center mb-12">Funksjonalitet</h3>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index }}
              >
                <Card className="h-full hover:shadow-lg transition-shadow border-border/50">
                  <CardHeader>
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center mb-4">
                      <feature.icon className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl">{feature.title}</CardTitle>
                    <CardDescription className="text-base">
                      {feature.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Status Section */}
      <section className="container mx-auto px-4 py-20">
        <Card className="max-w-3xl mx-auto border-border/50 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">Milestone 0-1: Grunnleggende oppsett ✅</CardTitle>
            <CardDescription className="text-base">
              Miljø, database og infrastruktur er på plass
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-success" />
                  Backend
                </h4>
                <ul className="space-y-1 text-sm text-muted-foreground ml-4">
                  <li>✓ Lovable Cloud aktivert</li>
                  <li>✓ Database tabeller opprettet</li>
                  <li>✓ Row Level Security konfigurert</li>
                  <li>✓ Tenant-basert dataskille</li>
                </ul>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-success" />
                  Edge Functions
                </h4>
                <ul className="space-y-1 text-sm text-muted-foreground ml-4">
                  <li>✓ Health check endpoint</li>
                  <li>✓ HubSpot OAuth komplett</li>
                  <li>✓ Token-håndtering</li>
                </ul>
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <h4 className="font-semibold mb-2">Database-tabeller</h4>
              <div className="flex flex-wrap gap-2">
                {[
                  'tenants',
                  'users',
                  'teams',
                  'leaderboard_categories',
                  'scoring_rule_sets',
                  'points_ledger',
                  'org_defaults',
                  'user_overrides',
                ].map((table) => (
                  <span
                    key={table}
                    className="px-3 py-1 rounded-full bg-muted text-sm font-mono"
                  >
                    {table}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Trophy className="w-4 h-4" />
              <span className="text-sm">Swell - Motivasjonsplattform for salgsteam</span>
            </div>
            <div className="text-sm text-muted-foreground">
              Milestone 0-1 • Bygget med Lovable Cloud
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
