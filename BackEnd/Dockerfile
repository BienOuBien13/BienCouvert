# --- Builder: compile TypeScript -> dist/
FROM node:20-alpine AS builder
WORKDIR /app

# Copier juste les manifests pour optimiser le cache
COPY package*.json ./
RUN npm ci

# Copier le reste et builder
COPY . .
RUN npm run build

# --- Runtime: prod seulement, plus léger
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Copier uniquement ce qui est nécessaire en prod
COPY package*.json ./
RUN npm ci --omit=dev

# Copier les sources compilés
COPY --from=builder /app/dist ./dist

# (Optionnel) Si tu lis des fichiers statiques .env/.json au runtime, copie-les :
# COPY --from=builder /app/.env ./
# COPY --from=builder /app/src/public ./public

EXPOSE 4000

# Démarre via la commande "start" de package.json (node dist/index.js)
CMD ["npm", "start", "--silent"]
