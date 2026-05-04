# syntax=docker/dockerfile:1.7
FROM node:25-slim@sha256:e49fd70491eb042270f974167c874d6245287263ffc16422fcf93b3c150409d8 AS builder
WORKDIR /workspace/asset-allocation-ui

ARG VITE_API_BASE_URL=/api
ARG VITE_PORT=5174
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_PORT=${VITE_PORT}

RUN npm install -g pnpm

COPY asset-allocation-ui/package.json asset-allocation-ui/pnpm-lock.yaml ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=true \
    pnpm install --frozen-lockfile

COPY asset-allocation-ui/ ./
RUN pnpm run build

FROM nginx:alpine@sha256:5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de
WORKDIR /usr/share/nginx/html
RUN rm -rf ./*

COPY --from=builder /workspace/asset-allocation-ui/dist .
COPY asset-allocation-ui/nginx.conf /etc/nginx/templates/default.conf.template
COPY asset-allocation-ui/docker/write-ui-runtime-config.sh /docker-entrypoint.d/30-write-ui-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/30-write-ui-runtime-config.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
