import unittest
from xray_client import XrayClient, XrayError, Transport


class FakeTransport(Transport):
    """Records every call and returns canned responses."""

    def __init__(self, responses=None):
        self.calls = []
        self.responses = responses or []

    def request(self, method, url, headers=None, body=None):
        self.calls.append({"method": method, "url": url,
                           "headers": headers or {}, "body": body})
        if self.responses:
            return self.responses.pop(0)
        return 200, {}, b"{}"


class TestAuthentication(unittest.TestCase):

    def test_cloud_auth_posts_to_the_configured_endpoint(self):
        from xray_endpoints import ENDPOINTS, DEFAULT_CLOUD_HOST
        t = FakeTransport([(200, {}, b'"a-token"')])
        c = XrayClient("cloud", None, {"client_id": "i", "client_secret": "s"}, t)
        c.authenticate()
        self.assertEqual(t.calls[0]["method"], "POST")
        # The contract's cloud "auth" endpoint carries {cloud_host}, which the client
        # resolves before calling (defaulting to DEFAULT_CLOUD_HOST here since no
        # xray_cloud_host override was supplied) -- so compare against the resolved
        # URL, not the raw template. This still fails if the client calls the wrong
        # endpoint.
        expected = ENDPOINTS["cloud"]["auth"].replace("{cloud_host}", DEFAULT_CLOUD_HOST)
        self.assertEqual(t.calls[0]["url"], expected)

    def test_token_is_reused_not_refetched(self):
        t = FakeTransport([(200, {}, b'"a-token"')])
        c = XrayClient("cloud", None, {"client_id": "i", "client_secret": "s"}, t)
        first = c.authenticate()
        second = c.authenticate()
        self.assertEqual(first, second)
        self.assertEqual(len(t.calls), 1, "authenticate() must cache its token")

    def test_auth_failure_raises_xrayerror_without_the_secret(self):
        t = FakeTransport([(401, {}, b'{"error":"bad creds"}')])
        c = XrayClient("cloud", None, {"client_id": "i", "client_secret": "SUPERSECRET"}, t)
        with self.assertRaises(XrayError) as ctx:
            c.authenticate()
        self.assertNotIn("SUPERSECRET", str(ctx.exception))

    def test_unknown_platform_raises(self):
        with self.assertRaises(XrayError):
            XrayClient("bitbucket", None, {}, FakeTransport()).authenticate()

    def test_server_auth_probes_myself_and_returns_header_value(self):
        # Server/DC has no token-exchange endpoint. api-contract.md ("Xray Server / Data
        # Center" > "1. Authentication -- auth") pins auth as a GET to
        # {base_url}/rest/api/2/myself, used only as a credential-validation probe: a 200
        # means the PAT is valid, and the response body (a Jira user profile) is never
        # parsed for a token. AUTH_STYLE["server"] records style "per_request_header" and
        # sends_body False. authenticate() must GET /myself, send the PAT as a Bearer
        # header, and on success return that same header value for reuse on every later
        # request -- never attempt to extract a token from the /myself body.
        from xray_endpoints import ENDPOINTS
        t = FakeTransport([(200, {}, b'{"name": "a-user"}')])
        c = XrayClient("server", "https://jira.example.com",
                        {"personal_access_token": "a-pat"}, t)
        result = c.authenticate()
        self.assertEqual(t.calls[0]["method"], "GET")
        self.assertEqual(t.calls[0]["url"],
                          ENDPOINTS["server"]["auth"].replace(
                              "{base_url}", "https://jira.example.com"))
        self.assertEqual(t.calls[0]["headers"].get("Authorization"), "Bearer a-pat")
        self.assertEqual(result, "Bearer a-pat")

    def test_server_auth_failure_raises_xrayerror_without_the_secret(self):
        t = FakeTransport([(401, {}, b"unauthorized")])
        c = XrayClient("server", "https://jira.example.com",
                        {"personal_access_token": "SUPERSECRETPAT"}, t)
        with self.assertRaises(XrayError) as ctx:
            c.authenticate()
        self.assertNotIn("SUPERSECRETPAT", str(ctx.exception))

    def test_server_token_is_reused_not_refetched(self):
        t = FakeTransport([(200, {}, b'{"name": "a-user"}')])
        c = XrayClient("server", "https://jira.example.com",
                        {"personal_access_token": "a-pat"}, t)
        first = c.authenticate()
        second = c.authenticate()
        self.assertEqual(first, second)
        self.assertEqual(len(t.calls), 1, "authenticate() must cache its header value")


