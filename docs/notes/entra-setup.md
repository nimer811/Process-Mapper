# Setting up sign-in with Microsoft Entra ID

Process AI uses one Entra app registration for both the web app (sign-in) and the API (token
checks). Until it is configured, the app keeps using development users.

## 1. Register the app (Entra admin centre → App registrations → New registration)
- **Name:** Process AI
- **Supported account types:** accounts in this organisational directory only (single tenant)
- **Redirect URI:** platform **Single-page application (SPA)**, `https://<your-host>/`
  (add `http://localhost:8080/` for local testing)

Note the **Application (client) ID** and **Directory (tenant) ID**.

## 2. Expose the API
- **Expose an API → Application ID URI:** accept `api://<client id>`
- **Add a scope:** `access_as_user`, who can consent: Admins and users,
  display name "Access Process AI"
- **API permissions:** add *My APIs → Process AI → access_as_user*, then **Grant admin consent**

## 3. Use access-token version 2
In **Manifest**, set `"requestedAccessTokenVersion": 2` (Microsoft Graph App Manifest:
`api.requestedAccessTokenVersion`). The API checks the v2 issuer
`https://login.microsoftonline.com/<tenant>/v2.0`.

## 4. Admins
Either:
- **Group:** create (or pick) a security group for Process AI admins. In **Token configuration →
  Add groups claim**, include *Security groups* in the **access** token. Set
  `ENTRA_ADMIN_GROUP_ID` to the group's object id; or
- **App role:** in **App roles**, create a role with value `Admin` (allowed: Users/Groups) and assign
  people or a group to it in **Enterprise applications → Process AI → Users and groups**.

Everyone else in the tenant who signs in becomes a normal user (accounts are created on first
sign-in; existing users are matched by email). To limit who can sign in at all, set **Assignment
required = Yes** in the enterprise application and assign the pilot users or group.

## 5. Configure Process AI
```
AUTH_MODE=entra
ALLOW_DEV_AUTH=false
ENTRA_TENANT_ID=<directory (tenant) id>
ENTRA_CLIENT_ID=<application (client) id>
ENTRA_ADMIN_GROUP_ID=<group object id>   # or rely on the Admin app role
```
For Docker Compose these go in `.env`. In Azure Container Apps, set them as environment variables
(secrets are not needed: none of these values are secret).

Signing out signs the person out of Process AI and returns them to the sign-in page.
