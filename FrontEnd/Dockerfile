# --- Build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Si tu utilises VITE_API_BASE, docker-compose fournit l'env au build
RUN npm run build

# --- Nginx pour servir le static
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# On garde la conf par défaut ici; le reverse-proxy externe fait le routage
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
