#!/usr/bin/env bash
# Runs the database tests against a throwaway local Postgres database.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres ./supabase/run-tests.sh
set -euo pipefail
cd "$(dirname "$0")"
db="titan_test_$$"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database $db" >/dev/null
trap 'psql -q -d postgres -c "drop database if exists $db" >/dev/null' EXIT
psql -v ON_ERROR_STOP=1 -q -d "$db" -f tests/00_supabase_stub.sql >/dev/null
for f in migrations/*.sql; do psql -v ON_ERROR_STOP=1 -q -d "$db" -f "$f" >/dev/null; done
for f in tests/0[1-9]_*.sql tests/[1-9][0-9]_*.sql; do echo "== $f"; psql -v ON_ERROR_STOP=1 -q -d "$db" -f "$f" 2>&1 | grep -E 'ok:|FAIL|ERROR' ; done
