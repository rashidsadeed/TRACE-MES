#!/usr/bin/env bash
# start_live.sh — One-shot helper to seed + launch the live data generator
# Usage: bash start_live.sh
set -e

echo "=== TRACE-MES Live Data Setup ==="

echo "[1/3] Applying migrations..."
python manage.py migrate --run-syncdb

echo "[2/3] Seeding factory data..."
python manage.py seed_factory

echo "[3/3] Starting live data generator (Ctrl+C to stop)..."
python manage.py run_live_generator
