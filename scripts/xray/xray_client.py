"""Xray REST client. Endpoints come from xray_endpoints.py, which is generated
from agent-qa/framework/xray/api-contract.md. Never hardcode a URL here.

Authentication differs by flavour (api-contract.md, "Flavour differences at a
glance" and the per-flavour "1. Authentication -- auth" sections):

- Cloud is a token exchange: POST client_id/client_secret to the "auth" endpoint
  and receive a bare, quoted JSON string containing a 24h JWT. authenticate()
  caches and returns that token; callers send it as "Bearer {token}".
- Server/DC has no token-exchange endpoint at all. Its "auth" URL is Jira's own
  GET {base_url}/rest/api/2/myself -- a credential-validation probe that returns
  a user profile, never a token. The PAT itself is the credential; authenticate()
  GETs /myself with the PAT already in the Authorization header, treats a 200 as
  proof the PAT is valid, and returns that same "Bearer {pat}" header value for
  reuse on every later request. AUTH_STYLE["server"] records this as
  style "per_request_header", sends_body False -- the authoritative signal that
  no exchange call should be made and no token should be parsed out of the body.
"""

import base64
import json
import subprocess
import urllib.request
import urllib.error

from xray_endpoints import ENDPOINTS, AUTH_STYLE, DEFAULT_CLOUD_HOST


class XrayError(Exception):
    """Every failure this client raises. Never contains a credential."""


class Transport:
    def request(self, method, url, headers=None, body=None):
        raise NotImplementedError


class UrllibTransport(Transport):
    def request(self, method, url, headers=None, body=None):
        req = urllib.request.Request(url, data=body, method=method)
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req) as resp:
                return resp.status, dict(resp.headers), resp.read()
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers or {}), e.read()
        except urllib.error.URLError as e:
            raise XrayError("could not reach Xray: %s" % e.reason)


def read_credentials(path):
    """Read the secrets file, refusing if git tracks it."""
    tracked = subprocess.run(
        ["git", "ls-files", "--error-unmatch", path],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    ).returncode == 0
    if tracked:
        raise XrayError(
            "%s is tracked by git. Remove it from version control before uploading; "
            "a credential must never be committed." % path
        )
    creds = {}
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            creds[k.strip()] = v.strip()
    return creds


