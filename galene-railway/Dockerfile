# Galene + coturn — single container for Railway (HTTP signaling + TCP TURN relay)
ARG GALENE_VERSION=master

FROM golang:1.24-alpine AS builder

ARG GALENE_VERSION
ARG TARGETOS=linux
ARG TARGETARCH=amd64

RUN apk add --no-cache git nodejs npm wget

WORKDIR /build
RUN git clone --depth=1 --branch="${GALENE_VERSION}" https://github.com/jech/galene.git .

# Optional MediaPipe assets (background blur in the web client)
RUN set -eux; \
  mkdir -p mediapipe; \
  cd mediapipe; \
  wget -q https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.21.tgz; \
  tar xzf tasks-vision-*.tgz; \
  rm -f ../static/third-party/tasks-vision; \
  mv package ../static/third-party/tasks-vision; \
  mkdir -p ../static/third-party/tasks-vision/models; \
  wget -q -O ../static/third-party/tasks-vision/models/selfie_segmenter.tflite \
    https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite

RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
  go build -ldflags='-s -w' -o /out/galene .

FROM alpine:3.21

RUN apk add --no-cache \
  ca-certificates \
  coturn \
  curl \
  jq \
  openssl \
  tini \
  tzdata

RUN addgroup -S galene && adduser -S -G galene galene

RUN mkdir -p /opt/galene/static /data /data/recordings /groups /etc/coturn \
  && chown -R galene:galene /data /groups /opt/galene

COPY --from=builder /out/galene /opt/galene/galene
COPY --from=builder /build/static /opt/galene/static
COPY groups/ /groups/
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV GALENE_DATA=/data \
  GALENE_GROUPS=/groups \
  GALENE_STATIC=/opt/galene/static \
  GALENE_RECORDINGS=/data/recordings \
  GALENE_TURN_LISTEN_PORT=1194 \
  GALENE_RELAY_ONLY=1 \
  GALENE_INSECURE=1

EXPOSE 8080 1194

WORKDIR /opt/galene

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-8080}/" >/dev/null || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
