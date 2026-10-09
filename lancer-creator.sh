#!/bin/zsh
# Lance Hyperframes Creator sur http://127.0.0.1:5190
# Les projets sont stockés dans $HYPERFRAMES_CREATOR_HOME (par défaut ~/Movies/Hyperframes Creator).
export PATH="$HOME/.local/bin:$HOME/.local/node/bin:$HOME/.bun/bin:$PATH"
cd "$(dirname "$0")/packages/studio" || exit 1
exec bun run dev
