FROM node:20-bookworm-slim

WORKDIR /usr/src/app

COPY app/package.json ./
COPY app/package-lock.json ./
RUN npm install

COPY app/ ./
COPY docker/start-service.sh /usr/local/bin/start-service.sh
RUN chmod +x /usr/local/bin/start-service.sh

# fallback, actually managed by compose file
CMD ["sh", "/usr/local/bin/start-service.sh", "api"]
CMD ["sh", "/usr/local/bin/start-service.sh", "worker"]
