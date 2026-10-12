# NetBox — 인프라 대장 (IMS 동거 스택)

IMS와 같은 호스트/도메인에서 NetBox를 서빙한다 (`https://ims.example.com/netbox/`).
IMS의 **인프라 대장(/infra)** 페이지가 이 NetBox의 랙 배치도(SVG)와 콘솔(iframe)을 내장한다.

## 구성 파일

| 파일 | 역할 |
|---|---|
| `Dockerfile` | NetBox + `netbox-topology-views` 플러그인 이미지 (`ims-netbox`) |
| `docker-compose.override.yml` | netbox·worker·redis 컨테이너 + IMS backend에 NetBox 연동 env 주입 (compose 자동 병합) |
| `netbox-extra.py` | netbox-docker 기본 설정 보강: `BASE_PATH`(경로 내장), `API_TOKEN_PEPPERS`(v2 토큰), Azure AD SSO |
| `Caddyfile` | IMS(api/SPA) + NetBox(`/netbox/*`, static/media prefix strip) 라우팅 |

## 실행

```bash
docker build -t ims-netbox:latest ./netbox
# 배포 호스트에서 docker-compose.yml(IMS) 과 함께 override 파일을 두고
docker compose up -d netbox netbox-worker netbox-redis
```

## 시크릿

런타임 시크릿은 배포 호스트의 `.env` 로 주입한다 (저장소에 커밋하지 않음):
`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `NETBOX_SECRET_KEY`, `NETBOX_API_TOKEN_PEPPER`,
`NETBOX_SUPERUSER_PASSWORD`, `NETBOX_TOKEN`, `AZURE_AD_*`

- DB: `<DB_HOST>` 의 `netbox` 데이터베이스
- SSO Redirect URI: `https://ims.example.com/netbox/oauth/complete/azuread-tenant-oauth2/`
