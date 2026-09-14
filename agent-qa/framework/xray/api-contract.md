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
| Xray API host | `https://xray.cloud.getxray.app` by default, with `us.` / `eu.` / `au.` regional hosts for data-residency tenants — so configuration, not a constant | The customer's own Jira host — configuration, not a constant |
| Xray API base path | `/api/v2` | `/rest/raven/<version>` on the Jira host |
| Auth model | Token exchange: `client_id` + `client_secret` → 24h JWT | No exchange. Jira credentials on every request (PAT bearer, or basic) |
| Bulk test import | `POST /api/v2/import/test/bulk`, **asynchronous**, returns `jobId` | **No Xray endpoint exists.** Falls back to Jira's own `POST /rest/api/2/issue/bulk`, synchronous |
| Feature import | `POST /api/v2/import/feature`, synchronous | `POST /rest/raven/1.0/import/feature`, synchronous |
| Feature import precondition field | `precondInfo` | `preCondInfo` (capital `C` — see Unverified) |
| Feature import success body | JSON object with `errors` / `updatedOrCreatedTests` / `updatedOrCreatedPreconditions` | JSON **array** of created/updated issues |
| JQL search | Jira Cloud `POST /rest/api/3/search/jql` on the site URL | Jira DC `POST /rest/api/2/search` on the Jira host |
| Jira search deprecation | `GET`/`POST /rest/api/3/search` are **deprecated and being removed** | `/rest/api/2/search` is current |

### Substitution tokens

Two tokens, resolved the same way:

```python
url.replace("{base_url}",   self.base_url or "")
url.replace("{cloud_host}", self.cloud_host or DEFAULT_CLOUD_HOST)
```

**`{base_url}` — the customer's Jira host.** Server/DC installations live there, so every Server
URL carries it. **The Cloud `search` URL carries it too**, deliberately: JQL search is served by
*Jira* Cloud at the customer's own `https://<site>.atlassian.net`, not by the Xray Cloud API host.

**`{cloud_host}` — the Xray Cloud API host.** The three Cloud URLs that are genuinely Xray's
(`auth`, `import_tests`, `import_feature`) carry it. Cloud `search` does **not** — it is a Jira
endpoint, not an Xray one.

Xray Cloud documents regional hosts for data-residency tenants:

| Region | Host |
|---|---|
| Global (default) | `https://xray.cloud.getxray.app/` |
| USA | `https://us.xray.cloud.getxray.app/` |
| EU | `https://eu.xray.cloud.getxray.app/` |
| Australia | `https://au.xray.cloud.getxray.app/` |

The vendor's wording: "For deployments that use data residency, please use the URL that matches
your Xray region for more performant API." Note the precise strength of that claim — the regional
host is **recommended for performance**, and the page does not state that the global host fails for
such tenants. Hardcoding the global host was nonetheless a latent defect: a residency tenant had no
way to point the client at its own region. Config key **`xray_cloud_host`** overrides it, defaulting
to `DEFAULT_CLOUD_HOST = "xray.cloud.getxray.app"`.

Source: https://docs.getxray.app/display/XRAYCLOUD/REST+API (2026-09-14).

---

## Xray Cloud

### 1. Authentication — `auth`

