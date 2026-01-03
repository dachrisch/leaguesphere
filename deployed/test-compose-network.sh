#!/bin/bash
set -e

COMPOSE_FILE="${1:-docker-compose.yaml}"
ENV_NAME="${2:-production}"

echo "Testing docker-compose network configuration: $COMPOSE_FILE ($ENV_NAME)"

# Create mock environment file
cat > ls.env.ci <<EOF
SECRET_KEY=ci-test-secret-key
MYSQL_HOST=mysql-mock.example.com
MYSQL_DB_NAME=ci_test_db
MYSQL_USER=ci_test_user
MYSQL_PWD=ci_test_password
DEBUG=False
EOF

# Create CI compose file with mock env
if [ "$ENV_NAME" = "staging" ]; then
  sed 's/env_file: ls.env.staging/env_file: ls.env.ci/g' "$COMPOSE_FILE" > docker-compose.ci.yaml
else
  sed 's/env_file: ls.env/env_file: ls.env.ci/g' "$COMPOSE_FILE" > docker-compose.ci.yaml
fi

# Start stack
echo "Starting docker-compose stack..."
docker compose -f docker-compose.ci.yaml up -d

# Wait for services
sleep 10

# Get app container
APP_CONTAINER=$(docker compose -f docker-compose.ci.yaml ps -q app)

if [ -z "$APP_CONTAINER" ]; then
  echo "❌ Failed to get app container"
  docker compose -f docker-compose.ci.yaml down -v
  exit 1
fi

echo "Testing connectivity from app container: $APP_CONTAINER"

# Test DNS
echo ""
echo "Test 1: DNS Resolution"
if docker exec $APP_CONTAINER nslookup google.com > /dev/null 2>&1; then
  echo "✅ DNS resolution successful"
else
  echo "❌ DNS resolution FAILED"
  docker compose -f docker-compose.ci.yaml down -v
  exit 1
fi

# Test HTTPS
echo ""
echo "Test 2: Internet Connectivity (HTTPS)"
if docker exec $APP_CONTAINER sh -c 'curl -f --max-time 10 https://www.google.com > /dev/null 2>&1'; then
  echo "✅ Internet connectivity successful"
else
  echo "❌ Internet connectivity FAILED"
  docker compose -f docker-compose.ci.yaml down -v
  exit 1
fi

# Test ping (non-critical)
echo ""
echo "Test 3: External IP Connectivity (ICMP)"
if docker exec $APP_CONTAINER sh -c 'ping -c 3 -W 2 8.8.8.8 > /dev/null 2>&1'; then
  echo "✅ Ping successful"
else
  echo "⚠️  Ping failed (not critical)"
fi

echo ""
echo "✅ All connectivity tests passed!"

# Cleanup
docker compose -f docker-compose.ci.yaml down -v
rm -f docker-compose.ci.yaml ls.env.ci

exit 0
