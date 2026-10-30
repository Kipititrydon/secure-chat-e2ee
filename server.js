const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir les fichiers statiques du dossier public (HTML, CSS, JS client)
app.use(express.static(path.join(__dirname, 'public')));

// Tableau pour stocker les utilisateurs connectés
let users = [];

io.on('connection', (socket) => {
    console.log(`Nouvelle connexion établie : ${socket.id}`);

    // Enregistrement d'un utilisateur avec son pseudo et ses clés publiques (ECDH & ECDSA)
    socket.on('register', (userData) => {
        users.push({
            id: socket.id,
            username: userData.username,
            publicKey: userData.publicKey
        });

        // Diffuser la liste actualisée de tous les utilisateurs connectés
        io.emit('user-list', users);
    });

    // Relais sécurisé des messages chiffrés de bout en bout entre pairs
    socket.on('encrypted-message', (data) => {
        io.to(data.targetId).emit('encrypted-message', {
            senderId: socket.id,
            ciphertext: data.ciphertext,
            iv: data.iv,
            signature: data.signature,
            counter: data.counter,
            timestamp: data.timestamp
        });
    });

    // Gestion de la déconnexion d'un utilisateur
    socket.on('disconnect', () => {
        console.log(`Utilisateur déconnecté : ${socket.id}`);
        users = users.filter(u => u.id !== socket.id);
        
        // Mettre à jour la liste des utilisateurs pour tout le monde
        io.emit('user-list', users);
    });
});

// Utilisation du port dynamique pour l'hébergement cloud (Render/Railway) ou 3000 en local
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Serveur démarré et en écoute sur le port ${PORT}`);
});