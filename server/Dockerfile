FROM node:20-alpine

# Cài đặt Python3 cho sandbox
RUN apk add --no-cache python3 py3-pip

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
