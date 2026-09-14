"""Xray REST endpoint constants for the Cloud and Server/Data Center flavours.

Source of record: ``agent-qa/framework/xray/api-contract.md``. That document carries the
vendor documentation URL and retrieval date behind every value here, the trade-offs behind
each choice where the vendor offers more than one way to do something, and an ``## Unverified``
section listing what the documentation did not settle. Do not change a value here without
changing the contract, and do not assume anything the contract lists as unverified.

Python 3.8 floor, standard library only: plain dicts and strings, no dependencies.

Two things a consumer must know before using these:

1. Two substitution tokens, resolved the same way::

       url.replace("{base_url}", self.base_url or "")
       url.replace("{cloud_host}", self.cloud_host or DEFAULT_CLOUD_HOST)

   ``{base_url}`` is the customer's own Jira host. Every Server/DC URL carries it, and so does
   the Cloud ``search`` URL -- deliberately: JQL search is served by *Jira* Cloud at
   ``https://<site>.atlassian.net``, not by the Xray Cloud API host.

   ``{cloud_host}`` is the Xray Cloud API host. The three Cloud URLs that are genuinely Xray's
   carry it, because data-residency tenants are served from regional hosts
   (``us.`` / ``eu.`` / ``au.xray.cloud.getxray.app``) which the vendor recommends using for a
   more performant API. Config key ``xray_cloud_host`` overrides it; default below. Cloud
   ``search`` does NOT carry it -- it is a Jira endpoint, not an Xray one.

2. The four keys do not mean identical things across flavours:

   - ``auth``           Cloud exchanges credentials for a 24h bearer token. Server has NO token
                        exchange; its ``auth`` URL is Jira's identity endpoint used only as a
                        credential-validation probe. It returns a user, never a token.
   - ``import_tests``   Cloud is ASYNCHRONOUS and returns ``{"jobId": ...}`` to poll at
                        ``IMPORT_TESTS_STATUS["cloud"]``. Server has no Xray bulk test-import
                        endpoint at all; the value is Jira's own bulk issue create, which is
                        SYNCHRONOUS -- there is nothing to poll. Server test steps are added
                        afterwards one at a time via ``SERVER_TEST_STEP_URL``.
   - ``import_feature`` Synchronous on both, but the multipart precondition part is spelled
                        ``precondInfo`` on Cloud and ``preCondInfo`` on Server, and the success
                        bodies differ in shape (object vs array).
   - ``search``         Cloud is Jira v3 ``search/jql`` with ``nextPageToken`` pagination and
                        needs Jira credentials, not the Xray token. Server is Jira v2 ``search``
                        with ``startAt`` pagination.
"""

# Default Xray Cloud API host. Data-residency tenants are served from regional hosts --
# us.xray.cloud.getxray.app, eu.xray.cloud.getxray.app, au.xray.cloud.getxray.app -- and the
# vendor recommends using the one matching your region. Override via config key
# "xray_cloud_host"; this value is the documented global default when it is unset.
DEFAULT_CLOUD_HOST = "xray.cloud.getxray.app"

# The four endpoints per flavour. Tasks 2-6 import this.
ENDPOINTS = {
    "cloud": {
        # POST; body {"client_id": ..., "client_secret": ...}; returns a bare quoted JWT string.
        "auth": "https://{cloud_host}/api/v2/authenticate",
        # POST; Jira Cloud site URL, NOT the Xray host -- so {base_url}, never {cloud_host}.
        # /rest/api/3/search is deprecated and being removed; search/jql is current.
        "search": "{base_url}/rest/api/3/search/jql",
        # POST; JSON array of test objects; ASYNC -> {"jobId": ...}. Max 1000 tests, 1 job/user.
        "import_tests": "https://{cloud_host}/api/v2/import/test/bulk",
        # POST multipart/form-data; sync. Query: projectKey or projectId, optional source.
        "import_feature": "https://{cloud_host}/api/v2/import/feature",
    },
    "server": {
        # NOT a token endpoint -- no exchange exists on this flavour. Credential probe only.
        "auth": "{base_url}/rest/api/2/myself",
        # POST; body {"jql": ..., "startAt": ..., "maxResults": ..., "fields": [...]}.
        "search": "{base_url}/rest/api/2/search",
        # Jira's own bulk create -- no Xray bulk test import exists on Server/DC.
        # POST; body {"issueUpdates": [...]}; SYNCHRONOUS, no job id.
        "import_tests": "{base_url}/rest/api/2/issue/bulk",
        # POST multipart/form-data; sync. Query: projectKey (required), updateRepository.
        "import_feature": "{base_url}/rest/raven/1.0/import/feature",
    },
}

