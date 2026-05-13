FROM alpine:3.19

RUN apk update && apk upgrade && \
    apk add --no-cache \
    unzip \
    ca-certificates \
    wget && \
    update-ca-certificates

WORKDIR /pb

RUN wget -q https://github.com/pocketbase/pocketbase/releases/download/v0.22.4/pocketbase_0.22.4_linux_amd64.zip && \
    unzip pocketbase_0.22.4_linux_amd64.zip && \
    rm pocketbase_0.22.4_linux_amd64.zip && \
    mv pocketbase /pb/pocketbase && \
    chmod +x /pb/pocketbase

COPY pb_migrations/ /pb/pb_migrations/
COPY pb_hooks/ /pb/pb_hooks/

EXPOSE 8090

CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]
