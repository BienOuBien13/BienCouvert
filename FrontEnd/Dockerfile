# --- Build
FROM node:20-alpine AS build
WORKDIR /app

# Copier les manifests
COPY package.json package-lock.json ./

# Installer toutes les dépendances (dev + prod) pour le build
RUN npm ci --include=dev

# Copier le reste du code
COPY . .

# Copie le fichier .env.production comme .env pour le build
COPY .env.production .env

# Build avec les variables d'environnement de production
RUN npm run build

# --- Nginx pour servir le static
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# On garde la conf par défaut ici; le reverse-proxy externe fait le routage
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
