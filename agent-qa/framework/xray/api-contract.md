# Xray API Contract

Source of record for `scripts/xray/xray_endpoints.py`. Every fact below carries the URL it was
retrieved from and the retrieval date. Nothing here is written from memory; anything the vendor
documentation did not settle is in [`## Unverified`](#unverified) rather than guessed.

**All facts retrieved 2026-09-14** unless a line says otherwise.

Xray ships in two flavours that differ in base URL, API version, authentication model and the
multipart field names of feature import. The client dispatches on flavour for exactly these reasons.

---

## Flavour differences at a glance

| Concern | Cloud | Server / Data Center |
|---|---|---|
| Xray API host | `https://xray.cloud.getxray.app` (fixed, global) | The customer's own Jira host — configuration, not a constant |
| Xray API base path | `/api/v2` | `/rest/raven/<version>` on the Jira host |
| Auth model | Token exchange: `client_id` + `client_secret` → 24h JWT | No exchange. Jira credentials on every request (PAT bearer, or basic) |
| Bulk test import | `POST /api/v2/import/test/bulk`, **asynchronous**, returns `jobId` | **No Xray endpoint exists.** Falls back to Jira's own `POST /rest/api/2/issue/bulk`, synchronous |
| Feature import | `POST /api/v2/import/feature`, synchronous | `POST /rest/raven/1.0/import/feature`, synchronous |
| Feature import precondition field | `precondInfo` | `preCondInfo` (capital `C` — see Unverified) |
| Feature import success body | JSON object with `errors` / `updatedOrCreatedTests` / `updatedOrCreatedPreconditions` | JSON **array** of created/updated issues |
| JQL search | Jira Cloud `POST /rest/api/3/search/jql` on the site URL | Jira DC `POST /rest/api/2/search` on the Jira host |
| Jira search deprecation | `GET`/`POST /rest/api/3/search` are **deprecated and being removed** | `/rest/api/2/search` is current |

### `{base_url}` token

Server/DC installations live on the customer's Jira host, so every Server URL in
`xray_endpoints.py` carries a literal `{base_url}` token which the client substitutes with
`url.replace("{base_url}", self.base_url or "")`.

**The Cloud `search` URL also carries `{base_url}`.** This is deliberate and is the one place the
Cloud flavour is not fully absolute: JQL search is served by *Jira* Cloud, which lives at the
customer's own `https://<site>.atlassian.net`, not by the Xray Cloud API host. The other three
Cloud URLs are absolute and contain no token; substitution on them is a harmless no-op.

---

## Xray Cloud

### 1. Authentication — `auth`

- **Method / URL:** `POST https://xray.cloud.getxray.app/api/v2/authenticate`
- **Request headers:** `Content-Type: application/json`
- **Request body:** a JSON object with exactly two string fields:
  ```json
  { "client_id": "YOUR_CLIENT_ID", "client_secret": "YOUR_CLIENT_SECRET" }
  ```
- **Success response (200, `application/json`):** *not* an object. The body is
  "a JSON string (delimited with the `\"` character), containing the authorization token" — i.e. the
  raw bytes are `"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."` including the surrounding quotes.
  A caller extracts the token with `json.loads(body)`, **not** `body["token"]`. Getting this wrong
  is the most likely first-contact failure for this flavour.
- **Token type / lifetime:** a JWT carrying `iat` and `exp`; the documented gap is ~86400 seconds
  (24 hours). The REST API overview states the token "expires after 24 hours".
- **Using the token:** `Authorization: Bearer $token` on every subsequent Xray Cloud request. The
  authentication page itself does not state the header format; it is shown in the curl examples on
  the feature-import page (same retrieval date), which is where this fact comes from.
- **Error responses:** `400 BAD_REQUEST` wrong request syntax; `401 UNAUTHORIZED` the Xray license
  is not valid; `500 INTERNAL SERVER ERROR` internal authentication error.
- **Sources:**
  - https://docs.getxray.app/display/XRAYCLOUD/Authentication+-+REST+v2 (2026-09-14)
  - https://docs.getxray.app/display/XRAYCLOUD/REST+API (2026-09-14) — global base URL
    `https://xray.cloud.getxray.app/`, 24 hour expiry
  - https://docs.getxray.app/display/XRAYCLOUD/Importing+Cucumber+Tests+-+REST+v2 (2026-09-14) —
    `Authorization: Bearer $token`

#### Alternative considered and rejected

Xray Cloud also exposes the same exchange at `POST /api/v1/authenticate` (REST v1). v1 is the older
generation and its test-import page does not document v2 paths.
**Chosen: v2**, because the v2 pages are the currently maintained reference and v2 is what every
other endpoint in this contract uses; mixing generations invites version-skew bugs.
Source: https://docs.getxray.app/display/XRAYCLOUD/Importing+Tests+-+REST (2026-09-14).

### 2. JQL search — `search`

- **Method / URL:** `POST {base_url}/rest/api/3/search/jql`
  where `{base_url}` is the Jira Cloud site, e.g. `https://acme.atlassian.net`.
- **This is Jira's API, not Xray's.** It is authenticated with Jira credentials (basic auth with
  an Atlassian account email + API token, or OAuth 2.0), **not** with the Xray bearer token.
  The spec lists `security: [basicAuth, OAuth2(read:jira-work)]`.
- **Request body fields:** `jql`, `maxResults`, `fields`, `fieldsByKeys`, `expand`, `properties`,
  `nextPageToken`, `reconcileIssues`, `includeArchivedProjects`.
  Pagination is **token-based** (`nextPageToken`), not `startAt`-based.
- **Success response (200):** `SearchAndReconcileResults`.
- **Deprecation — load-bearing:** in Atlassian's own OpenAPI spec, both `GET /rest/api/3/search`
  and `POST /rest/api/3/search` are flagged `"deprecated": true` with the description
  "Endpoint is currently being removed." (CHANGE-2046). `GET` and `POST /rest/api/3/search/jql` are
  **not** deprecated. Do not write `/rest/api/3/search`.
- **Sources:**
  - https://developer.atlassian.com/cloud/jira/platform/swagger-v3.v3.json (2026-09-14) — fetched
    and inspected directly; the rendered HTML reference page was too large for reliable extraction,
    so the machine-readable spec was used as the authority for the deprecation flags and body schema.
  - https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/ (2026-09-14)

#### Alternative considered and rejected

Xray Cloud also offers a GraphQL API at `POST https://xray.cloud.getxray.app/api/v2/graphql`, whose
`getTests(jql:, limit:)` query accepts JQL and returns Xray-native test data (steps, test type)
that the Jira REST API cannot return. Trade-offs: it is authenticated with the Xray bearer token
(one credential instead of two), but it caps `limit` at 1–100, errors if the JQL matches more than
100 issues, and has **no Server/DC counterpart**, so it cannot be dispatched to symmetrically.
**Chosen: Jira REST search**, because the contract requires one `search` key that means the same
thing in both flavours. Revisit GraphQL only if Xray-native test fields are needed on Cloud.
Source: https://docs.getxray.app/display/XRAYCLOUD/GraphQL+API (2026-09-14).

### 3. Bulk test import — `import_tests`

- **Method / URL:** `POST https://xray.cloud.getxray.app/api/v2/import/test/bulk`
- **Auth header:** `Authorization: Bearer $token`
- **ASYNCHRONOUS.** The call queues a job and returns its id; the caller must poll.
- **Request body:** a JSON **array** of test objects. Per-object fields:
  - `testtype` (required) — `Cucumber`, `Manual`, `Generic`, ...
  - `fields` — standard Jira issue fields, including `summary` and `project`
  - `steps` (manual) / `gherkin_def` (cucumber) / `unstructured_def` (generic)
  - `xray_test_sets` — array of test set keys/ids
  - `xray_test_repository_folder` — destination folder path
  - `update` — Jira bulk-create update structure
- **Success response (200):** `{"jobId": "<string>"}`
- **Poll URL:** `GET https://xray.cloud.getxray.app/api/v2/import/test/bulk/{jobId}/status`
- **Status values:** `pending`, `working`, `failed`, `successful`, `partially_successful`,
  `unsuccessful`. A completed job's `result` carries two sections: `errors` (tests not imported,
  with reasons) and `issues` (imported issues with Jira id, key and self URL).
