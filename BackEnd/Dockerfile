# --- Builder: compile TypeScript -> dist/
FROM node:20-alpine AS builder
WORKDIR /app

# Install build dependencies for canvas (Python, build tools, native libraries)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev

# Copier juste les manifests pour optimiser le cache
COPY package.json package-lock.json ./

# Installer TOUTES les dépendances (dev + prod) pour le build
RUN npm ci --include=dev

# Copier le reste et builder
COPY . .
RUN npm run build

# --- Runtime: prod seulement, plus léger
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Install runtime dependencies for canvas (native libraries only, no build tools)
RUN apk add --no-cache \
    cairo \
    jpeg \
    pango \
    giflib \
    pixman \
    pangomm \
    libjpeg-turbo \
    freetype

# Copier uniquement ce qui est nécessaire en prod
COPY package*.json ./
RUN npm ci --omit=dev

# Copier les sources compilés
COPY --from=builder /app/dist ./dist

# Copier le fichier .env de production
COPY .env.production ./.env

EXPOSE 4000

# Démarre via la commande "start" de package.json (node dist/index.js)
CMD ["npm", "start", "--silent"]
