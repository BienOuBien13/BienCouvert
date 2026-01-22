# --- Build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
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
