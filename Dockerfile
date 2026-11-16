FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ai-service.js ./
COPY public ./public
RUN mkdir /app/data && chown -R node:node /app
USER node
ENV PORT=4186
ENV NODE_ENV=production
EXPOSE 4186
CMD ["node", "server.js"]
