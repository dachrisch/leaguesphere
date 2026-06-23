#!/bin/bash
# LeagueSphere Staging Database Initialization
# This script creates the staging database and user with proper privileges

set -e

MYSQL_BACKUP_USER="${MYSQL_BACKUP_USER:-}"
MYSQL_BACKUP_PWD="${MYSQL_BACKUP_PWD:-}"

mariadb -h localhost -u root -p"${MYSQL_ROOT_PASSWORD}" <<-EOSQL
    CREATE DATABASE IF NOT EXISTS ${MYSQL_DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'%' IDENTIFIED BY '${MYSQL_PWD}';
    GRANT ALL PRIVILEGES ON ${MYSQL_DB_NAME}.* TO '${MYSQL_USER}'@'%';
    FLUSH PRIVILEGES;
EOSQL

echo "Database ${MYSQL_DB_NAME} and user ${MYSQL_USER} created successfully."

if [ -n "${MYSQL_BACKUP_USER}" ]; then
  mariadb -h localhost -u root -p"${MYSQL_ROOT_PASSWORD}" <<-EOSQL
    CREATE USER IF NOT EXISTS '${MYSQL_BACKUP_USER}'@'localhost' IDENTIFIED BY '${MYSQL_BACKUP_PWD}';
    GRANT RELOAD, PROCESS, LOCK TABLES, REPLICATION CLIENT ON *.* TO '${MYSQL_BACKUP_USER}'@'localhost';
    FLUSH PRIVILEGES;
EOSQL
  echo "Backup user ${MYSQL_BACKUP_USER} created."
fi
