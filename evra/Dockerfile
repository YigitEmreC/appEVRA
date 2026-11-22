# Home Assistant (or the GitHub workflow) passes the base image for the Pi
# (aarch64) or a PC (amd64), plus the processor and the add-on version.
ARG BUILD_FROM
FROM ${BUILD_FROM}
ARG BUILD_ARCH
ARG BUILD_VERSION

# A small web server for the app's files.
RUN apk add --no-cache nginx

# Start script and web server settings, then the Evra app itself
# (tools/build_addon.py copies it into app/).
COPY rootfs /
COPY app /var/www/evra
RUN chmod a+x /etc/services.d/evra/run /etc/services.d/evra/finish

LABEL \
  io.hass.name="Evra" \
  io.hass.description="The Evra smart home app, served from your Home Assistant" \
  io.hass.type="addon" \
  io.hass.arch="${BUILD_ARCH}" \
  io.hass.version="${BUILD_VERSION}" \
  org.opencontainers.image.title="Evra" \
  org.opencontainers.image.source="https://github.com/YigitEmreC/appEVRA" \
  org.opencontainers.image.version="${BUILD_VERSION}"
