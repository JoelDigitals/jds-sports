from django.contrib.auth.hashers import BCryptSHA256PasswordHasher


class SchnellerBCryptHasher(BCryptSHA256PasswordHasher):
    """bcrypt (Kostenfaktor 10, OWASP-Mindestwert) statt PBKDF2 mit 1 Mio. Durchläufen.

    Auf kleinen Servern (Render Free ≈ 0,1 CPU) dauerte ein Login mit PBKDF2 viele Sekunden, mit bcrypt ~0,1–0,5 s.
    Der Algorithmusname bleibt „bcrypt_sha256“; bestehende Hashes werden beim nächsten Login automatisch umgestellt.
    """

    rounds = 10
