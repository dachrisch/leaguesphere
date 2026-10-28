import os
from unittest.mock import patch

import pytest
from django.conf import settings

from officials.service.moodle.moodle_api import (
    MoodleApi,
    ApiUserInfo,
    ApiCourses,
    ApiParticipants,
    ApiExams,
    ApiExam,
    ApiExamResult,
)


class TestMoodleApi:

    @pytest.mark.skipif(
        "CIRCLECI" in os.environ
        or settings.MOODLE_URL is None
        or settings.MOODLE_URL == "None",
        reason="Moodle URL not configured",
    )
    def test_get_all_courses(self):
        moodle_api = MoodleApi()
        all_courses: ApiCourses = moodle_api.get_courses()
        assert len(all_courses.get_all()) > 1

    @pytest.mark.skipif(
        "CIRCLECI" in os.environ
        or settings.MOODLE_URL is None
        or settings.MOODLE_URL == "None",
        reason="Moodle URL not configured",
    )
    def test_get_all_participants_for_course(self):
        moodle_api = MoodleApi()
        participants: ApiParticipants = moodle_api.get_participants_for_course(5)
        all_participants: list[ApiUserInfo] = participants.get_all()
        assert len(all_participants) == 4
        assert (
            str(all_participants[3])
            == "11: Testuser, Y -> Ich finde mein Team nicht. (-99)"
        )

    @pytest.mark.skipif(
        "CIRCLECI" in os.environ
        or settings.MOODLE_URL is None
        or settings.MOODLE_URL == "None",
        reason="Moodle URL not configured",
    )
    def test_get_all_exams_for_course(self):
        moodle_api = MoodleApi()
        api_exams: ApiExams = moodle_api.get_exams_for_course(5)
        all_exams: list[ApiExam] = api_exams.get_all()
        assert len(all_exams) == 1
        assert str(all_exams[0]) == "5: quiz_id=1 -> grade: 10.0"

    @pytest.mark.skipif(
        "CIRCLECI" in os.environ
        or settings.MOODLE_URL is None
        or settings.MOODLE_URL == "None",
        reason="Moodle URL not configured",
    )
    def test_get_user_result_for_exam(self):
        moodle_api = MoodleApi()
        result: ApiExamResult = moodle_api.get_user_result_for_exam(11, 1)
        assert result.get_result() == 1

    @pytest.mark.skipif(
        "CIRCLECI" in os.environ
        or settings.MOODLE_URL is None
        or settings.MOODLE_URL == "None",
        reason="Moodle URL not configured",
    )
    def test_get_user_result_for_non_existing_exam(self):
        moodle_api = MoodleApi()
        result: ApiExamResult = moodle_api.get_user_result_for_exam(7, 1)
        assert result.get_result() is None

    @pytest.mark.skipif(
        "CIRCLECI" in os.environ
        or settings.MOODLE_URL is None
        or settings.MOODLE_URL == "None",
        reason="Moodle URL not configured",
    )
    def test_get_user_info(self):
        moodle_api = MoodleApi()
        user_info: ApiUserInfo = moodle_api.get_user_info_by_id(11)
        assert user_info.get_first_name() == "Y"
        assert user_info.get_last_name() == "Testuser"
        assert user_info.get_team() == "Ich finde mein Team nicht."
        assert user_info.get_team_id() == "-99"


class TestMoodleApiBatchUserInfos:
    @staticmethod
    def _moodle_response(user_ids):
        return [
            {"id": int(user_id), "email": f"user{user_id}@example.com"}
            for user_id in user_ids
        ]

    @patch("officials.service.moodle.moodle_api.requests")
    def test_users_are_requested_in_batches(self, requests_mock):
        requests_mock.post.side_effect = [
            _FakeResponse(self._moodle_response(range(100))),
            _FakeResponse(self._moodle_response(range(100, 150))),
        ]

        user_infos = MoodleApi().get_user_infos_by_ids(range(150))

        assert requests_mock.post.call_count == 2
        assert requests_mock.get.call_count == 0
        assert len(user_infos) == 150
        first_batch_data = requests_mock.post.call_args_list[0].kwargs["data"]
        assert ("values[0]", "0") in first_batch_data
        assert ("values[99]", "99") in first_batch_data
        assert user_infos["42"].get_email() == "user42@example.com"

    @patch("officials.service.moodle.moodle_api.requests")
    def test_requests_time_out(self, requests_mock):
        requests_mock.post.return_value = _FakeResponse([])

        MoodleApi().get_user_infos_by_ids([1])

        assert (
            requests_mock.post.call_args.kwargs["timeout"] == MoodleApi.REQUEST_TIMEOUT
        )

    @patch("officials.service.moodle.moodle_api.requests")
    def test_duplicate_ids_are_requested_once(self, requests_mock):
        requests_mock.post.return_value = _FakeResponse(self._moodle_response([7]))

        user_infos = MoodleApi().get_user_infos_by_ids([7, 7, "7", None])

        assert requests_mock.post.call_count == 1
        assert requests_mock.post.call_args.kwargs["data"] == [("values[0]", "7")]
        assert list(user_infos) == ["7"]


class _FakeResponse:
    def __init__(self, json_data):
        self._json_data = json_data

    def json(self):
        return self._json_data
