FROM node:18

WORKDIR /app

COPY package.json ./
COPY index.js ./

RUN npm install

CMD ["npm", "start"]