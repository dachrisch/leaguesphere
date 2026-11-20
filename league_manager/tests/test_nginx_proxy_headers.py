"""nginx drops every inherited ``proxy_set_header`` in a location that sets its
own (the same all-or-nothing inheritance as ``add_header``). The SSE location
sets ``Connection ""`` for HTTP/1.1 keep-alive, so it must repeat the
server-level forwarding headers. Without ``Host`` Django sees the upstream name
``liveticker-stream:8001`` and answers 400 (DisallowedHost); without the
``X-Forwarded-*`` headers it loses the client IP and scheme.
"""

import re

from django.test import SimpleTestCase

NGINX_VARIANTS = [
    "container/nginx.conf",
    "container/nginx.staging.conf",
    "container/nginx.demo.conf",
]

FORWARDING_HEADERS = ["Host", "X-Real-IP", "X-Forwarded-For", "X-Forwarded-Proto"]


def _location_blocks(content):
    """Yield (location header, body) for each top-level ``location`` block."""
    for match in re.finditer(r"^\s*location\s+([^{\n]+)\{", content, re.MULTILINE):
        depth, start = 1, match.end()
        index = start
        while depth and index < len(content):
            if content[index] == "{":
                depth += 1
            elif content[index] == "}":
                depth -= 1
            index += 1
        yield match.group(1).strip(), content[start : index - 1]


def _set_headers(text):
    return set(re.findall(r"^\s*proxy_set_header\s+(\S+)", text, re.MULTILINE))


class TestNginxProxyHeaders(SimpleTestCase):
    def test_locations_with_own_proxy_headers_repeat_the_forwarding_headers(self):
        for conf in NGINX_VARIANTS:
            with open(conf) as f:
                content = f.read()
            for location, body in _location_blocks(content):
                own = _set_headers(body)
                if not own:
                    continue  # inherits the server-level set
                for header in FORWARDING_HEADERS:
                    with self.subTest(conf=conf, location=location, header=header):
                        self.assertIn(header, own)

    def test_stream_location_exists_and_sets_its_own_headers(self):
        for conf in NGINX_VARIANTS:
            with open(conf) as f:
                content = f.read()
            blocks = dict(_location_blocks(content))
            with self.subTest(conf=conf):
                self.assertIn("/api/liveticker/stream/", blocks)
                self.assertIn("Host", _set_headers(blocks["/api/liveticker/stream/"]))
