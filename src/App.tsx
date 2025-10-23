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
      // Validate origin is from edge function
      if (event.origin !== EDGE_ORIGIN) {
        console.log('[App] Ignoring message from invalid origin:', event.origin);
        return;
      }

      console.log('[App] Received message from edge:', event.data);

      if (event.data.type === 'hubspot-auth-error' && event.data.source === 'hubspot') {
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
