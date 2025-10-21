import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import Index from "./pages/Index";
import Leaderboard from "./pages/Leaderboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const EDGE_ORIGIN = 'https://ffbdcvvxiklzgfwrhbta.supabase.co';

// Global OAuth message handler component
const OAuthMessageHandler = () => {
  const navigate = useNavigate();

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      console.debug('[OAuth] postMessage received:', { origin: e.origin, data: e.data });
      
      // Only accept messages from our edge origin
      if (e.origin !== EDGE_ORIGIN) {
        console.debug('[OAuth] Rejected: wrong origin');
        return;
      }
      
      // Only accept messages with hubspot source
      if (e.data?.source !== 'hubspot') {
        console.debug('[OAuth] Rejected: wrong source');
        return;
      }
      
      if (e.data?.type === 'hubspot-auth-success') {
        console.debug('[OAuth] Success received, storing token');
        if (e.data?.token) {
          localStorage.setItem('swell_token', e.data.token);
        }
        // Dispatch custom event to notify Index component
        window.dispatchEvent(new CustomEvent('hubspot-auth-success'));
        navigate('/app/leaderboard');
      } else if (e.data?.type === 'hubspot-auth-error') {
        console.debug('[OAuth] Error received:', e.data?.error);
        // Dispatch custom event to notify Index component
        window.dispatchEvent(new CustomEvent('hubspot-auth-error', { 
          detail: { error: e.data?.error || 'Unknown error' }
        }));
      }
    }
    
    console.debug('[OAuth] Message listener installed');
    window.addEventListener('message', handleMessage);
    return () => {
      console.debug('[OAuth] Message listener removed');
      window.removeEventListener('message', handleMessage);
    };
  }, [navigate]);

  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <OAuthMessageHandler />
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

export default App;
