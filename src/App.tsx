import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import Index from "./pages/Index";
import Leaderboard from "./pages/Leaderboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const EDGE_ORIGIN = 'https://ffbdcvvxiklzgfwrhbta.supabase.co';

const App = () => {
  const { toast } = useToast();

  // Global message listener for OAuth errors from edge functions
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only validate source - state validation will happen next
      if (event.data.source !== 'hubspot') {
        console.log('[App] Ignoring message from non-hubspot source');
        return;
      }

      // Validate state parameter for CSRF protection
      const expectedState = sessionStorage.getItem('swell_oauth_state');
      if (!expectedState || event.data.state !== expectedState) {
        console.error('[App] State mismatch - potential CSRF attack');
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
        // Handle success - redirect to callback with session_key
        const sessionKey = event.data.sessionKey;
        if (sessionKey) {
          console.log('[App] Received session key via postMessage');
          window.location.href = `/?session_key=${sessionKey}`;
        }
      } else if (event.data.type === 'hubspot-auth-error') {
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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
