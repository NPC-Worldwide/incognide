#!/bin/bash
# Browser interceptor for Incognide
# This script is called when terminal commands try to open a browser
# It sends the URL back to the Incognide app via a named pipe or file

URL="$1"

# Write URL to a temp file that the app watches
INTERCEPT_FILE="${HOME}/.npcsh/incognide/browser_intercept.txt"
mkdir -p "$(dirname "$INTERCEPT_FILE")"
echo "$URL" >> "$INTERCEPT_FILE"

# Also try to signal via the app's deep link (if supported)
# On macOS, we can use open with our custom URL scheme
if [[ "$OSTYPE" == "darwin"* ]]; then
    # URL-encode the target URL for safe embedding in the deep link
    ENCODED_URL=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$URL" 2>/dev/null || echo "$URL" | sed 's/&/%26/g; s/ /%20/g; s/?/%3F/g; s/=/%3D/g')
    open "incognide://open-url?url=${ENCODED_URL}" 2>/dev/null || true
fi

# On Linux, try xdg-open with the deep link
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open "incognide://open-url?url=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$URL" 2>/dev/null || echo "$URL" | sed 's/&/%26/g')" 2>/dev/null || true
fi

echo "Opening in Incognide: $URL"
