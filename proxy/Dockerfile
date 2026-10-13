# docker build -t streambox-proxy ./proxy && docker run -p 8787:8787 -e ALLOWED_ORIGINS=https://your-site.netlify.app streambox-proxy
FROM node:20-alpine
WORKDIR /app
COPY server.mjs .
USER node
EXPOSE 8787
CMD ["node", "server.mjs"]
