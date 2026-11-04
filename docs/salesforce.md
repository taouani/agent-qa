# Salesforce sign-in

Agent-QA's Playwright work (exploring the app, then running the tests it writes) signs in to Salesforce the way your test repo does: with the **OAuth 2.0 JWT bearer flow** of an External Client App. No password is typed, so Salesforce's MFA prompt never applies.

## Setup

In `agent-qa.yaml`:

```yaml
salesforce:
  baseUrl: https://acme--uat.sandbox.my.salesforce.com
  loginUrl: https://test.salesforce.com   # sandboxes; production uses https://login.salesforce.com
  clientId: ${env:SF_CLIENT_ID}            # the app's consumer key
  privateKey: ${env:SF_JWT_KEY}            # the app's RSA private key (PEM)
  # privateKeyFile: ../certs/server.key    # or a key file, outside the repo
  users:
    StoreManager-FRA: ${env:SF_USER_STOREMANAGER_FRA}
    Approver-EUR: ${env:SF_USER_APPROVER_EUR}
```

- **Key.** Give exactly one of `privateKey` (a secret reference) or `privateKeyFile` (a path to the PEM file). Keep the file out of git; `agent-qa doctor` warns when it is inside the project.
- **Users.** List one user per role. A role name is your own label, such as a function and a country. A username may be written out, but a reference keeps personal data out of git.
- **Permission set.** Each user needs the permission set that carries the External Client App. Without it, sign-in fails with `invalid_app_access`.
- **Reusing your repo's settings.** If your test repo already has `.env` with `SF_CLIENT_ID` and `SF_JWT_KEY`, the same variables work here.

## What happens at sign-in

1. Agent-QA signs a short-lived assertion (three minutes) with the private key.
2. It exchanges the assertion at `{loginUrl}/services/oauth2/token` for an access token.
3. It exchanges that token at `{instance}/services/oauth2/singleaccess` for a single-use frontdoor URL, which opens the browser session.

Nothing is stored: no session file, no token on disk. The frontdoor URL works once, for about a minute, and only a URL on the org's own site is opened. Neither the URL nor the token is logged, saved in a run folder or shown to a model. Errors name the OAuth code and its usual fix (for example `invalid_grant`: the key doesn't match the app's certificate, or the audience is wrong), never the username or Salesforce's own text.

## Check it

```bash
agent-qa doctor            # signs in each role (an access token only) and reports by role name
agent-qa doctor --offline  # only checks that the key can be read
```
