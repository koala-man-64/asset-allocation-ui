FROM node:20-slim AS builder
WORKDIR /workspace/asset-allocation-ui

ARG VITE_API_BASE_URL=/api
ARG VITE_PORT=5174
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_PORT=${VITE_PORT}

RUN npm install -g pnpm

COPY asset-allocation-contracts/ /workspace/asset-allocation-contracts/
COPY asset-allocation-ui/package.json asset-allocation-ui/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY asset-allocation-ui/ ./
RUN pnpm run build

FROM nginx:alpine
WORKDIR /usr/share/nginx/html
RUN rm -rf ./*

COPY --from=builder /workspace/asset-allocation-ui/dist .
COPY asset-allocation-ui/nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
