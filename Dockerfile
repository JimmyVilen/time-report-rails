# Shared stage: full dependency tree plus the built app. docker-compose targets
# this stage for the migration job, which needs tsx and scripts/db from devDeps.
FROM node:24-alpine AS build
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY . ./
RUN npm run build

# Nitro's node-server output is self-contained: the server, its bundled runtime
# dependencies and the static assets all live under .output, so the image needs
# no package.json and no node_modules.
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --chown=node:node --from=build /build/.output ./.output
USER node
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
