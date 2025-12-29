#!/bin/bash

show_help() {
    echo "Usage: $0 [major|minor|patch|stage]"
    echo
    echo "Options:"
    echo "  major     Bump the major version (production)"
    echo "  minor     Bump the minor version (production)"
    echo "  patch     Bump the patch version (production)"
    echo "  stage     Create/increment staging RC version"
    echo "  -h, --help  Show this help message and exit"
    echo
    echo "Examples:"
    echo "  $0 stage   # 2.12.16 → 2.12.17-rc.1 (staging only)"
    echo "  $0 stage   # 2.12.17-rc.1 → 2.12.17-rc.2 (staging only)"
    echo "  $0 patch   # 2.12.16 → 2.12.17 (staging + production)"
}

# No arguments provided
if [ $# -eq 0 ]; then
    echo "Error: No option provided."
    show_help
    exit 1
fi

case "$1" in
    major|minor|patch)
        # Production deployment - bump stable version
        (cd ..;bump-my-version bump "$1") && git push && git push --tags
        ;;
    stage)
        # Staging deployment - create/increment RC version
        cd ..

        # Read current version
        CURRENT_VERSION=$(grep "__version__" league_manager/__init__.py | cut -d'"' -f2)
        echo "Current version: $CURRENT_VERSION"

        # Determine bump strategy
        if [[ $CURRENT_VERSION =~ -rc\.([0-9]+)$ ]]; then
            # Already on RC version, find next available RC number
            echo "Incrementing RC build number..."
            # Parse current version
            if [[ $CURRENT_VERSION =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)-rc\.([0-9]+)$ ]]; then
                MAJOR="${BASH_REMATCH[1]}"
                MINOR="${BASH_REMATCH[2]}"
                PATCH="${BASH_REMATCH[3]}"
                RC_NUM="${BASH_REMATCH[4]}"

                # Find next available RC number
                NEXT_RC=$((RC_NUM + 1))
                while git rev-parse "v${MAJOR}.${MINOR}.${PATCH}-rc.${NEXT_RC}" >/dev/null 2>&1; do
                    echo "Tag v${MAJOR}.${MINOR}.${PATCH}-rc.${NEXT_RC} already exists, trying next..."
                    NEXT_RC=$((NEXT_RC + 1))
                done

                NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}-rc.${NEXT_RC}"
                echo "Creating version: $NEW_VERSION"
                bump-my-version bump --new-version "$NEW_VERSION" rc_build
            else
                bump-my-version bump rc_build
            fi
        else
            # Stable version - bump patch and create RC
            echo "Bumping patch version and creating RC..."
            # Parse current version
            IFS='.' read -r major minor patch <<< "$CURRENT_VERSION"
            # Increment patch
            new_patch=$((patch + 1))
            NEW_VERSION="${major}.${minor}.${new_patch}-rc.1"
            echo "Setting version to: $NEW_VERSION"
            # Use --new-version to set exact version
            bump-my-version bump --new-version "$NEW_VERSION" patch
        fi

        # Push commits and tags
        git push && git push --tags

        # Show new version
        NEW_VERSION=$(grep "__version__" league_manager/__init__.py | cut -d'"' -f2)
        echo "✅ Staging deployment triggered: $NEW_VERSION"
        ;;
    -h|--help)
        show_help
        ;;
    *)
        echo "Error: Invalid option '$1'"
        show_help
        exit 1
        ;;
esac
