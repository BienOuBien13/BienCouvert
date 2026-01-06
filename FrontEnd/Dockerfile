
FROM nginx:alpine

# Global
COPY nginx.conf /etc/nginx/nginx.conf

# Site (server {})
COPY default.conf /etc/nginx/conf.d/default.conf

# Build Vite
COPY dist/ /usr/share/nginx/html/

#
