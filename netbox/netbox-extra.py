# IMS 경로 내장 + 토큰 pepper + Azure AD SSO — netbox-docker 기본 설정 보강
from os import environ

BASE_PATH = environ.get('BASE_PATH', '')

_pepper = environ.get('API_TOKEN_PEPPER', '')
if _pepper:
    API_TOKEN_PEPPERS = {1: _pepper}

# Azure AD SSO — IMS과 동일한 앱 등록 재사용
# Redirect URI: https://ims.example.com/netbox/oauth/complete/azuread-tenant-oauth2/
_azure_key = environ.get('AZURE_AD_CLIENT_ID', '')
if _azure_key:
    REMOTE_AUTH_ENABLED = True
    REMOTE_AUTH_BACKEND = 'social_core.backends.azuread_tenant.AzureADTenantOAuth2'
    SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_KEY = _azure_key
    SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_SECRET = environ.get('AZURE_AD_CLIENT_SECRET', '')
    SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_TENANT_ID = environ.get('AZURE_AD_TENANT_ID', '')
    # 외부는 https(LB 종단), 내부는 http — 콜백 URL을 https로 생성
    SOCIAL_AUTH_REDIRECT_IS_HTTPS = True
