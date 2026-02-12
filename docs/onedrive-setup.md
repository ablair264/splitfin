# OneDrive (Microsoft Graph) Setup

This project stores OneDrive OAuth tokens in Neon and uses the backend to call Microsoft Graph.

## 1) Environment variables (backend)

Set these in the backend runtime environment:

- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `MS_REDIRECT_URI` (must match the Azure app registration redirect URI)
- `MS_TENANT` (optional, default `consumers` for Microsoft 365 Family)
- `MS_SCOPES` (optional, default `offline_access Files.Read User.Read`)
- `FRONTEND_URL` (optional, used to redirect after OAuth)

## 2) Database table (Neon)

Run this once on Neon:

```sql
CREATE TABLE IF NOT EXISTS onedrive_tokens (
  agent_id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  scope TEXT,
  token_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 3) OAuth callback URL

Configure your Microsoft app registration to allow:

```
{BACKEND_BASE_URL}/api/v1/onedrive/callback
```

## 4) User allowlist

OneDrive connect is restricted to the agent id `sammie` in the backend and UI.
