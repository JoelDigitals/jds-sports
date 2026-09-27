"""Django-Einstellungen für JDS Sports."""

import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_env_file(path: Path) -> None:
    """Minimaler .env-Loader (KEY=wert je Zeile); echte Umgebungsvariablen haben Vorrang."""
    if not path.exists():
        return
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_file(BASE_DIR / '.env')

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'jds-sports-dev-secret-change-me')
DEBUG = os.environ.get('DJANGO_DEBUG', '1') == '1'
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

if os.environ.get('DATABASE_URL'):
    # Produktion (z. B. Render PostgreSQL)
    import dj_database_url

    DATABASES = {'default': dj_database_url.parse(os.environ['DATABASE_URL'], conn_max_age=600, conn_health_checks=True)}
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': os.environ.get('DJANGO_DB_PATH', BASE_DIR / 'db.sqlite3'),
            # km-Berechnung schreibt im Hintergrund – kurz warten statt „database is locked“
            'OPTIONS': {'timeout': 20},
        }
    }

AUTH_USER_MODEL = 'accounts.User'

# bcrypt zusätzlich, damit Konten aus der alten Node-App übernommen werden können
PASSWORD_HASHERS = [
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
