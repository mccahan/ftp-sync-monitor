FROM node:22-alpine

# Set the working directory
WORKDIR /app

ARG UNAME=testuser
ARG UID=1000
ARG GID=1000
RUN groupadd -g $PGID -o $UNAME
RUN useradd -m -u $PUID -g $PGID -o -s /bin/bash $UNAME
USER $UNAME

# Set permissions for the application directory
RUN chown -R $PUID:$PGID /app

# Copy package files and install dependencies as root
COPY --chown=node:node package.json yarn.lock ./
RUN yarn install --production
RUN chmod 777 -R /app

# Copy the rest of the application files
COPY --chown=node:node . .

# Expose the application port
EXPOSE 3000

# Set environment variables for production
ENV NODE_ENV=production

# Start the application
CMD ["node", "index.js"]
