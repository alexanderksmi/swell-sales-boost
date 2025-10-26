import { useEffect } from 'react';

const HubSpotCallback = () => {
  useEffect(() => {
    // Parse query parameters
    const params = new URLSearchParams(window.location.search);
    const ok = params.get('ok');
    const error = params.get('error');
    const state = params.get('state');
    const sessionKey = params.get('session_key');

    console.log('[CALLBACK] Params:', { ok, error, state, sessionKey });

    // Send postMessage to opener
    if (window.opener) {
      if (error) {
        window.opener.postMessage(
          {
            source: 'hubspot',
            type: 'hubspot-auth-error',
            error,
            state
          },
          window.location.origin
        );
      } else if (ok && sessionKey) {
        window.opener.postMessage(
          {
            source: 'hubspot',
            type: 'hubspot-auth-success',
            sessionKey,
            state
          },
          window.location.origin
        );
      }

      // Close window after sending message
      setTimeout(() => {
        window.close();
      }, 100);
    } else {
      console.error('[CALLBACK] No window.opener found');
    }
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
        <p>Fullfører autentisering...</p>
      </div>
    </div>
  );
};

export default HubSpotCallback;
