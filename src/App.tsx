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

          // Store JWT token and set fresh login flag
          console.log('[App] Storing token and setting fresh login flag');
          localStorage.setItem('swell_session', data.sessionToken);
          localStorage.setItem('swell_fresh_login', 'true');
          
          // Close popup
          try {
            console.log('Closing popup (success):', (window as any).__swellPopup);
            (window as any).__swellPopup?.close();
            console.log('Popup closed');
          } catch (e) {
            console.error('[App] Failed to close popup:', e);
          }
          
          // Show success message
          toast({
            title: "Innlogging vellykket",
            description: "Henter dine data fra HubSpot..."
          });
          
          // Navigate to leaderboard - this will trigger data fetch
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
        
        // Map error codes to user-friendly messages
        const errorMessages: Record<string, string> = {
          'state_mismatch': 'Sikkerhetsfeil: State validering feilet. Prøv igjen.',
          'state_expired': 'Innloggingssesjonen utløp. Vennligst prøv igjen.',
          'missing_parameters': 'Mangler nødvendige parametere. Prøv igjen.',
          'server_configuration': 'Serverkonfigurasjonsfeil. Kontakt support.',
          'token_exchange_failed': 'Kunne ikke bytte autorisasjonskode. Prøv igjen.',
          'tenant_creation_failed': 'Kunne ikke opprette tenant. Prøv igjen.',
          'user_creation_failed': 'Kunne ikke opprette bruker. Prøv igjen.',
          'user_update_failed': 'Kunne ikke oppdatere bruker. Prøv igjen.',
          'token_storage_failed': 'Kunne ikke lagre tokens. Prøv igjen.',
          'session_creation_failed': 'Kunne ikke opprette session. Prøv igjen.',
          'unexpected_error': 'En uventet feil oppstod. Prøv igjen.',
        };
        
        const errorMessage = errorMessages[event.data.error] || event.data.error || 'En feil oppstod under autentisering';
        
        toast({
          title: "Innlogging feilet",
          description: errorMessage,
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
