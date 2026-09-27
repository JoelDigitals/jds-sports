#!/usr/bin/env bash
# Render.com Build: Abhängigkeiten, statische Dateien, Datenbank-Migrationen
set -o errexit

pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate --no-input