- **Error responses:** `400` invalid format **or an existing job already in progress**; `401`
  invalid Xray license; `500` internal error.
- **Limits:** max **1000 tests per request**; **one import job per user at a time** — starting a
  second while one runs returns `400`. A client that fans out concurrently will fail on this.
- **Sources:**
  - https://docs.getxray.app/display/XRAYCLOUD/Importing+Tests+-+REST+v2 (2026-09-14)
  - https://docs.getxray.app/display/XRAYCLOUD/Importing+Tests+-+REST (2026-09-14) — v1 paths,
    status value list, one-job-per-user constraint

### 4. Gherkin feature import — `import_feature`

- **Method / URL:** `POST https://xray.cloud.getxray.app/api/v2/import/feature`
- **Auth header:** `Authorization: Bearer $token`
- **SYNCHRONOUS.** A `200 OK` means the import completed.
- **Query parameters:** `projectKey` (Jira project key), `projectId` (Jira project id), `source`
  (optional designation, e.g. project name). Supply `projectKey` **or** `projectId`.
- **Body:** `multipart/form-data` with these part names:
  - `file` — a single `.feature` file, **or** a ZIP containing several; files inside the ZIP may sit
    in folders/subfolders
  - `testInfo` — optional JSON file of extra test information
  - `precondInfo` — optional JSON file of extra precondition information
