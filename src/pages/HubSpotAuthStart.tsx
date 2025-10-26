import { useEffect } from 'react';

const HubSpotAuthStart = () => {
  useEffect(() => {
    // Get frontend URL from query params
    const params = new URLSearchParams(window.location.search);
    const frontendUrl = params.get('frontend_url');

    if (!frontendUrl) {
      console.error('[AUTH START] Missing required parameter: frontend_url');
      return;
    }

    // Redirect to edge function to start OAuth flow
    const edgeOrigin = 'https://ffbdcvvxiklzgfwrhbta.supabase.co';
    const startUrl = `${edgeOrigin}/functions/v1/hubspot-auth/start?frontend_url=${encodeURIComponent(frontendUrl)}`;
    
    console.log('[AUTH START] Redirecting to OAuth flow');
    window.location.href = startUrl;
  }, []);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: 'system-ui, sans-serif',
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{ textAlign: 'center' }}>
        <p>Starter HubSpot-autentisering...</p>
      </div>
    </div>
  );
};

export default HubSpotAuthStart;
