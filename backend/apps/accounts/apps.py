"""
App configuration for accounts app
- Replace default admin.site with CustomAdminSite (dashboard + email login)
- Unregister User/Group from admin
"""
from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.accounts'
    verbose_name = 'Accounts'

    def ready(self):
        from django.contrib import admin
        from .admin_site import CustomAdminSite

        # Replace default admin.site with CustomAdminSite so the dashboard shows
        # "Users / Accounts" and login uses email. Copy existing model registrations.
        if not isinstance(admin.site, CustomAdminSite):
            custom_site = CustomAdminSite(name=admin.site.name)
            custom_site._registry = admin.site._registry
            custom_site._actions = getattr(admin.site, '_actions', custom_site._actions)
            custom_site._global_actions = getattr(admin.site, '_global_actions', custom_site._global_actions)
            admin.site = custom_site

        import apps.accounts.signals  # noqa

        from django.contrib.auth.models import Group
        from .models import User

        try:
            if User in admin.site._registry:
                admin.site.unregister(User)
        except Exception:
            pass
        try:
            if Group in admin.site._registry:
                admin.site.unregister(Group)
        except Exception:
            pass

        # Register User with our CustomUserAdmin so /admin/accounts/user/ is available
        from .admin import CustomUserAdmin
        admin.site.register(User, CustomUserAdmin)
