FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=8787 \
    RELAY_TTL_HOURS=24 \
    RELAY_MAX_BODY=262144

WORKDIR /app

# 런타임 의존성이 없으므로 npm install 이 필요 없다.
COPY package.json ./
COPY src ./src

# SQLite 를 쓸 경우 볼륨을 여기에 마운트한다 (RELAY_DB=/data/relay.sqlite).
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]

USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
