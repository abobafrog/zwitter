#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
eval "$(rbenv init - zsh)"
bin/rails db:prepare
bin/rails server -p 4000 -b 0.0.0.0
