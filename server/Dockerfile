FROM node:20-alpine

WORKDIR /app

# Dependencies are copied and installed before the source, so a change to the
# code does not invalidate the layer that took the time to install.
COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# Never root. A container process that does not need to write to the image
# should not be able to.
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node

ENV NODE_ENV=production
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
