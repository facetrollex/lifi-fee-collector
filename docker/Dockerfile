FROM node:20-bookworm-slim

WORKDIR /usr/src/app

COPY app/package.json ./
COPY app/package-lock.json ./
RUN npm install

COPY app/ ./

CMD ["sh", "-c", "if [ \"${APP_ENV:-development}\" = \"development\" ]; then npm run dev:api; else npm run build && npm run start:api; fi"]