# How each flavour obtains the credential that goes in the Authorization header.
# The client's _auth_body() is built from this; "sends_body" False means make no call.
AUTH_STYLE = {
    "cloud": {
        "style": "token_exchange",
        "sends_body": True,
        "method": "POST",
        "request_content_type": "application/json",
        "body_encoding": "json",
        "body_fields": ["client_id", "client_secret"],
        # The 200 body is a bare JSON string INCLUDING its surrounding double quotes --
        # not an object. Extract with json.loads(body); body["token"] does not exist.
        "response_content_type": "application/json",
        "response_shape": "bare_quoted_string",
        "token_extraction": "json.loads(response_body)",
        "header_name": "Authorization",
        "header_template": "Bearer {token}",
        "token_lifetime_seconds": 86400,
        "error_codes": {
            "400": "wrong request syntax",
            "401": "the Xray license is not valid",
            "500": "internal authentication error",
        },
        # Xray Cloud endpoints take the token above; the Jira search endpoint does not.
        # Whether the Xray token is ALSO accepted by Jira Cloud search is genuinely unverified
        # (see the contract's ## Unverified). The shape below is what to send when it is not.
        "search_uses_separate_jira_credentials": True,
        "search_credential": {
            "style": "basic_auth",
            "sends_body": False,
            "credential_fields": ["jira_email", "jira_api_token"],
            "body_encoding": None,
            "header_name": "Authorization",
            "header_template": "Basic {base64_email_colon_api_token}",
            # base64(jira_email + ":" + jira_api_token), standard (not URL-safe) alphabet.
            "encoding": "base64(email + ':' + api_token)",
            "token_lifetime_seconds": None,
            "alternative_style": "oauth2",
            "alternative_scope": "read:jira-work",
        },
    },
    "server": {
        "style": "per_request_header",
        # No token exchange: send no body, make no authentication call. The "auth" URL is a
        # credential-validation probe for health-check only and yields no token.
        "sends_body": False,
        "method": None,
        "request_content_type": None,
        "body_encoding": None,
        "body_fields": [],
        "response_content_type": None,
        "response_shape": None,
        "token_extraction": None,
        "header_name": "Authorization",
        # Chosen: Personal Access Token (Jira 8.14+). Revocable, scoped, and the same header
        # shape as Cloud. See the contract for why basic auth was passed over.
        "header_template": "Bearer {token}",
        "credential_kind": "jira_personal_access_token",
        # Documented fallback for Jira older than 8.14 or where PATs are unavailable.
        "alternative_credential_kind": "jira_basic_auth",
        "alternative_header_template": "Basic {base64_user_colon_password}",
        "token_lifetime_seconds": None,
        "error_codes": {
            "400": "bad request",
            "401": "unauthorized or the Xray license is not valid",
            "500": "internal server error",
        },
        "search_uses_separate_jira_credentials": False,
    },
}

# Cloud bulk import is asynchronous; poll this with the returned jobId. Server has no job.
IMPORT_TESTS_STATUS = {
    "cloud": "https://{cloud_host}/api/v2/import/test/bulk/{jobId}/status",
    "server": None,
}

# Per-step keys inside a Cloud import_tests manual test's "steps" array. Documented, not inferred.
CLOUD_TEST_STEP_FIELDS = ["action", "data", "result"]

