FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
USER 10001:10001
EXPOSE 8080
CMD ["node", "src/server.js"]
