from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

admin.site.site_header = 'JDS Sports – Verwaltung'
admin.site.site_title = 'JDS Sports'

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('accounts.urls')),
    path('', include('hub.urls')),
    path('schiedsrichter/', include('schiedsrichter.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
