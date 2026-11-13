"""Template helpers for the dbaccess surfaces."""

from django import template

register = template.Library()


@register.filter
def lead(sequence, count):
    """The first `count` items; lets a template cap a list without a view change."""
    return list(sequence)[: int(count)]


@register.filter
def rest(sequence, count):
    """Everything after the first `count` items, so a template can count them."""
    return list(sequence)[int(count) :]
