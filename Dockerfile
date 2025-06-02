FROM node:22-alpine

RUN apk add --no-cache su-exec

# Create a non-root fallback user and group
ARG APP_USER=nodeapp
ARG APP_GROUP=nodegroup
ARG APP_UID=1000
ARG APP_GID=1000

# Ensure group and user don't already exist before adding
RUN addgroup -g ${APP_GID} ${APP_GROUP} || true && \
    adduser -D -u ${APP_UID} -G ${APP_GROUP} ${APP_USER} || true

WORKDIR /app

# Copy package files and install dependencies as root
COPY . .
RUN yarn install --production

RUN touch /app/events.log && \
    chown ${APP_UID}:${APP_GID} /app/events.log && \
    chmod 777 /app/events.log

# Expose the application port
EXPOSE 3000

# Set environment variables for production
ENV NODE_ENV=production

ENTRYPOINT ["/bin/sh", "-c", "\
  ls -al /app/events.log && \
  if [ $(id -u) -eq 0 ]; then \
    exec su-exec ${UID:-1000}:${GID:-1000} node index.js; \
  else \
    exec node index.js; \
  fi"]
