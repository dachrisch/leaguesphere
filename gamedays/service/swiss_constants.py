"""Shared Swiss-tournament identifiers.

The Swiss tournament is owned by ``gameday_designer``'s
``SwissTournamentService``, but its ``Gameinfo`` rows and canvas nodes are
also consumed by ``gamedays``' ``CanvasPublishService`` (publish must
preserve Swiss games and skip their canvas nodes instead of duplicating
them). Defining the identifiers here — the lower layer — lets both import
from one source of truth without a ``gamedays -> gameday_designer`` cycle.
"""

# Stage name on Swiss ``Gameinfo`` rows (``SwissTournamentService`` writes it,
# ``CanvasPublishService`` excludes it from its delete pass).
SWISS_STAGE = "Swiss"

# Prefix for every canvas node owned by the Swiss tournament.
SWISS_NODE_PREFIX = "swiss-"

# Stage nodes for generated Swiss rounds are ``swiss-round-<round>-field-<n>``.
SWISS_ROUND_STAGE_PREFIX = f"{SWISS_NODE_PREFIX}round-"
