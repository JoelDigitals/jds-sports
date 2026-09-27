#!/usr/bin/env bash
# Render.com Start: Datenbank sicher auf aktuellem Stand bringen, dann Server starten
set -o errexit

python manage.py migrate --no-input
exec gunicorn jds.wsgi:application --bind 0.0.0.0:${PORT:-10000} --workers 2 --threads 4 --timeout 60