class XrayClient:
    def __init__(self, platform, base_url, credentials, transport, cloud_host=None):
        self.platform = platform
        self.base_url = base_url
        self.credentials = credentials
        self.transport = transport
        self.cloud_host = cloud_host
        self._token = None

    def _require_known_platform(self):
        if self.platform not in ENDPOINTS:
            raise XrayError("unknown xray_platform: %r (expected cloud or server)"
                            % self.platform)

    def _endpoint(self, name):
        self._require_known_platform()
        url = ENDPOINTS[self.platform][name]
        url = url.replace("{base_url}", self.base_url or "")
        url = url.replace("{cloud_host}", self.cloud_host or DEFAULT_CLOUD_HOST)
        return url

    def authenticate(self):
        if self._token:
            return self._token
        self._require_known_platform()
        style = AUTH_STYLE[self.platform]["style"]
        if style == "token_exchange":
            self._token = self._authenticate_token_exchange()
        elif style == "per_request_header":
            self._token = self._authenticate_per_request_header()
        else:
            raise XrayError("unsupported auth style for platform %r: %r"
                            % (self.platform, style))
        return self._token

    def _authenticate_token_exchange(self):
        # Cloud only (api-contract.md, "Xray Cloud" > "1. Authentication -- auth"):
        # POST client_id/client_secret, receive a bare quoted JSON string as the
        # 200 body -- json.loads() it directly, never body["token"].
        status, _, payload = self.transport.request(
            "POST", self._endpoint("auth"),
            headers={"Content-Type": "application/json"},
            body=json.dumps(self._auth_body()).encode(),
        )
        if status != 200:
            raise XrayError("Xray authentication failed with HTTP %d" % status)
        token = json.loads(payload.decode())
        return token

    def _authenticate_per_request_header(self):
        # Server/DC only (api-contract.md, "Xray Server / Data Center" >
        # "1. Authentication -- auth"): no exchange call. The PAT goes straight
        # into the Authorization header of a GET to /myself, which is used only
        # to validate the credential -- its body (a Jira user profile) is never
        # parsed for a token. A 200 means the PAT is good; the header value we
        # already built is what gets returned and reused on every later request.
        header_value = AUTH_STYLE["server"]["header_template"].format(
            token=self._credential_value()
        )
        status, _, _ = self.transport.request(
            "GET", self._endpoint("auth"),
            headers={AUTH_STYLE["server"]["header_name"]: header_value},
        )
        if status != 200:
            raise XrayError("Xray authentication failed with HTTP %d" % status)
        return header_value

    def _credential_value(self):
        for key in ("personal_access_token", "pat", "token"):
            if key in self.credentials:
                return self.credentials[key]
        raise XrayError(
            "no personal access token found in credentials "
            "(expected key 'personal_access_token')"
        )

    def _auth_body(self):
        fields = AUTH_STYLE["cloud"]["body_fields"]
        try:
            return {field: self.credentials[field] for field in fields}
        except KeyError as e:
            raise XrayError("missing required credential field: %s" % e.args[0])

    # ---- Label matching (api-contract.md, "2. JQL search") -----------------

    JQL_BATCH = 50

    def find_tests_by_label(self, project_key, labels):
        """Map each label already present in Jira (as an issue label) to its
        issue key. Labels with no match are simply absent from the result --
        callers partition create-vs-update on that absence, so a truncated
        page here must never be mistaken for "not found"."""
        found = {}
        if not labels:
            return found
        self._require_known_platform()
        headers = self._search_auth_header()
        for start in range(0, len(labels), self.JQL_BATCH):
            chunk = labels[start:start + self.JQL_BATCH]
            quoted = ", ".join('"%s"' % label for label in chunk)
            jql = 'project = %s AND labels in (%s)' % (project_key, quoted)
            for issue in self._search_all_pages(jql, headers, project_key):
                for label in issue.get("fields", {}).get("labels", []):
                    if label in chunk:
                        found[label] = issue["key"]
        return found

    def _search_auth_header(self):
        # Cloud search is a Jira endpoint secured by Jira credentials, not the
        # Xray bearer token (api-contract.md, "Xray Cloud" > "2. JQL search").
        # Whether the Xray token is also accepted is genuinely unverified
        # (contract's ## Unverified, item 2), so this does not demand Jira
        # credentials speculatively: it prefers them when configured, and
        # otherwise tries the Xray token, turning a 401/403 into a
        # self-diagnosing error rather than guessing up front.
        if self.platform == "cloud":
            email = self.credentials.get("jira_email")
            api_token = self.credentials.get("jira_api_token")
            if email and api_token:
                basic = base64.b64encode(
                    ("%s:%s" % (email, api_token)).encode()
                ).decode()
                return {"Authorization": "Basic %s" % basic}
            return {"Authorization": "Bearer %s" % self.authenticate()}
        # Server/DC: the same Jira credential used on every other request.
        return {"Authorization": self.authenticate()}

    def _post_json(self, url, headers, body):
        all_headers = {"Content-Type": "application/json"}
        all_headers.update(headers or {})
        return self.transport.request(
            "POST", url, headers=all_headers, body=json.dumps(body).encode()
        )

    def _search_all_pages(self, jql, headers, project_key):
        if self.platform == "cloud":
            return self._search_cloud_all_pages(jql, headers, project_key)
        return self._search_server_all_pages(jql, headers, project_key)

    def _search_cloud_all_pages(self, jql, headers, project_key):
        # Cloud search/jql paginates with a returned nextPageToken, not
        # startAt (api-contract.md: "Pagination is token-based
        # (nextPageToken), not startAt-based"). The response schema for the
        # token itself is not spelled out in the contract beyond naming the
        # SearchAndReconcileResults shape, so continuation is keyed off the
        # presence of a nextPageToken in the response, mirroring the
        # request-side field of the same name; its absence is the terminal
        # condition. See task-3-report.md for this inference.
        issues = []
        body = {"jql": jql, "fields": ["labels"], "maxResults": 100}
        page_token = None
        while True:
            if page_token:
                body["nextPageToken"] = page_token
            url = self._endpoint("search")
            status, _, payload = self._post_json(url, headers, body)
            self._raise_for_search_status(status, project_key)
            data = json.loads(payload.decode())
            issues.extend(data.get("issues", []))
            page_token = data.get("nextPageToken")
            if not page_token:
                break
        return issues

    def _search_server_all_pages(self, jql, headers, project_key):
        # Server/DC search is offset-based: {"startAt", "maxResults",
        # "total", "issues"} (api-contract.md, Server "2. JQL search",
        # quoting the documented request/response shape). Keep requesting
        # while fewer issues have been seen than "total" reports.
        issues = []
        start_at = 0
        max_results = 50
        while True:
            body = {
                "jql": jql,
                "startAt": start_at,
                "maxResults": max_results,
                "fields": ["labels"],
            }
            url = self._endpoint("search")
            status, _, payload = self._post_json(url, headers, body)
            self._raise_for_search_status(status, project_key)
            data = json.loads(payload.decode())
            page = data.get("issues", [])
            issues.extend(page)
            start_at += len(page)
            total = data.get("total")
            if not page or total is None or start_at >= total:
                break
        return issues

    def _raise_for_search_status(self, status, project_key):
        if status == 200:
            return
        if self.platform == "cloud" and status in (401, 403):
            # Branch the diagnosis on whether Jira credentials are already
            # configured. A confident wrong diagnosis is worse than a vague
            # one: telling a user who already has jira_email/jira_api_token
            # to "add" them sends them down a path that cannot help.
            email = self.credentials.get("jira_email")
            api_token = self.credentials.get("jira_api_token")
            if email and api_token:
                raise XrayError(
                    "Jira search returned %d with the Jira credentials from "
                    "agent-qa/.xray-credentials. Check that jira_email and "
                    "jira_api_token are correct and that the account can "
                    "browse project %s." % (status, project_key)
                )
            raise XrayError(
                "Jira search returned %d. Xray Cloud search is a Jira "
                "endpoint and may not accept the Xray token. Add jira_email "
                "and jira_api_token to agent-qa/.xray-credentials. If the "
                "problem persists after adding them, the Xray token may "
                "have expired." % status
            )
        raise XrayError("Jira search failed with HTTP %d" % status)