class TestLabelMatching(unittest.TestCase):

    def _client(self, transport):
        c = XrayClient("cloud", None, {"client_id": "i", "client_secret": "s"}, transport)
        c._token = "cached"          # skip the auth round-trip
        return c

    def test_returns_label_to_issue_key_for_matches(self):
        body = b'{"issues":[{"key":"PROJ-441","fields":{"labels":["TC-PROJ-123-001"]}}]}'
        t = FakeTransport([(200, {}, body)])
        found = self._client(t).find_tests_by_label("PROJ", ["TC-PROJ-123-001"])
        self.assertEqual(found, {"TC-PROJ-123-001": "PROJ-441"})

    def test_unmatched_labels_are_absent_not_none(self):
        t = FakeTransport([(200, {}, b'{"issues":[]}')])
        found = self._client(t).find_tests_by_label("PROJ", ["TC-PROJ-123-002"])
        self.assertEqual(found, {})

    def test_labels_are_batched_into_one_query(self):
        t = FakeTransport([(200, {}, b'{"issues":[]}')])
        labels = ["TC-PROJ-123-%03d" % n for n in range(1, 21)]
        self._client(t).find_tests_by_label("PROJ", labels)
        self.assertEqual(len(t.calls), 1,
                         "20 labels must not produce 20 requests")

    def test_query_names_the_project_and_the_labels(self):
        t = FakeTransport([(200, {}, b'{"issues":[]}')])
        self._client(t).find_tests_by_label("PROJ", ["TC-PROJ-123-001"])
        sent = str(t.calls[0]["url"]) + str(t.calls[0]["body"])
        self.assertIn("PROJ", sent)
        self.assertIn("TC-PROJ-123-001", sent)

    def test_empty_label_list_makes_no_request(self):
        t = FakeTransport()
        self.assertEqual(self._client(t).find_tests_by_label("PROJ", []), {})
        self.assertEqual(t.calls, [])

    def test_search_is_posted_not_gotten(self):
        t = FakeTransport([(200, {}, b'{"issues":[]}')])
        self._client(t).find_tests_by_label("PROJ", ["TC-PROJ-123-001"])
        self.assertEqual(t.calls[0]["method"], "POST")

    def test_cloud_search_401_without_jira_creds_says_add_them(self):
        # Cloud search is a Jira endpoint, not an Xray one (api-contract.md,
        # "Xray Cloud" > "2. JQL search"), and whether the Xray bearer token
        # is accepted there is genuinely unverified. When no Jira credentials
        # are configured at all, that's the missing piece to name.
        t = FakeTransport([(401, {}, b'{}')])
        with self.assertRaises(XrayError) as ctx:
            self._client(t).find_tests_by_label("PROJ", ["TC-PROJ-123-001"])
        message = str(ctx.exception)
        self.assertIn("jira_email", message)
        self.assertIn("jira_api_token", message)
        self.assertIn("agent-qa/.xray-credentials", message)
        self.assertIn("Add jira_email", message)
        self.assertNotIn("SUPERSECRET", message)

    def test_cloud_search_401_with_jira_creds_says_check_them(self):
        # A confident wrong diagnosis is worse than a vague one: a user who
        # already configured jira_email/jira_api_token must not be told to
        # "add" them -- they need to be told to check correctness/permissions
        # instead. The credential VALUES must still never appear.
        t = FakeTransport([(403, {}, b'{}')])
        c = XrayClient("cloud", None, {
            "client_id": "i", "client_secret": "s",
            "jira_email": "person@example.com",
            "jira_api_token": "SUPERSECRETJIRATOKEN",
        }, t)
        c._token = "cached"
        with self.assertRaises(XrayError) as ctx:
            c.find_tests_by_label("PROJ", ["TC-PROJ-123-001"])
        message = str(ctx.exception)
        self.assertIn("jira_email", message)
        self.assertIn("jira_api_token", message)
        self.assertIn("agent-qa/.xray-credentials", message)
        self.assertIn("Check that jira_email", message)
        self.assertIn("PROJ", message)
        self.assertNotIn("SUPERSECRETJIRATOKEN", message)
        self.assertNotIn("person@example.com", message)

    def test_search_server_error_raises_without_leaking_status_as_data(self):
        t = FakeTransport([(500, {}, b'{}')])
        with self.assertRaises(XrayError):
            self._client(t).find_tests_by_label("PROJ", ["TC-PROJ-123-001"])

    def test_paginated_cloud_search_fetches_all_pages(self):
        # A response that reports a nextPageToken but is treated as final
        # would silently drop labels on later pages -- exactly the failure
        # this task exists to prevent (they'd read as "not found" and get
        # duplicated on the next run).
        page1 = (b'{"issues":[{"key":"PROJ-1","fields":{"labels":'
                 b'["TC-PROJ-1"]}}],"nextPageToken":"tok-2"}')
        page2 = b'{"issues":[{"key":"PROJ-2","fields":{"labels":["TC-PROJ-2"]}}]}'
        t = FakeTransport([(200, {}, page1), (200, {}, page2)])
        found = self._client(t).find_tests_by_label("PROJ", ["TC-PROJ-1", "TC-PROJ-2"])
        self.assertEqual(found, {"TC-PROJ-1": "PROJ-1", "TC-PROJ-2": "PROJ-2"})
        self.assertEqual(len(t.calls), 2)
        self.assertIn("tok-2", str(t.calls[1]["body"]))

    def test_paginated_server_search_fetches_all_pages(self):
        page1 = (b'{"startAt":0,"maxResults":1,"total":2,"issues":'
                 b'[{"key":"PROJ-1","fields":{"labels":["TC-PROJ-1"]}}]}')
        page2 = (b'{"startAt":1,"maxResults":1,"total":2,"issues":'
                 b'[{"key":"PROJ-2","fields":{"labels":["TC-PROJ-2"]}}]}')
        t = FakeTransport([(200, {}, page1), (200, {}, page2)])
        c = XrayClient("server", "https://jira.example.com",
                        {"personal_access_token": "a-pat"}, t)
        c._token = "Bearer a-pat"    # skip the auth round-trip
        found = c.find_tests_by_label("PROJ", ["TC-PROJ-1", "TC-PROJ-2"])
        self.assertEqual(found, {"TC-PROJ-1": "PROJ-1", "TC-PROJ-2": "PROJ-2"})
        self.assertEqual(len(t.calls), 2)


if __name__ == "__main__":
    unittest.main()
