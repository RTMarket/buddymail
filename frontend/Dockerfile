FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# NOTE: run chmod AFTER the final copy, otherwise nginx serves 403
# (cp/tar under restrictive umask strips the "other" read bit).
RUN npm run build && chmod -R a+rX dist

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
RUN chmod -R a+rX /usr/share/nginx/html
EXPOSE 80
