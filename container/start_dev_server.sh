#!/bin/zsh
set -e

# 1. Setup container and database
echo "📦 Initializing test container and database..."
SCRIPT_DIR="$(dirname "$0")"
cd "$SCRIPT_DIR"
./spinup_test_db.sh
cd ..

# 2. Get the actual IP of servyy-test
echo "🔍 Discovering container IP..."
# Extracting the first IPv4 address from the eth0 interface
CONTAINER_IP=$(lxc list servyy-test --format json | jq -r '.[0].state.network.eth0.addresses[] | select(.family=="inet") | .address' | head -n 1)

if [ -z "$CONTAINER_IP" ]; then
    echo "❌ Error: Could not determine IP for servyy-test"
    exit 1
fi
echo "✅ Found IP: $CONTAINER_IP"

# 3. Export environment variables
export league_manager=dev
export MYSQL_HOST="$CONTAINER_IP"
export MYSQL_DB_NAME=test_db
export MYSQL_USER=user
export MYSQL_PWD=user

# 4. Run migrations
echo "🔄 Running database migrations..."
python manage.py migrate --no-input

# 5. Create default user (admin/admin)
echo "👤 Creating default admin user..."
echo "from django.contrib.auth import get_user_model; User = get_user_model(); User.objects.filter(username='admin').exists() or User.objects.create_superuser('admin', 'admin@example.com', 'admin')" | python manage.py shell

# 6. Start dev server
echo "🌐 Starting development server at http://localhost:8000 (DB at $MYSQL_HOST)"
python manage.py runserver 0.0.0.0:8000 --insecure