- **Method / URL:** `POST https://{cloud_host}/api/v2/authenticate`
  (default host `xray.cloud.getxray.app`; see [Substitution tokens](#substitution-tokens))
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
- **This is Jira's API, not Xray's.** It is authenticated with Jira credentials, **not** with the
  Xray bearer token. The spec lists `security: [basicAuth, OAuth2(read:jira-work)]`.
- **Shape of that second credential** (recorded in `AUTH_STYLE["cloud"]["search_credential"]` so the
  client need not re-derive it from prose):
  - style `basic_auth`; **no** token-exchange call, no request body
  - fields: `jira_email` (the Atlassian account email) and `jira_api_token`
  - header `Authorization: Basic <base64(jira_email + ":" + jira_api_token)>`, standard base64
    alphabet, not URL-safe
  - no expiry — an Atlassian API token lives until revoked
  - alternative: OAuth 2.0 with scope `read:jira-work`
  - So **Cloud needs two credentials**: an Xray API key pair for the Xray endpoints, and a Jira
    credential for search. Whether the Xray token happens to be accepted by Jira search is
    genuinely unverified (see Unverified #4); the shape above is what to send when it is not.
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

Xray Cloud also offers a GraphQL API at `POST https://{cloud_host}/api/v2/graphql` (same regional
host substitution as the other Xray Cloud endpoints), whose
`getTests(jql:, limit:)` query accepts JQL and returns Xray-native test data (steps, test type)
that the Jira REST API cannot return. Trade-offs: it is authenticated with the Xray bearer token
(one credential instead of two), but it caps `limit` at 1–100, errors if the JQL matches more than
100 issues, and has **no Server/DC counterpart**, so it cannot be dispatched to symmetrically.
**Chosen: Jira REST search**, because the contract requires one `search` key that means the same
thing in both flavours. Revisit GraphQL only if Xray-native test fields are needed on Cloud.
Source: https://docs.getxray.app/display/XRAYCLOUD/GraphQL+API (2026-09-14).

### 3. Bulk test import — `import_tests`

- **Method / URL:** `POST https://{cloud_host}/api/v2/import/test/bulk`
- **Auth header:** `Authorization: Bearer $token`
- **ASYNCHRONOUS.** The call queues a job and returns its id; the caller must poll.
- **Request body:** a JSON **array** of test objects. Per-object fields:

  | Field | Status | Meaning |
  |---|---|---|
  | `testtype` (or `xray_testtype`) | required | `Cucumber`, `Manual`, `Generic`, ... |
  | `fields` | required | Standard Jira issue fields, including `summary` and `project` |
  | `steps` | optional | Manual test steps — see the schema below |
  | `gherkin_def` | optional | Cucumber scenario definition |
  | `unstructured_def` | optional | Generic test definition |
  | `xray_test_sets` | optional | Array of test set keys/ids |
  | `xray_test_repository_folder` | optional | Destination folder path |
  | `xray_issue_type` | optional | Issue type override |
  | `update` | optional | Jira bulk-create update structure |
  | `xray_id` | **required for test sets only** | "A unique identifier for a test set in the input" — it identifies a *test set* object, not a regular test object, so a payload of plain tests does not carry it |

- **Manual step schema — documented, not inferred:**
  ```json
  "steps": [ { "action": "...", "data": "...", "result": "..." } ]
  ```
  Exactly three keys per step: `action`, `data`, `result`, all lowercase. Exported as
  `CLOUD_TEST_STEP_FIELDS`. Note this is **not** the shape Server/DC's v2 step API uses — see the
  Server section; the two are easy to confuse and neither accepts the other's keys.
- **Success response (200):** `{"jobId": "<string>"}`
- **Poll URL:** `GET https://{cloud_host}/api/v2/import/test/bulk/{jobId}/status`
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

- **Method / URL:** `POST https://{cloud_host}/api/v2/import/feature`
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
    one call per step.

#### Server step API — two versions, two different body shapes

**Pinned: v1.0.** `PUT {base_url}/rest/raven/1.0/api/test/{testKey}/step`, flat body:

```json
{ "step": "...", "data": "...", "result": "...",
  "attachments": [ { "data": "<base64>", "filename": "...", "contentType": "..." } ] }
```

**A v2.0 surface also exists** and is richer — it offers full CRUD where v1.0 documents only
creation:

| Operation | Method | Path |
|---|---|---|
| List steps | GET | `{base_url}/rest/raven/2.0/api/test/{testKey}/steps` |
| Create step | POST | `{base_url}/rest/raven/2.0/api/test/{testKey}/steps` |
| Get step | GET | `{base_url}/rest/raven/2.0/api/test/{testKey}/steps/{stepId}` |
| Update step | PUT | `{base_url}/rest/raven/2.0/api/test/{testKey}/steps/{stepId}` |
| Delete step | DELETE | `{base_url}/rest/raven/2.0/api/test/{testKey}/steps/{stepId}` |

Two traps, both load-bearing for Task 6:

1. **The path segment is `steps` (plural) on v2.0 and `step` (singular) on v1.0.**
2. **The bodies are not interchangeable.** v2.0 nests Jira *display-name* keys under `fields`:
   ```json
   { "fields": { "Action": "...", "Data": "...", "Expected Result": "..." },
     "attachments": [ { "data": "<base64>", "filename": "...", "contentType": "..." } ] }
   ```
   versus v1.0's flat lowercase `step`/`data`/`result`. Swapping the URL without swapping the
   serialiser produces steps with empty fields rather than an error. (The vendor's own collection
   spells the first key `"action"` in one example and `"Action"` in another, so the display-name
   casing is itself worth confirming against a live instance before relying on v2.0.)

v1.0 stays pinned as the safer floor; the v2.0 surface is exported as `SERVER_TEST_STEP_URL_V2`
and `SERVER_TEST_STEP_V2_OPERATIONS` so Task 6 knows it is available if it needs update or delete.

Sources: https://docs.getxray.app/display/XRAY/Test+Steps+-+REST (2026-09-14) for v1.0;
https://github.com/Xray-App/xray-postman-collections `Xray_REST_API_v2.0.postman_collection.json`
(2026-09-14, fetched and parsed directly) for the v2.0 surface and its request bodies.
- **Sources:**
  - https://docs.getxray.app/display/XRAY/Tests+-+REST (2026-09-14) — export-only; no bulk import
  - https://docs.atlassian.com/software/jira/docs/api/REST/9.12.0/ (2026-09-14) —
    `POST /rest/api/2/issue/bulk`
  - https://docs.getxray.app/display/XRAY/Test+Steps+-+REST (2026-09-14) — step creation

### 4. Updating an existing Test — `update_issue`

Xray Server/DC documents no endpoint that updates an existing Test *definition*. A Test is an
ordinary Jira issue, so its fields are updated through core Jira, exactly as its creation goes
through core Jira's `issue/bulk` rather than through Xray.

- **Method / URL:** `PUT {base_url}/rest/api/2/issue/{issueKey}`
- **Request body:** `{"fields": {...}}` — only the fields being changed.
- **SYNCHRONOUS.** Returns `204 No Content` on success, with no body.
- `project` and `issuetype` must **not** be sent on an update; Jira rejects attempts to change them
  through this resource.
- Exported as `SERVER_ISSUE_URL`.

**Steps are deliberately not updated through this path, and the client tells the user so.** The
reasons are load-bearing:

- v1.0's `PUT .../api/test/{testKey}/step` documents step **creation** only. Calling it against a
  Test that already has steps appends a second copy, so a re-run would duplicate every step.
- v2.0 can list, update and delete steps, but its field keys are Jira display names whose casing is
  unconfirmed ([`## Unverified`](#unverified) item 3) — and a failure partway through a
  delete-then-recreate leaves a customer's Test with **no steps at all**. Losing real data to avoid
  stale data is not an acceptable trade.

The consequence is a real, stated limitation: on Server/DC an edited test step does not propagate on
re-upload and must be applied by hand. Settling Unverified item 3 against a live instance is what
would let a safe step-replace take its place; until then the notice is the honest behaviour. See
[`## Unverified`](#unverified) item 6.

- **Sources:**
  - https://docs.atlassian.com/software/jira/docs/api/REST/9.12.0/ (2026-09-15) —
    `PUT /rest/api/2/issue/{issueIdOrKey}`

### 5. Gherkin feature import — `import_feature`

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
- **Version note — settled.** The vendor documents this page at `1.0`, but Xray's official Postman
  collection issues `POST {{JIRA_BASEURL}}/rest/raven/2.0/import/feature?projectKey={{PROJECT_KEY}}`
  with a `multipart/form-data` `file` part. So the v1.0→v2.0 rule **does** hold for this endpoint
  and 2.0 is real; this is no longer a doubt. `1.0` remains the pinned choice as the safer floor —
  it is what the documentation page itself shows, and it works on older Xray versions. 2.0 is
  exported as `SERVER_IMPORT_FEATURE_URL_V2` for a caller that wants it.
  Source: https://github.com/Xray-App/xray-postman-collections
  `Xray_REST_API_v2.0.postman_collection.json` (2026-09-14, fetched and parsed directly).
- **Source:** https://docs.getxray.app/display/XRAY/Importing+Cucumber+Tests+-+REST (2026-09-14)

---

## Unverified

Nothing below was settled by the vendor documentation, and each entry says **why public
documentation cannot settle it**. It is recorded as a gap on purpose; the next task may not assume
any of it.

Three items that stood here in the first revision have since been settled and moved into the
contract proper: the Cloud manual-step schema (`action`/`data`/`result`), the existence of
`/rest/raven/2.0/import/feature`, and the existence of regional Cloud hosts.

1. **`precondInfo` (Cloud) vs `preCondInfo` (Server) casing.** Both spellings are taken from their
   respective vendor pages as written, and the difference is plausible given two codebases — but it
   is also exactly the shape of a documentation typo.
   *Why documentation cannot settle it:* the two pages describe different products and neither
   cross-references the other, so there is no authority that compares them; only a live instance of
   each can show which spelling the server actually accepts. Worse, the part is **optional**, so a
   wrong spelling is silently ignored rather than rejected — no error would reveal the mistake.
   **Mitigation:** do not send this part in a first implementation.

2. **Whether the Xray Cloud bearer token is accepted by the Jira Cloud search endpoint.** Almost
   certainly not — different products, different token issuers.
   *Why documentation cannot settle it:* this is a negative interoperability claim spanning two
   vendors' products. Atlassian documents what Jira accepts (`basicAuth`, OAuth2) and Xray documents
   what its own token is for; neither has reason to state what the *other* product's token does.
   The contract therefore assumes two separate Cloud credentials, whose shape is recorded in
   `AUTH_STYLE["cloud"]["search_credential"]`. Only a live call can prove otherwise.

3. **Server/DC v2.0 step field display-name casing.** The v2.0 create-step body nests Jira
   display-name keys under `fields`, but the vendor's own collection writes `"action"` in one
   example and `"Action"` in another.
   *Why documentation cannot settle it:* these are Jira **custom-field display names**, which are
   instance-specific and localisable — the correct string depends on the target Jira's field
   configuration and language, so no document could state one universally right answer. Immaterial
   while v1.0 stays pinned, since v1.0 uses fixed lowercase keys.

4. **Xray Server/DC OAuth.** Listed as supported on the REST API page but not detailed there.
   *Why documentation cannot settle it:* no linked detail page was retrievable, and OAuth 1.0a on
   Jira Server requires a per-instance application link and consumer key created by an
   administrator — configuration that is by nature site-specific and cannot be pinned centrally.
   Only PAT and basic auth are described well enough to implement.

5. **Rate limits.** No vendor page states a request rate limit for either flavour.
   *Why documentation cannot settle it:* Atlassian Cloud rate limits are dynamic and
   tenant-dependent (published as cost budgets that vary by plan and current load) rather than
   fixed numbers, and Server/DC limits are whatever the customer's own reverse proxy imposes. The
   only *structural* throttles are documented and are in the contract: 1000 tests per Cloud bulk
   request, one concurrent Cloud import job per user, ~100 MB feature upload, GraphQL `limit` 1–100.
   **Mitigation:** the client should honour `Retry-After` and back off on 429 rather than assume a
   ceiling.

6. **A safe step-replace on Server/DC.** Updating the steps of an existing Test needs either a
   verified v2.0 field-key casing (item 3) or a transactional replace that cannot leave a Test
   empty. Neither exists today.
   *Why documentation cannot settle it:* item 3 is instance-specific by nature, and no vendor page
   describes any atomic replace-all-steps operation — the v2.0 surface is per-step CRUD, so
   atomicity would have to come from the server and does not.
   **Mitigation:** do not update steps; state the limitation in the run report.

7. **What `import_feature` matches on, and whether re-importing a feature file updates its tests
   or creates second copies.** Both flavours name the success field `updatedOrCreatedTests`, which
   asserts that updating is *possible* but never says what makes an incoming scenario "the same
   test" as one already in the project — scenario name, a tag, the file name, the Test Repository
   path, or nothing at all. Nor does either page say what happens on a second import of an
   unchanged file.
   *Why documentation cannot settle it:* this is server-side matching behaviour, not a request or
   response contract. Neither vendor page describes the algorithm, and the single field name that
   hints at it (`updatedOrCreated`) is deliberately non-committal — it is written to cover both
   outcomes precisely so the vendor need not commit to which one occurs. No document can be read
   to settle a behaviour the document declines to state; only importing the same file twice into a
   live project and counting the resulting Test issues can.
   **Mitigation:** do not attempt client-side deduplication, which would need the same unknown
   matching rule to be correct. Send every `.feature` file on every run, classify each returned key
   as "updated" when the label lookup already knew it, and **say so in the run report** so a user
   who finds duplicates knows the cause. `upload.run()` emits that notice whenever a run imports
   Gherkin.

8. **Whether Xray Cloud's bulk test import honours a top-level `key` field as "update this issue".**
   The contract's `import_tests` field table lists `testtype`, `fields`, `steps`, `gherkin_def`,
   `unstructured_def`, `xray_test_sets`, `xray_test_repository_folder`, `xray_issue_type`, `update`
   and `xray_id`. **`key` is not among them**, yet it is the only plausible way to aim a bulk-import
   entry at an existing issue, and the payload builder sends it for every test the label lookup
   already found.
   *Why documentation cannot settle it:* the field table is a positive enumeration, not a closed
   one — it never states that unlisted fields are rejected, ignored, or passed through to Jira. So
   the documentation is equally consistent with `key` working, with it being silently dropped, and
   with it being an error; absence from a list is not a statement about behaviour. Only a live
   tenant can show which.
   **Mitigation:** none needed beyond visibility, because this assumption fails *loudly enough*: if
   `key` is ignored, the job returns new issue keys, they are not in the set of keys that were sent,
   and the run reports them as **created** rather than updated. A user re-running an unchanged
   folder sees a created count where they expected an updated count. Keep the top-level `key` and
   keep classifying on the keys sent, never on response ordering.
