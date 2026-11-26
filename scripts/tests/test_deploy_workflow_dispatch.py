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


def test_agent_build_pushes_the_selected_tag():
    text = read_workflow()
    agent_tag_block = re.search(
        r"^      agent_tag:\n(?P<body>(?:        .*\n)+)", text, re.M
    )
    assert agent_tag_block is not None, "deploy.yaml has no agent_tag input"
    body = agent_tag_block.group("body")
    assert "- agent-candidate" in body
    assert "- agent-ref" in body
    assert "default: agent-candidate" in body
    # The pushed tag must come from the input, not a literal one.
    assert "tags: docker.io/leaguesphere/backend:${{ inputs.agent_tag }}" in text
    # The build records its commit so `ref` can be verified without the new
    # /health/version/ endpoint (the baseline predates it).
    assert "org.opencontainers.image.revision=${{ steps.ref.outputs.sha }}" in text
    # The build context must be the checked-out ref, not the workflow ref.
    assert "context: ." in text


def test_static_proof_pins_the_built_digest_and_named_bundles():
    text = read_workflow()
    proof = text.split("Prove the agent frontend serves every built bundle", 1)[1]
    assert 'image="docker.io/leaguesphere/frontend@${digest}"' in proof
    assert "steps.build_frontend_ref.outputs.digest" in proof
    assert "steps.build_frontend_candidate.outputs.digest" in proof
    for bundle in (
        "scorecard_v2/js/scorecard_v2.js",
        "gameday_designer/js/index.js",
        "passcheck/js/passcheck.js",
        "liveticker/js/liveticker.js",
    ):
        assert bundle in proof
    assert "find " not in proof  # an arbitrary .js chunk is not proof
