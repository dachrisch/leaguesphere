"""HTML helpers for pandas tables rendered with ``to_html(escape=False)``.

Some report tables keep ``escape=False`` because one column deliberately
contains markup (a link, ``<i>``, ``<br>``). Every *other* free-text column
in those tables must then be escaped by hand -- but a NULL/NaN cell must stay
empty rather than become the literal text "None" or "nan".
"""

import pandas as pd
from django.utils.html import escape


def escape_cell(value):
    """Escape one table cell; missing values (None/NaN/NA/NaT) render as ""."""
    if pd.isna(value):
        return ""
    return escape(str(value))
