import pandas as pd
from django.utils.html import escape


def escape_cell(value):
    """Escape one cell of a table rendered with to_html(escape=False).

    Missing values (None/NaN/NA/NaT) render as "" rather than "None".
    """
    if pd.isna(value):
        return ""
    return escape(str(value))
