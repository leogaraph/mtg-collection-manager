# ── Build de produção do UI ─────────────────────────────────
# Estágio 1: compila o app com Vite (bundle minificado, gzip, code-split)
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ── Estágio 2: serve o build estático com nginx ─────────────
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]
