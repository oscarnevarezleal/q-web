FROM node:22-alpine

# Create app directory
WORKDIR /app

# Install dependencies for node-pty
RUN apk add --no-cache make python3 g++ curl bash

# Copy package.json and yarn.lock
COPY package*.json yarn.lock* ./

# Copy scripts directory for the download-xterm.sh script
COPY scripts/ ./scripts/

# Make the script executable
RUN chmod +x ./scripts/download-xterm.sh

# Install dependencies
RUN yarn install

# Copy the rest of the application
COPY . .

# Build the application
RUN yarn build

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD ["node", "dist/server.js"]