# Xray test type for tests created through bulk import. Cucumber tests are
# created through the feature-import endpoint instead, so bulk import only
# ever carries Manual tests. See api-contract.md, "required fields".
BULK_IMPORT_TEST_TYPE = "Manual"

# Terminal and non-terminal states of a Cloud import job.
IMPORT_JOB_STATUSES = {
    "pending": "not_started",
    "working": "in_progress",
    "successful": "terminal_ok",
    "partially_successful": "terminal_partial",
    "failed": "terminal_error",
    "unsuccessful": "terminal_error",
}

# Multipart part names for feature import. Cloud and Server differ in the precondition part;
# the contract's Unverified section flags that casing difference as unconfirmed.
FEATURE_IMPORT_PARTS = {
    "cloud": {"file": "file", "test_info": "testInfo", "precondition_info": "precondInfo"},
    "server": {"file": "file", "test_info": "testInfo", "precondition_info": "preCondInfo"},
}

# Server/DC only: Jira core issue update, for an EXISTING Test issue's fields.
# Same API family and same source as the import_tests value above -- Jira's own
# platform REST v2 (https://docs.atlassian.com/software/jira/docs/api/REST/9.12.0/),
# which api-contract.md already cites for POST /rest/api/2/issue/bulk. It is recorded
# here rather than in ENDPOINTS because it has no Cloud counterpart: Cloud updates an
# existing test through the same bulk import that creates one, by sending its key.
# PUT; body {"fields": {...}}; 204 No Content on success. "project" and "issuetype"
# are not editable on an existing issue and must not be sent.
# This updates FIELDS ONLY. Steps are deliberately not touched -- see
# XrayClient._update_server_issue() for why.
SERVER_ISSUE_URL = "{base_url}/rest/api/2/issue/{issueKey}"

# Server/DC only: manual test steps are added one call at a time after bulk issue create.
# PINNED: v1.0. PUT; flat body {"step": ..., "data": ..., "result": ..., "attachments": [...]}.
SERVER_TEST_STEP_URL = "{base_url}/rest/raven/1.0/api/test/{testKey}/step"

# A v2.0 step surface also exists (note "steps", plural -- v1.0 is "step", singular).
# Its body is NOT the same shape: v2.0 nests display-name keys under "fields", e.g.
#   {"fields": {"Action": ..., "Data": ..., "Expected Result": ...}, "attachments": [...]}
# whereas v1.0 is flat. Do not swap the URL without swapping the serialiser. v1.0 stays pinned
# as the safer floor; this is recorded so Task 6 knows the richer surface exists.
SERVER_TEST_STEP_URL_V2 = "{base_url}/rest/raven/2.0/api/test/{testKey}/steps"
SERVER_TEST_STEP_V2_OPERATIONS = {
    "list": "GET {base_url}/rest/raven/2.0/api/test/{testKey}/steps",
    "create": "POST {base_url}/rest/raven/2.0/api/test/{testKey}/steps",
    "get": "GET {base_url}/rest/raven/2.0/api/test/{testKey}/steps/{stepId}",
    "update": "PUT {base_url}/rest/raven/2.0/api/test/{testKey}/steps/{stepId}",
    "delete": "DELETE {base_url}/rest/raven/2.0/api/test/{testKey}/steps/{stepId}",
}

# Server/DC feature import also answers at 2.0; 1.0 stays pinned as the safer floor.
SERVER_IMPORT_FEATURE_URL_V2 = "{base_url}/rest/raven/2.0/import/feature"

# Documented structural limits. No request-rate limit is documented for either flavour.
LIMITS = {
    "cloud": {
        "max_tests_per_bulk_import": 1000,
        "max_concurrent_import_jobs_per_user": 1,
        "max_feature_upload_bytes": 100 * 1024 * 1024,
    },
    "server": {
        "max_tests_per_bulk_import": None,
        "max_concurrent_import_jobs_per_user": None,
        "max_feature_upload_bytes": None,
    },
}

CONTRACT_DOC = "agent-qa/framework/xray/api-contract.md"
