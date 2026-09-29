"""Django-Einstellungen für JDS Sports."""

import os
import sys
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

# Konfiguration aus Umgebungsvariablen bzw. .env (echte Umgebungsvariablen, z. B. auf Render, haben Vorrang)
env = environ.Env()
environ.Env.read_env(BASE_DIR / '.env')

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'jds-sports-dev-secret-change-me')
# Auf Render (RENDER=true) standardmäßig aus – die Debug-Seite würde sonst interne Einstellungen öffentlich zeigen
DEBUG = os.environ.get('DJANGO_DEBUG', '0' if os.environ.get('RENDER') else '1') == '1'
# Produktiv-Domain auf Render
PRODUKTIV_HOST = 'jds-sports.onrender.com'

ALLOWED_HOSTS = [h.strip() for h in os.environ.get('DJANGO_ALLOWED_HOSTS', f'localhost,127.0.0.1,[::1],{PRODUKTIV_HOST}').split(',') if h.strip()]
CSRF_TRUSTED_ORIGINS = [o.strip() for o in os.environ.get('DJANGO_CSRF_TRUSTED_ORIGINS', f'https://{PRODUKTIV_HOST}').split(',') if o.strip()]

# Render.com setzt den öffentlichen Hostnamen automatisch
RENDER_HOST = os.environ.get('RENDER_EXTERNAL_HOSTNAME')
if RENDER_HOST and RENDER_HOST not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(RENDER_HOST)
    CSRF_TRUSTED_ORIGINS.append(f'https://{RENDER_HOST}')

if not DEBUG:
    # hinter Renders HTTPS-Proxy
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = os.environ.get('DJANGO_SSL_REDIRECT', '1') == '1'
    SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = True

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.humanize',
    'waffle',
    'accounts',
    'verbaende',
    'hub',
    'schiedsrichter',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',  # statische Dateien (Admin-CSS) in Produktion
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'waffle.middleware.WaffleMiddleware',
]

ROOT_URLCONF = 'jds.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                'hub.context_processors.navigation',
            ],
        },
    },
]

WSGI_APPLICATION = 'jds.wsgi.application'

# Datenbank ausschließlich über DATABASE_URL – Server: PostgreSQL (Render), lokal z. B. sqlite:///db.sqlite3
DATABASES = {
    'default': env.db(),  # Liest die DATABASE_URL aus der .env Datei
}
if 'test' in sys.argv:
    # Tests nie gegen die echte Datenbank: eigene URL oder SQLite im Speicher
    DATABASES = {'default': env.db('TEST_DATABASE_URL', default='sqlite://:memory:')}

_db = DATABASES['default']
if _db['ENGINE'] == 'django.db.backends.sqlite3':
    # km-Berechnung schreibt im Hintergrund – kurz warten statt „database is locked“
    _db.setdefault('OPTIONS', {})['timeout'] = 20
elif str(_db.get('PORT')) == '6543' or 'pooler' in str(_db.get('HOST', '')):
    # Supabase/pgBouncer im Transaktionsmodus: keine serverseitigen Cursor und keine vorbereiteten Statements
    # (psycopg 3). Die Verbindung zum Pooler wird trotzdem wiederverwendet – jeder Neuaufbau kostet mehrere Roundtrips.
    _db['CONN_MAX_AGE'] = 60
    _db['CONN_HEALTH_CHECKS'] = True
    _db['DISABLE_SERVER_SIDE_CURSORS'] = True
    _db.setdefault('OPTIONS', {})['prepare_threshold'] = None
else:
    _db['CONN_MAX_AGE'] = 600
    _db['CONN_HEALTH_CHECKS'] = True

AUTH_USER_MODEL = 'accounts.User'

# Sessions im signierten Cookie statt in der Datenbank – spart bei jedem Seitenaufruf Datenbank-Roundtrips
SESSION_ENGINE = 'django.contrib.sessions.backends.signed_cookies'
SESSION_COOKIE_HTTPONLY = True
MESSAGE_STORAGE = 'django.contrib.messages.storage.fallback.FallbackStorage'

# bcrypt (schnell genug für kleine Server, sicher); PBKDF2/bcrypt bleiben lesbar für bestehende Passwörter
PASSWORD_HASHERS = [
    'jds.hashers.SchnellerBCryptHasher',
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',
    'django.contrib.auth.hashers.BCryptPasswordHasher',
]

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
]

LOGIN_URL = 'login'
LOGIN_REDIRECT_URL = 'hub:dashboard'
LOGOUT_REDIRECT_URL = 'login'

LANGUAGE_CODE = 'de-de'
TIME_ZONE = 'Europe/Berlin'
USE_I18N = True
# Spielzeiten sind immer Ortszeit (Europe/Berlin) – wie in nuLiga/Handball360
USE_TZ = False

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [BASE_DIR / 'static']  # static/css/app.css = gebautes Tailwind (frontend/)
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage' if not DEBUG
                    else 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}
MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# E-Mail: Versand über Mailjet, sobald API-Schlüssel gesetzt sind – sonst Ausgabe in der Konsole (Entwicklung)
MAILJET_API_KEY = os.environ.get('MAILJET_API_KEY', '')
MAILJET_SECRET_KEY = os.environ.get('MAILJET_SECRET_KEY', '')
EMAIL_BACKEND = (
    'jds.mail.MailjetBackend' if MAILJET_API_KEY and MAILJET_SECRET_KEY
    else 'django.core.mail.backends.console.EmailBackend'
)
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'JDS Sports <no-reply@joel-digitals.com>')
SERVER_EMAIL = DEFAULT_FROM_EMAIL
EMAIL_TIMEOUT = 15
PASSWORD_RESET_TIMEOUT = 60 * 60 * 24  # Link 24 Stunden gültig

# Automatische km-Berechnung im Hintergrund-Thread (in Tests synchron)
KM_IM_HINTERGRUND = 'test' not in sys.argv

# Feature-Flags (django-waffle): unbekannte Flags sind aus
WAFFLE_FLAG_DEFAULT = False
WAFFLE_CREATE_MISSING_FLAGS = False
