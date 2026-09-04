#!/bin/bash

set -e

show_help() {
    echo "Usage: $0 [stage [major|minor|patch]|demo]"
    echo
    echo "Options:"
    echo "  stage [major|minor|patch]   Trigger staging RC deploy (default: patch)"
    echo "  demo                        Trigger demo deploy"
    echo "  -h, --help                  Show this help message and exit"
    echo
    echo "Examples:"
    echo "  $0 stage              # Bump patch RC on current branch"
    echo "  $0 stage minor        # Bump minor RC on current branch"
    echo "  $0 demo               # Bump demo on current branch"
    echo
    echo "The workflow runs on the current branch via GitHub Actions."
    echo "After it completes, create a PR to master to trigger deployment."
}

if [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]] || [[ $# -eq 0 ]]; then
    show_help
    exit 0
fi

ENVIRONMENT=""
BUMP_TYPE="patch"

case "$1" in
    stage)
        ENVIRONMENT="staging"
        shift
        if [[ "$1" =~ ^(major|minor|patch)$ ]]; then
            BUMP_TYPE="$1"
            shift
        fi
        ;;
    demo)
        ENVIRONMENT="demo"
        shift
        if [[ "$1" =~ ^(major|minor|patch)$ ]]; then
            BUMP_TYPE="$1"
            shift
        fi
        ;;
    *)
        echo "Error: Unknown option '$1'"
        show_help
        exit 1
        ;;
esac

if ! command -v gh &> /dev/null; then
    echo "Error: gh CLI not found. Install it from https://cli.github.com/"
    exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" == "HEAD" ]]; then
    echo "Error: not on a branch (detached HEAD). Check out the branch you want to deploy."
    exit 1
fi

echo "Triggering $ENVIRONMENT deploy (bump: $BUMP_TYPE) on branch $BRANCH..."
gh workflow run deploy.yaml --ref "$BRANCH" -f environment="$ENVIRONMENT" -f bump_type="$BUMP_TYPE"

echo ""
echo "Workflow triggered. Track progress at:"
echo "  gh run list --workflow=deploy.yaml"
