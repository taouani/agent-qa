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


if __name__ == "__main__":
    unittest.main()