- **Success response (200):**
  ```json
  {
    "errors": [],
    "updatedOrCreatedTests": [{ "id": "string", "key": "string", "self": "string" }],
    "updatedOrCreatedPreconditions": [{ "id": "string", "key": "string", "self": "string" }]
  }
  ```
- **Error responses:** `400 BAD_REQUEST`, `401 UNAUTHORIZED` ("The Xray license is not valid"),
  `500 INTERNAL SERVER ERROR` — all `text/plain`, so a client must not assume JSON on failure.
  `413 Request Entity Too Large` for bodies over roughly 100 MB.
- **Source:** https://docs.getxray.app/display/XRAYCLOUD/Importing+Cucumber+Tests+-+REST+v2 (2026-09-14)

---

## Xray Server / Data Center

### Base path

`https://<site-url>/rest/raven/<api-version>/api/<resource-name>`, with versions `1.0` and `2.0`
(`latest` resolves to `2.0`). "All existing endpoints on v1.0 also exist on v2.0 by replacing the
`1.0` by `2.0` on the URL", unless intentionally deprecated and removed.

Note the *import* endpoints sit at `/rest/raven/<version>/import/...` — **without** the `/api/`
segment that the resource endpoints carry. This asymmetry is easy to get wrong.

Source: https://docs.getxray.app/display/XRAY/REST+API (2026-09-14).

### 1. Authentication — `auth`

- **There is no token-exchange endpoint.** This is the single biggest divergence from Cloud. Xray
  Server/DC is a Jira app; it authenticates with **Jira's** credentials presented on every request.
  A client's `_auth_body()` for this flavour must send **no body and make no call**.
