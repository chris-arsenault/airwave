FROM node:24-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ .
RUN pnpm run build

FROM nginx:alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/nginx.conf
EXPOSE 7880
CMD ["nginx", "-g", "daemon off;"]
