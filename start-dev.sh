#!/bin/bash
cd "$(dirname "$0")"
ACTUAL_KEY=$(grep "^ANTHROPIC_API_KEY=" .env.local | cut -d= -f2-)
unset ANTHROPIC_API_KEY
unset ANTHROPIC_BASE_URL
ANTHROPIC_API_KEY="$ACTUAL_KEY" node_modules/.bin/next dev
