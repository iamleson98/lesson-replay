#!/usr/bin/env bash
# check-upstream-name.sh: the repository does not carry the product name of the
# chat server the code it was split from descends from. Nothing here is allowed
# to keep it (there are no dependencies of that name).
#
# Usage: scripts/check-upstream-name.sh        (exit 1 and the lines when found)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# The submodule is another repository (it is checked on its own) and this script
# has to name the word it looks for.
found=$(git grep -nI -i 'mattermost' -- . ':!vendor' ':!scripts/check-upstream-name.sh' || true)
if [ -n "${found}" ]; then
	echo "::error::the upstream product name is back in the repository:"
	echo "${found}"
	exit 1
fi
echo "No upstream product name in the repository."