- Documented methods:
  1. **Personal Access Token** (Jira 8.14+) — `Authorization: Bearer <token>`
  2. **Basic authentication** — Jira username + password, `Authorization: Basic <base64(user:pass)>`
     (shown in the vendor's curl examples as `-u admin:admin`)
  3. **OAuth** — mentioned as available but not detailed on the page
- **Chosen: Personal Access Token.** Trade-offs: basic auth is universally available including on
  pre-8.14 Jira and needs no server-side setup, but it puts a reusable account password in config
  and is disabled outright on many hardened instances. A PAT is revocable, scoped to one user, and
  uses the *same* `Authorization: Bearer ...` header shape as Cloud — so the client's request layer
  is identical across flavours and only the token's *origin* differs. Basic auth is recorded here
  as the documented fallback if a deployment predates 8.14.
- **`auth` URL in the constants:** because no exchange endpoint exists, the `auth` key holds
  `{base_url}/rest/api/2/myself` — Jira's own identity endpoint, used as a **credential-validation
  probe** for health-check. It returns the authenticated user and **does not return a token**.
  A client must not try to parse a token out of it. `AUTH_STYLE["server"]["style"]` is
  `per_request_header` and `sends_body` is `False`, which is the authoritative signal.
- **Source:** https://docs.getxray.app/display/XRAY/REST+API (2026-09-14)

### 2. JQL search — `search`

- **Method / URL:** `POST {base_url}/rest/api/2/search` — Jira DC's own platform API, API version
  **2** (not 3; v3 is Cloud-only).
- **Request body:** `{"jql": "...", "startAt": 0, "maxResults": 15, "fields": ["summary","status","assignee"]}`
  Pagination is **offset-based** (`startAt`), unlike Cloud's `nextPageToken`. A client cannot share
  one paginator between flavours.
- `GET /rest/api/2/search?jql=...` also exists for short queries; `POST` is chosen because JQL for a
  set of test-case keys grows past sane URL length quickly.
- **Auth:** the same Jira credentials as everything else on this flavour (`-u user:pass` in the
  vendor examples, or PAT bearer).
- **Sources:**
  - https://docs.atlassian.com/software/jira/docs/api/REST/9.12.0/ (2026-09-14) — fetched directly;
    contains the `POST /rest/api/2/search` request schema quoted above
  - https://developer.atlassian.com/server/jira/platform/jira-rest-api-examples/ (2026-09-14) —
    curl examples with basic auth

### 3. Bulk test import — `import_tests`

- **No Xray Server/DC endpoint equivalent to Cloud's `/api/v2/import/test/bulk` is documented.**
  The Xray Server/DC "Tests - REST" page documents only *export* operations
  (`GET /rest/raven/1.0/api/test`, `.../testruns`, `.../preconditions`, `.../testsets`,
  `.../testexecutions`, `.../testplans`) plus creating Test issues through the standard Jira REST
  API. There is no bulk test-definition import resource.
- **Consequence — the flavours are not symmetric here.** The documented Server/DC route to create
  many Test issues is Jira's own bulk create:
  - **Method / URL:** `POST {base_url}/rest/api/2/issue/bulk`
  - "Creates issues or sub-tasks from a JSON representation. Creates many issues in one bulk
    operation."
  - **Request body:** `{"issueUpdates": [ { "fields": {...}, "update": {...} }, ... ]}`
  - **SYNCHRONOUS** — it returns the created issues directly. There is no job id and **nothing to
    poll**. A client that polls after a Server import will hang or 404.
  - This creates the Test *issues* but **not their steps**. Manual test steps are added afterwards,
    one call per step, via `PUT {base_url}/rest/raven/1.0/api/test/{testKey}/step` with body
    `{"step": "...", "data": "...", "result": "...", "attachments": [...]}`. The `attachments`
    entries carry `data` (base64), `filename`, `contentType`.
- **Sources:**
  - https://docs.getxray.app/display/XRAY/Tests+-+REST (2026-09-14) — export-only; no bulk import
  - https://docs.atlassian.com/software/jira/docs/api/REST/9.12.0/ (2026-09-14) —
    `POST /rest/api/2/issue/bulk`
  - https://docs.getxray.app/display/XRAY/Test+Steps+-+REST (2026-09-14) — step creation

### 4. Gherkin feature import — `import_feature`

- **Method / URL:** `POST {base_url}/rest/raven/1.0/import/feature`
- **SYNCHRONOUS.** A blocking request; `200 OK` means it completed.
- **Query parameters:**
  - `projectKey` (String, **required**) — project where tests/pre-conditions are created
  - `updateRepository` (Boolean, optional, default `false`) — organise imported tests into Test
    Repository folders. **This parameter has no Cloud counterpart**; Cloud instead has `projectId`
    and `source`, which Server does not.
- **Body:** `multipart/form-data`:
  - `file` — one `.feature` file or a ZIP of several (folders/subfolders allowed)
  - `testInfo` — optional JSON file configuring the created Test issues
  - `preCondInfo` — optional JSON file configuring the created Pre-Condition issues.
    **Note the capital `C`**: Cloud spells the same part `precondInfo`. See Unverified.
- **Success response (200):** `Content-Type: application/octet-stream`, body is a JSON **array** of
  created/updated issues, each with `id`, `key`, `self` and `issueType` — a different shape from
  Cloud's object-with-three-lists. A client must branch on flavour when parsing this response, and
  must not trust the `Content-Type` header to be JSON.
- **Error responses:** `400 BAD_REQUEST`, `401 UNAUTHORIZED`, `500 INTERNAL_SERVER_ERROR`, all
  `text/plain`.
- **Version note:** the vendor documents this at `1.0`. The REST API overview's general rule says
  v1.0 endpoints are also reachable at `2.0`, but the import page itself only ever shows `1.0`, so
  `1.0` is what the constants use. See Unverified.
- **Source:** https://docs.getxray.app/display/XRAY/Importing+Cucumber+Tests+-+REST (2026-09-14)

---

## Unverified

Nothing below was settled by the vendor documentation. It is recorded as a gap on purpose; the
next task may not assume any of it.

1. **`precondInfo` (Cloud) vs `preCondInfo` (Server) casing.** Both spellings are taken from their
   respective vendor pages as written, and the difference is plausible given the two codebases —
   but it is also exactly the shape of a documentation typo. Neither page cross-references the
   other. Not confirmable without a live instance of each. This field is optional, so a first
   implementation should simply not send it rather than risk a silent no-op.

2. **Whether `/rest/raven/2.0/import/feature` works on Server/DC.** The REST API overview states
   the general v1.0→v2.0 rule, but the feature-import page shows only `1.0`, and the overview's rule
   is qualified by "unless they have been deprecated and removed intentionally". Untested.

3. **The exact `steps` object schema for Cloud's `import/test/bulk`.** The page names the field and
   says it applies to manual tests, but the retrieved content did not spell out the per-step keys
   (presumably `action`/`data`/`result`, matching the GraphQL schema, but that is an inference, not
   a retrieved fact). The next task must re-check this page before serialising manual steps.

4. **Whether Xray Cloud's bearer token is accepted by the Jira Cloud search endpoint.** Almost
   certainly not — they are different products with different issuers — but no vendor page states
   it either way. The contract therefore assumes two separate credentials on Cloud (Xray API key
   for Xray endpoints, Jira basic auth or OAuth for search). If a deployment finds otherwise, this
   is where to record it.

5. **Jira Cloud `search/jql` removal timeline for the deprecated `/rest/api/3/search`.** The spec
   says only "currently being removed" and points at CHANGE-2046; the changelog entry itself was not
   retrieved, so no date is pinned here. Irrelevant to implementation — we use `search/jql` — but it
   means the deprecated path may already be dead on some sites.

6. **Xray Cloud region-specific hosts.** The GraphQL documentation is served from
   `us.xray.cloud.getxray.app`, which implies regional hosts exist, but the REST API overview names
   `https://xray.cloud.getxray.app/` as "the global REST API base URL for all endpoints" with no
   discussion of regional variants. Whether an EU/US-pinned tenant must use a different Xray host
   is not established.

7. **Xray Server/DC OAuth.** Listed as supported on the REST API page but not detailed there, and no
   linked detail page was retrieved. Only PAT and basic auth are described well enough to implement.

8. **Rate limits.** No vendor page retrieved states a request rate limit for either flavour. The
   only documented throttles are structural: 1000 tests per Cloud bulk request, one concurrent
   Cloud import job per user, ~100 MB feature upload, and GraphQL's 1–100 `limit`.
