FROM node:22-alpine

RUN apk add --no-cache su-exec

# Create a non-root fallback user and group
ARG APP_USER=nodeapp
ARG APP_GROUP=nodegroup
ARG APP_UID=1000
ARG APP_GID=1000

RUN addgroup -g ${APP_GID} ${APP_GROUP} && \
    adduser -D -u ${APP_UID} -G ${APP_GROUP} ${APP_USER}

WORKDIR /app

# Copy package files and install dependencies as root
COPY . .
RUN yarn install --production

# Expose the application port
EXPOSE 3000

# Set environment variables for production
ENV NODE_ENV=production

# Entrypoint that allows dynamic UID/GID usage via su-exec
ENTRYPOINT ["/bin/sh", "-c", "exec su-exec ${UID:-1000}:${GID:-1000} node index.js"]
