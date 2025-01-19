FROM node:22-alpine

# Set the working directory
WORKDIR /app

# Set permissions for the application directory
RUN chown -R 1000:1000 /app

# Copy package files and install dependencies as root
COPY --chown=node:node package.json yarn.lock ./
RUN yarn install --production
RUN chmod 777 -R /app

# Switch to the non-root user
USER 1000

# Copy the rest of the application files
COPY --chown=node:node . .

# Expose the application port
EXPOSE 3000

# Set environment variables for production
ENV NODE_ENV=production

# Start the application
CMD ["node", "index.js"]
