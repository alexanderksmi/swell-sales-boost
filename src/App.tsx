import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import Index from "./pages/Index";
import Leaderboard from "./pages/Leaderboard";
import HubSpotCallback from "./pages/HubSpotCallback";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  const { toast } = useToast();

  // Global message listener for OAuth messages from edge functions
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Log incoming message before validation
      console.log('[MAIN WINDOW] event.origin:', event.origin);
      console.log('[MAIN WINDOW] event.data.type:', event.data?.type);
      
      // Validate that message is from same origin (app callback page)
      if (event.origin !== window.location.origin) {
        console.log('[MAIN WINDOW] Ignoring message from different origin:', event.origin);
        return;
      }
      
      // Validate source
      if (event.data.source !== 'hubspot') {
        console.log('[MAIN WINDOW] Ignoring message from non-hubspot source');
        return;
      }
      
      console.log('[MAIN WINDOW] ✅ Message validation passed - ACCEPTED');

      // Validate state parameter for CSRF protection
      const expectedState = sessionStorage.getItem('swell_oauth_state');
      const stateMatch = event.data.state === expectedState;
      console.log('state-match:', stateMatch);
      
      if (!expectedState || !stateMatch) {
        console.error('[App] State mismatch - potential CSRF attack');
        
        // Close popup on error
        try {
          console.log('Closing popup (error):', (window as any).__swellPopup);
          (window as any).__swellPopup?.close();
        } catch (e) {
          console.error('[App] Failed to close popup:', e);
        }
        
        toast({
          title: "Sikkerhetsfeil",
          description: "OAuth state validering feilet. Prøv igjen.",
          variant: "destructive"
        });
        return;
      }

      console.log('[App] State validated, processing message:', event.data.type);

      // Clear state after successful validation
      sessionStorage.removeItem('swell_oauth_state');

      if (event.data.type === 'hubspot-auth-success') {
        const sessionKey = event.data.sessionKey;
        if (!sessionKey) {
          console.error('[App] No session key in success message');
          
          // Close popup on error
          try {
            (window as any).__swellPopup?.close();
          } catch (e) {
            console.error('[App] Failed to close popup:', e);
          }
          
          toast({
            title: "Innlogging feilet",
            description: "Ingen session key mottatt. Prøv igjen.",
            variant: "destructive"
          });
          return;
        }

        try {
          // Exchange session key for JWT token
          console.log('[App] Exchanging session key for token');
          const exchangeUrl = new URL('https://ffbdcvvxiklzgfwrhbta.supabase.co/functions/v1/api-exchange-session');
          exchangeUrl.searchParams.set('session_key', sessionKey);
          
          const token = localStorage.getItem('swell_session');
          const headers: HeadersInit = {
            'Content-Type': 'application/json',
          };
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          
          const response = await fetch(exchangeUrl.toString(), { headers });
          const data = await response.json();
          
          if (data.error || !data.sessionToken) {
            throw new Error(data.error || 'No session token received');
          }

          // Store JWT token in localStorage
          console.log('[App] Storing token and navigating to leaderboard');
          localStorage.setItem('swell_session', data.sessionToken);
          
          // Close popup
          try {
            console.log('Closing popup (success):', (window as any).__swellPopup);
            (window as any).__swellPopup?.close();
            console.log('Popup closed');
          } catch (e) {
            console.error('[App] Failed to close popup:', e);
          }
          
          // Navigate to leaderboard
          console.log('Navigating to:', '/app/leaderboard');
          window.location.href = '/app/leaderboard';
          console.log('=== TESTRUNDE FERDIG ===');
          
        } catch (error) {
          console.error('[App] Failed to exchange session:', error);
          
          // Close popup on error
          try {
            (window as any).__swellPopup?.close();
          } catch (e) {
            console.error('[App] Failed to close popup:', e);
          }
          
          toast({
            title: "Innlogging feilet",
            description: "Kunne ikke fullføre autentisering. Prøv igjen.",
            variant: "destructive"
          });
        }
      } else if (event.data.type === 'hubspot-auth-error') {
        // Close popup on error
        try {
          (window as any).__swellPopup?.close();
        } catch (e) {
          console.error('[App] Failed to close popup:', e);
        }
        
        toast({
          title: "Innlogging feilet",
          description: event.data.error || "En feil oppstod under autentisering",
          variant: "destructive"
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [toast]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/app/leaderboard" element={<Leaderboard />} />
            <Route path="/auth/hubspot/callback" element={<HubSpotCallback />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
