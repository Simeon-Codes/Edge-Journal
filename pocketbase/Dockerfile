FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y \
    unzip \
    wget \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /pb

RUN wget -O pb.zip https://github.com/pocketbase/pocketbase/releases/download/v0.22.4/pocketbase_0.22.4_linux_amd64.zip && \
    unzip pb.zip && \
    rm pb.zip && \
    chmod +x pocketbase

COPY pb_migrations/ /pb/pb_migrations/
COPY pb_hooks/ /pb/pb_hooks/

EXPOSE 8090

CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]