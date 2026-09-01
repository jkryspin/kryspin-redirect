FROM node:14-bullseye AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm install
COPY client/ ./
RUN npm run build

FROM node:14-bullseye
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm install --omit=dev
COPY index.js pgconn.js ./
COPY --from=client-build /app/client/build ./client/build
EXPOSE 8080
CMD ["node", "index.js"]
