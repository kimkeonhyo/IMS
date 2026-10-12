# NetBox + 플러그인 커스텀 이미지 (ims-netbox)
# docker build -t ims-netbox:latest ./netbox
FROM netboxcommunity/netbox:latest

# 플러그인 설치 (베이스 이미지는 pip 대신 uv 사용)
RUN /usr/local/bin/uv pip install netbox-topology-views

# 빌드 시 플러그인 static 수집을 위해 PLUGINS를 이미지에 내장
RUN echo "PLUGINS = ['netbox_topology_views']" > /etc/netbox/config/plugins.py
RUN SECRET_KEY="build-time-placeholder-not-used-at-runtime-000000000" \
    /opt/netbox/venv/bin/python /opt/netbox/netbox/manage.py collectstatic --no-input
