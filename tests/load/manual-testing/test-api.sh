#!/bin/bash

# Login and extract cookies
LOGIN_RESPONSE=$(curl -s -c /tmp/cookies.txt -b /tmp/cookies.txt \
  "https://stage.leaguesphere.app/login/" 2>&1)

# Extract CSRF token
CSRF=$(echo "$LOGIN_RESPONSE" | grep -oP 'name="csrfmiddlewaretoken"\s+value="\K[^"]+')
echo "CSRF Token: $CSRF"

# Login
curl -s -c /tmp/cookies.txt -b /tmp/cookies.txt \
  -X POST "https://stage.leaguesphere.app/login/" \
  -d "username=k6&password=load!Test&csrfmiddlewaretoken=$CSRF" \
  > /dev/null

echo "Cookies after login:"
cat /tmp/cookies.txt

# Get CSRF from cookie
CSRF_COOKIE=$(grep csrftoken /tmp/cookies.txt | awk '{print $NF}')
echo "CSRF from cookie: $CSRF_COOKIE"

# Try API call
echo ""
echo "Testing gamelog endpoint..."
curl -s -b /tmp/cookies.txt \
  -X POST "https://stage.leaguesphere.app/api/gamelog/45" \
  -H "Content-Type: application/json" \
  -H "X-Csrftoken: $CSRF_COOKIE" \
  -d '{"gameId":45,"team":"Lions","event":"Goal","half":"FH"}' | jq .
