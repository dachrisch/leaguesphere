import hashlib


def build_etag(*parts) -> str:
    """Build a quoted ETag from opaque parts.

    Parts are joined with ':' and hashed; pass every value the response
    depends on (query string, row counts, value sums, ...). Callers that
    need to change the shape of the response should add a new part rather
    than reusing an existing one, so stale cached bodies stay invalid.
    """
    etag_data = ":".join(str(part) for part in parts)
    return f'"{hashlib.md5(etag_data.encode()).hexdigest()}"'
