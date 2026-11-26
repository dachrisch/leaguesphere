"""Resolve the free-text association values used by external games onto the
``gamedays.Association`` rows.

Single source of truth for the three places that have to understand those
strings: the ``association`` varchar→FK data migration, the external-game
import (``ExternalGameOfficialEntry``) and the self-service forms. The
production dump contains 21 distinct values but only 19 association rows exist
and none may be created, so the five values that have no row of their own are
aliased onto an existing one (user-fixed mapping).
"""

from gamedays.models import Association

# Free-text values that must map onto an existing association instead of
# raising (and instead of creating a new row).
ASSOCIATION_ALIASES = {
    "AFCVTH": "AFCVT",
    "Spielverbund Nord": "AFCVNORD",
    "Ausland": "OHNE",
    "Scrimmage": "OHNE",
    "Natio": "OHNE",
}

# Alias lookups are case-insensitive, matching the abbr/name lookups on
# MySQL's case-insensitive collation (and ``name__iexact``). Keep the public
# map as documented; casefold its keys once for the lookup itself.
_ALIASES_CASEFOLDED = {
    alias.casefold(): target for alias, target in ASSOCIATION_ALIASES.items()
}


class UnknownAssociationError(ValueError):
    """Raised when a value matches no association abbreviation, alias or name."""


def resolve_association(value: str) -> Association:
    """Resolve ``value`` to an :class:`Association`.

    Order: exact abbreviation, then the alias map (case-insensitively), then a
    case-insensitive name match (imports written with the long form, e.g.
    ``Hamburg``). Anything else raises :class:`UnknownAssociationError`, so a
    typo becomes a per-row error rather than a silent empty value. A name with
    several matches is an error too: ``Association.name`` is not unique and
    picking one would attach a duty to an arbitrary association.
    """
    normalized = (value or "").strip()
    if not normalized:
        raise UnknownAssociationError(f"Unbekannter Verband: {value}")

    association = Association.objects.filter(abbr=normalized).first()
    if association is not None:
        return association

    alias = _ALIASES_CASEFOLDED.get(normalized.casefold())
    if alias is not None:
        association = Association.objects.filter(abbr=alias).first()
        if association is not None:
            return association

    try:
        return Association.objects.get(name__iexact=normalized)
    except Association.MultipleObjectsReturned:
        raise UnknownAssociationError(
            f"Mehrdeutiger Verband: {value} - mehrere Verbände mit diesem Namen "
            "vorhanden! Bitte eindeutige Abkürzung verwenden."
        ) from None
    except Association.DoesNotExist:
        pass

    raise UnknownAssociationError(f"Unbekannter Verband: {value}")
