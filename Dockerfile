# Stage 1: Build the application
FROM node:21-slim AS build

# Set working directory
WORKDIR /app

# Install dependencies
# Copy package.json and package-lock.json first to leverage Docker cache
COPY package.json package-lock.json ./
# Install all dependencies (including devDependencies for build)
RUN npm ci 

# Copy the rest of the application source code
COPY . .

# Build the TypeScript code
RUN npm run build

# Prune devDependencies for the final image
RUN npm prune --production

# Stage 2: Create the final production image
FROM node:21-slim AS production

ENV NODE_ENV=production

WORKDIR /app

# Copy built code and production node_modules from the build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/static_data ./static_data
COPY package.json ./

# Ensure the mount point directory exists (redundant if volume mounts, but good practice)
# RUN mkdir -p /app/data # This line is now less critical but harmless

# Expose the port the app runs on (matching what's in fly.toml)
EXPOSE 3001

# Command to run the application
CMD ["node", "dist/index.js"] 