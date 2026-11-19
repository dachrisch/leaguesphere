from django.test import TestCase, override_settings
from django.urls import reverse

from liveticker.constants import LIVETICKER_V2_HOME


class TestLivetickerV2View(TestCase):
    @override_settings(LIVETICKER_V2_ENABLED=False)
    def test_v2_route_is_reachable_while_the_flag_is_off(self):
        response = self.client.get(reverse(LIVETICKER_V2_HOME))

        assert response.status_code == 200
        assert "liveticker/v2.html" in [
            template.name for template in response.templates
        ]
        assert 'lang="de"' in response.content.decode()

    @override_settings(LIVETICKER_V2_ENABLED=True)
    def test_v2_route_stays_reachable_with_the_flag_on(self):
        response = self.client.get(reverse(LIVETICKER_V2_HOME))

        assert response.status_code == 200
