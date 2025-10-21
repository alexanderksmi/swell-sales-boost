// Global fetch interceptor that adds Authorization header to all edge function calls

const EDGE_ORIGIN = 'https://ffbdcvvxiklzgfwrhbta.supabase.co';

// Store original fetch
const originalFetch = window.fetch;

// Override global fetch
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  // Get URL from input
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  
  // Check if this is an edge function call
  if (url.startsWith(`${EDGE_ORIGIN}/functions/v1/`)) {
    console.log('[Fetch Interceptor] Intercepting call to:', url);
    
    // Get token from localStorage
    const token = localStorage.getItem('swell_token');
    
    if (token) {
      console.log('[Fetch Interceptor] Adding Authorization header');
      
      // Add Authorization header
      const headers = new Headers(init?.headers || {});
      headers.set('Authorization', `Bearer ${token}`);
      
      // Create new init object with updated headers
      const newInit: RequestInit = {
        ...init,
        headers,
      };
      
      return originalFetch(input, newInit);
    } else {
      console.warn('[Fetch Interceptor] No token found - redirecting to login');
      // Redirect to login page if no token is found
      window.location.href = '/';
      // Return a rejected promise to prevent the fetch from continuing
      return Promise.reject(new Error('No authentication token found'));
    }
  }
  
  // For all other requests, use original fetch
  return originalFetch(input, init);
};

console.log('[Fetch Interceptor] Global fetch interceptor installed');
