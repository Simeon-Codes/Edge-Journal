FROM alpine:3.19

ARG PB_VERSION=0.22.4

RUN apk add --no-cache unzip ca-certificates wget

RUN wget -q https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip \
    && unzip pocketbase_${PB_VERSION}_linux_amd64.zip \
    && rm pocketbase_${PB_VERSION}_linux_amd64.zip \
    && mkdir -p /pb \
    && mv pocketbase /pb/pocketbase \
    && chmod +x /pb/pocketbase

WORKDIR /pb

COPY pb_migrations/ /pb/pb_migrations/
COPY pb_hooks/ /pb/pb_hooks/

RUN ls -la /pb

EXPOSE 8080

CMD sh -c '/pb/pocketbase serve --http=0.0.0.0:${PORT:-8080} --dir=/pb/pb_data'