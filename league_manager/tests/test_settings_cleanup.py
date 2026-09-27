from django.conf import settings


def test_request_context_processor_is_not_duplicated():
    processors = settings.TEMPLATES[0]["OPTIONS"]["context_processors"]
    assert processors.count("django.template.context_processors.request") == 1


def test_logging_has_no_unused_file_handler():
    handlers = settings.LOGGING["handlers"]
    used_handlers = {
        handler
        for logger in settings.LOGGING["loggers"].values()
        for handler in logger["handlers"]
    }
    assert set(handlers) == used_handlers
