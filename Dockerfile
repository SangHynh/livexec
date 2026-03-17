FROM node:20-alpine

# Install Python3 and necessary build tools for native modules if any
RUN apk add --no-cache python3 py3-pip make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies including devDeps for testing if needed in container
RUN npm ci

# Copy the rest of the application
COPY . .

# Ensure temp directory exists and has correct permissions
RUN mkdir -p temp/executions && chmod -R 777 temp

EXPOSE 3000

# Default command (will be overridden by docker-compose)
CMD ["npm", "run", "dev"]
