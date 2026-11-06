"""Sport definitions: the rules of a sport as data.

One JSON file per sport and variant (``flag_football_5v5.json``). The loader
lives in :mod:`gameevents.service.rules`; nothing here imports Django, so the
definition can be read by the projector's tests, the API and any future
consumer without a database.
"""
