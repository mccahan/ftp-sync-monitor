FROM node:22-alpine

# Set the working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json yarn.lock ./
RUN yarn install --production

# Set the user to UID and GID from the environment, defaulting to 100:100
ARG USER_UID=100
ARG USER_GID=100
RUN addgroup -g $USER_GID appgroup && \
  adduser -u $USER_UID -G appgroup -s /bin/sh -D appuser

# Switch to the new user
USER appuser

# Copy the application files
COPY . .

# Expose the application port
EXPOSE 3000

# Set environment variables for production
ENV NODE_ENV=production

# Start the application
CMD ["node", "index.js"]
