FROM node:20-alpine AS deps

WORKDIR /app

# python3/make/g++ são necessários só para compilar o better-sqlite3, uma
# peer dependency opcional e não usada do better-auth (o app usa o libSQL
# client). Ficam restritos a este estágio para não inchar a imagem final.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm install --omit=dev

FROM node:20-alpine

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
