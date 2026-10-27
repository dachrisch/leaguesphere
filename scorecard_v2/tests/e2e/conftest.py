# Same reason as scorecard/tests/e2e/conftest.py: the live server runs the
# SQLite test database in CI-less local runs, and concurrent writes (the start
# sequence writes setup, possession and the log back to back) would otherwise
# raise SQLITE_LOCKED — which the busy timeout does not handle. Serializing the
# requests at the server level is the only application-level fix.
from django.core.servers.basehttp import WSGIServer
from django.test.testcases import LiveServerThread


class SingleThreadedWSGIServer(WSGIServer):
    """Non-threaded WSGI server: handles one request at a time to avoid SQLite locking."""

    def __init__(self, *args, connections_override=None, **kwargs):
        super().__init__(*args, **kwargs)
        # connections_override is not needed for transaction=True tests since
        # data is committed and visible to all connections without sharing.
        self.connections_override = connections_override or {}


LiveServerThread.server_class = SingleThreadedWSGIServer
