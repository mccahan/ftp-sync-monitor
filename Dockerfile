FROM node:22-alpine

# Set the working directory
WORKDIR /app

ARG UID=1000
ARG GID=1000
ARG USER=nodeuser
ARG GROUP=nodegroup

ENV HOME=/home/$USER

# Add group and user only if they don't exist
RUN getent group $GID || addgroup -g $GID $GROUP && \
    id -u $UID || adduser -D -u $UID -G $GROUP -h $HOME $USER

# Set permissions for the application directory
RUN chown -R $UID:$GID /app

# Copy package files and install dependencies as root
COPY --chown=node:node package.json yarn.lock ./
RUN yarn install --production
RUN chmod 777 -R /app

# Copy the rest of the application files
COPY --chown=$UID:$GID . .

USER $USER

# Expose the application port
EXPOSE 3000

# Set environment variables for production
ENV NODE_ENV=production

# Start the application
CMD ["node", "index.js"]
