"""Guard the deploy workflow's dispatch contract (Phase 0c, issue #2536).

The candidate-image target must be usable without a stage/demo `environment`
(a candidate build is not a deploy), while the normal deploy path must still
refuse an empty environment. Both halves are easy to "simplify" away in a YAML
tidy-up, and the failure only shows up when someone dispatches a build.
"""

import os
import re

WORKFLOW = os.path.join(
    os.path.dirname(__file__), "..", "..", ".github", "workflows", "deploy.yaml"
)


def read_workflow():
    with open(WORKFLOW, encoding="utf-8") as handle:
        return handle.read()


def test_environment_is_optional_but_validated_for_deploys():
    text = read_workflow()
    environment_block = re.search(
        r"^      environment:\n(?P<body>(?:        .*\n)+)", text, re.M
    )
    assert environment_block is not None, "deploy.yaml has no environment input"
    assert "required: false" in environment_block.group("body")


def test_candidate_build_is_a_single_input():
    text = read_workflow()
    assert "agent_candidate_ref:" in text
    assert "if: inputs.agent_candidate_ref != " in text
    assert "inputs.agent_candidate_ref == ''" in text


def test_deploy_job_rejects_an_empty_environment():
    text = read_workflow()
    assert "environment is required unless agent_candidate_ref is set" in text
