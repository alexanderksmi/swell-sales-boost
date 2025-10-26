# Supabase Secrets Configuration

This document describes all required secrets for the Swell application.

## Required Secrets

### HubSpot OAuth Configuration

- **HUBSPOT_CLIENT_ID**: HubSpot App Client ID
  - Get from: HubSpot Developer Account → App Settings → Auth
  - Format: Standard UUID format
  - Required: Yes

- **HUBSPOT_CLIENT_SECRET**: HubSpot App Client Secret
  - Get from: HubSpot Developer Account → App Settings → Auth
  - Format: Long alphanumeric string
  - Required: Yes
  - **⚠️ CRITICAL**: Never log or expose this value

- **HUBSPOT_REDIRECT_URI**: OAuth callback URL for HubSpot
  - Value: `https://ffbdcvvxiklzgfwrhbta.supabase.co/functions/v1/hubspot-oauth-exchange`
  - Required: Yes
  - Note: Must be registered in HubSpot App settings

### Application Configuration

- **APP_BASE_URL**: Base URL for the application (used for OAuth redirects)
  - Production: `https://swell-sales-boost.lovable.app`
  - Preview: `https://preview--swell-sales-boost.lovable.app`
  - Required: Yes
  - Note: Must match the environment where the app is deployed

### Auto-configured Supabase Secrets

These are automatically provided by Lovable Cloud:

- **SUPABASE_URL**: Supabase project URL
- **SUPABASE_SERVICE_ROLE_KEY**: Service role key (full access)
- **SUPABASE_ANON_KEY**: Anonymous key (public access)
- **SUPABASE_PUBLISHABLE_KEY**: Publishable key for client-side

## Security Best Practices

1. **Never log secrets** in console.log or error messages
2. **Never expose secrets** to client-side code
3. **Rotate secrets regularly** especially if compromised
4. **Use environment-specific values** for APP_BASE_URL
5. **Validate all secrets** are present before starting OAuth flow

## Setting Secrets

Secrets are managed through the Lovable Cloud dashboard:
1. Go to Project Settings → Secrets
2. Add or update secret values
3. Secrets are automatically available in edge functions via `Deno.env.get('SECRET_NAME')`

## Troubleshooting

- If OAuth fails with "Missing credentials": Check that all HubSpot secrets are set
- If redirect fails: Verify APP_BASE_URL matches your deployment environment
- If state mismatch: Ensure HUBSPOT_REDIRECT_URI is correctly configured
