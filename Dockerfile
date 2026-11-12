# QuoteHub (KnowledgeCity) — production image
FROM node:20-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

WORKDIR /app

# Dependencies first, so this layer is cached until package files change.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY src ./src
COPY public ./public
COPY templates ./templates

# Admin edits and a changed admin password are saved in /data — mount a persistent
# volume there, or they are lost every time the container is replaced.
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+process.env.PORT+'/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# The app refuses to start in production unless these are provided at run time:
#   SESSION_SECRET  (32+ random characters)
#   ADMIN_PASSWORD  (8+ characters)
CMD ["node", "server.js"]
