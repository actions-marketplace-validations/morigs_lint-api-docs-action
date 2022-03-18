FROM node:16-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src/ src/
RUN npm run build && npm prune --production

FROM node:16-alpine
RUN apk add --no-cache tini
COPY --from=builder app/package.json .
COPY --from=builder app/lib lib/
COPY --from=builder app/node_modules node_modules/
ENTRYPOINT [ "/sbin/tini", "--", "node", "/lib/index.js" ]
