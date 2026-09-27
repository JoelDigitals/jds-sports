from .modules import module_fuer


def navigation(request):
    if not getattr(request, 'user', None) or not request.user.is_authenticated:
        return {}
    meine, _ = module_fuer(request.user)
    return {'nav_module': meine}
