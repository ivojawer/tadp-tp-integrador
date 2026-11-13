#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE logistica_test_db'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'logistica_test_db')\gexec
    GRANT ALL PRIVILEGES ON DATABASE logistica_test_db TO "$POSTGRES_USER";
EOSQL

if [ -f /docker-entrypoint-initdb.d/01-init.sql ]; then
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "logistica_test_db" -f /docker-entrypoint-initdb.d/01-init.sql
fi
