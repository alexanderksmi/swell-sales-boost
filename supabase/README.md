# Swell Backend Configuration

This directory contains the Supabase backend configuration for the Swell application.

## Directory Structure

```
supabase/
├── functions/          # Edge Functions (serverless backend logic)
│   ├── api-exchange-session/    # Exchange session keys for JWT tokens
│   ├── api-leaderboard/          # Fetch leaderboard data
│   ├── api-me-summary/           # Get current user summary
│   ├── api-session-me/           # Check current session
│   ├── health/                   # Health check endpoint
│   ├── hubspot-auth/             # HubSpot OAuth start and callback
│   ├── hubspot-oauth-exchange/   # HubSpot OAuth token exchange
│   └── sync-hubspot-data/        # Sync data from HubSpot
├── migrations/         # Database migrations (auto-generated)
├── config.toml        # Supabase project configuration
├── SECRETS.md         # Documentation for required secrets
└── README.md          # This file
```

## Environment Setup

### Required Secrets

All secrets must be configured in the Lovable Cloud dashboard before deployment. See [SECRETS.md](./SECRETS.md) for detailed information.

**Critical Secrets:**
- `HUBSPOT_CLIENT_ID` - HubSpot OAuth client ID
- `HUBSPOT_CLIENT_SECRET` - HubSpot OAuth client secret (⚠️ NEVER LOG)
- `HUBSPOT_REDIRECT_URI` - OAuth callback URL
- `APP_BASE_URL` - Application base URL (environment-specific)

**Environment-Specific APP_BASE_URL Values:**
- Production: `https://swell-sales-boost.lovable.app`
- Preview: `https://preview--swell-sales-boost.lovable.app`

### Auto-configured Secrets

These are automatically provided by Lovable Cloud:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `SUPABASE_PUBLISHABLE_KEY`

## Security Best Practices

1. **Never log secrets** - Use generic error messages for security failures
2. **Validate state** - All OAuth flows validate CSRF tokens server-side
3. **Use HTTPS only** - All URLs must use HTTPS in production
4. **Rotate secrets** - Regularly rotate HubSpot credentials
5. **RLS enabled** - All tables have Row-Level Security enabled

## Edge Functions

Edge functions are automatically deployed when code changes are pushed. No manual deployment is required.

### Authentication Flow

1. User clicks "Logg inn med HubSpot"
2. `hubspot-auth/start` - Generates and stores OAuth state, redirects to HubSpot
3. User authorizes on HubSpot
4. HubSpot redirects to `hubspot-oauth-exchange`
5. `hubspot-oauth-exchange` - Validates state, exchanges code for tokens, creates session
6. User redirected to callback page with session key
7. Frontend exchanges session key for JWT token via `api-exchange-session`
8. User authenticated and redirected to leaderboard

### Session Management

- Sessions are stored in `auth_sessions` table with 5-minute expiry
- Session keys are single-use and deleted after exchange
- JWT tokens expire after 7 days
- `api-session-me` validates JWT tokens and returns user info

### HubSpot Integration

- OAuth tokens stored in `hubspot_tokens` table per tenant
- Tokens automatically refreshed when expired
- `sync-hubspot-data` fetches deals and owners from HubSpot
- Rate limiting and caching implemented to reduce API calls

## Database Schema

See the main application for database schema documentation. All tables have RLS policies to ensure data isolation per tenant.

## Troubleshooting

### OAuth Fails

1. Verify all HubSpot secrets are set correctly
2. Check `APP_BASE_URL` matches your deployment environment
3. Ensure HUBSPOT_REDIRECT_URI is registered in HubSpot app settings

### State Mismatch Errors

- OAuth state is validated server-side and expires after 10 minutes
- Check system clocks are synchronized
- Verify no duplicate OAuth flows are running

### Token Storage Errors

- Ensure RLS policies allow the operation
- Check Supabase service role key is valid
- Verify tenant and user records exist

## Monitoring

Check edge function logs in Lovable Cloud dashboard:
1. Go to Project → Backend
2. Select function from list
3. View real-time logs

Look for:
- "CRITICAL: Missing required environment variables" - indicates missing secrets
- "State mismatch" - indicates potential security issue or expired state
- "(details hidden for security)" - normal security masking of sensitive data
