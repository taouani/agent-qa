"""Xray REST endpoint constants for the Cloud and Server/Data Center flavours.

Source of record: ``agent-qa/framework/xray/api-contract.md``. That document carries the
vendor documentation URL and retrieval date behind every value here, the trade-offs behind
each choice where the vendor offers more than one way to do something, and an ``## Unverified``
section listing what the documentation did not settle. Do not change a value here without
changing the contract, and do not assume anything the contract lists as unverified.

Python 3.8 floor, standard library only: plain dicts and strings, no dependencies.

Two things a consumer must know before using these:

1. Server/DC lives on the customer's own Jira host, so its URLs carry a literal ``{base_url}``
   token that the client substitutes::

       url.replace("{base_url}", self.base_url or "")

   The Cloud ``search`` URL carries the token too -- deliberately. JQL search is served by
   *Jira* Cloud at ``https://<site>.atlassian.net``, not by the Xray Cloud API host. The other
   three Cloud URLs are absolute and the substitution is a harmless no-op on them.

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

# The four endpoints per flavour. Tasks 2-6 import this.
ENDPOINTS = {
    "cloud": {
        # POST; body {"client_id": ..., "client_secret": ...}; returns a bare quoted JWT string.
        "auth": "https://xray.cloud.getxray.app/api/v2/authenticate",
        # POST; Jira Cloud site URL, NOT the Xray host. /rest/api/3/search is deprecated.
        "search": "{base_url}/rest/api/3/search/jql",
        # POST; JSON array of test objects; ASYNC -> {"jobId": ...}. Max 1000 tests, 1 job/user.
        "import_tests": "https://xray.cloud.getxray.app/api/v2/import/test/bulk",
        # POST multipart/form-data; sync. Query: projectKey or projectId, optional source.
        "import_feature": "https://xray.cloud.getxray.app/api/v2/import/feature",
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
        "search_uses_separate_jira_credentials": True,
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
    "cloud": "https://xray.cloud.getxray.app/api/v2/import/test/bulk/{jobId}/status",
    "server": None,
}

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

# Server/DC only: manual test steps are added one call at a time after bulk issue create.
# PUT; body {"step": ..., "data": ..., "result": ..., "attachments": [...]}.
SERVER_TEST_STEP_URL = "{base_url}/rest/raven/1.0/api/test/{testKey}/step"

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
