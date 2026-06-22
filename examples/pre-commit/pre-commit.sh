#!/bin/sh
# Plain git pre-commit hook. Install with:
#   cp examples/pre-commit/pre-commit.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
#
# Blocks the commit if the architecture grade drops to D or any cycle exists.
set -e

echo "Running archora architecture check..."
npx -y @archora/cli check . --fail-on grade:D --fail-on cycles:0
