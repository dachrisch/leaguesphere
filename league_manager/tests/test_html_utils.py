"""Cells of pandas tables that are rendered with escape=False must be escaped
by hand -- but NULL/NaN cells must stay empty, not become the text "None".
"""

import math

import pandas as pd
import pytest

from league_manager.utils.html import escape_cell


@pytest.mark.parametrize("empty", [None, math.nan, pd.NA, pd.NaT])
def test_missing_values_render_as_empty_string(empty):
    assert escape_cell(empty) == ""


def test_markup_is_escaped():
    assert (
        escape_cell("<script>alert(1)</script>")
        == "&lt;script&gt;alert(1)&lt;/script&gt;"
    )


def test_non_string_values_are_stringified():
    assert escape_cell(5) == "5"


def test_empty_string_stays_empty():
    assert escape_cell("") == ""
