FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .

# Vite hornea estas vars en el build — deben existir en Railway (Variables / Build Args)
ARG VITE_API_URL=https://api-production-144b.up.railway.app/api/v1
ARG VITE_APP_URL=https://localhost
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_URL=$VITE_APP_URL

RUN npm run build

FROM nginx:1.27-alpine
# Config SPA embebida (no depende de que nginx.conf esté en el repo/contexto)
RUN printf '%s\n' \
  'server {' \
  '  listen 80;' \
  '  server_name _;' \
  '  root /usr/share/nginx/html;' \
  '  index index.html;' \
  '  location / {' \
  '    try_files $uri $uri/ /index.html;' \
  '  }' \
  '  location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {' \
  '    expires 7d;' \
  '    add_header Cache-Control "public, immutable";' \
  '  }' \
  '}' > /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
