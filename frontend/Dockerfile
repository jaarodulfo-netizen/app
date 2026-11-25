FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json yarn.lock ./
RUN corepack enable && corepack yarn install --frozen-lockfile --production=false --non-interactive
COPY . .
ARG REACT_APP_BACKEND_URL
ARG REACT_APP_GOOGLE_CLIENT_ID
ARG DISABLE_EMERGENT_OVERLAY
ENV REACT_APP_BACKEND_URL=${REACT_APP_BACKEND_URL}
ENV REACT_APP_GOOGLE_CLIENT_ID=${REACT_APP_GOOGLE_CLIENT_ID}
ENV DISABLE_EMERGENT_OVERLAY=${DISABLE_EMERGENT_OVERLAY}
RUN corepack yarn build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN npm install --global serve@14.2.4 && npm cache clean --force
COPY --from=build /app/build ./build
ENV NODE_ENV=production
ENV PORT=3000
USER node
CMD ["sh", "-c", "serve -s build -l ${PORT}"]
