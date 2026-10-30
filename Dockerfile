<<<<<<< HEAD
﻿FROM node:18-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm install
COPY server/ .
COPY client/ ./client/
EXPOSE 3000
CMD ["node", "server.js"]
=======
FROM node:20-alpine

# Définition du répertoire de travail dans le conteneur
WORKDIR /app

# Copie des fichiers de dépendances
COPY package*.json ./

# Installation des dépendances de production
RUN npm install --production

# Copie de tout le code source
COPY . .

# Exposition du port de l'application
EXPOSE 3000

# Commande pour démarrer le serveur
CMD ["node", "server/server.js"]
>>>>>>> 3fe452332384e4a7da463e94d62970786e0e0d6b
