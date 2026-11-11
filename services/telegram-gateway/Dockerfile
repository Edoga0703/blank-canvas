FROM node:20-alpine

WORKDIR /app

# Instalar dependencias de producción
COPY package.json ./
RUN npm install --omit=dev

# Copiar código fuente
COPY src/ ./src/

# Directorio persistente de sesiones
VOLUME [ "/app/.sessions" ]

EXPOSE 3005

ENV NODE_ENV=production
ENV PORT=3005
ENV SESSIONS_DATA_DIR=/app/.sessions

CMD ["node", "src/index.js"]
