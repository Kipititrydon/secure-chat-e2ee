const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir les fichiers statiques depuis le dossier 'client'
app.use(express.static(path.join(__dirname, 'client')));

// Tableau pour stocker les utilisateurs connectés { id, name }
let users = [];

io.on('connection', (socket) => {
    console.log(`Nouvelle connexion établie : ${socket.id}`);

    // 1. Enregistrement de l'utilisateur avec son pseudo
    socket.on('register_user', (username) => {
        users.push({
            id: socket.id,
            name: username
        });
        // Diffuser la liste actualisée à tout le monde
        io.emit('update_users', users);
    });

    // 2. Relais des clés publiques (ECDH & ECDSA) entre pairs
    socket.on('share_keys', (data) => {
        io.to(data.targetId).emit('receive_keys', {
            senderId: socket.id,
            ecdhPub: data.ecdhPub,
            ecdsaPub: data.ecdsaPub
        });
    });

    // 3. Relais sécurisé des messages chiffrés et signés
    socket.on('send_message', (data) => {
        const sender = users.find(u => u.id === socket.id);
        const senderName = sender ? sender.name : "Inconnu";

        io.to(data.targetId).emit('receive_message', {
            senderId: socket.id,
            senderName: senderName,
            data: data.data
        });
    });

    // 4. Gestion de la déconnexion
    socket.on('disconnect', () => {
        console.log(`Utilisateur déconnecté : ${socket.id}`);
        users = users.filter(u => u.id !== socket.id);
        io.emit('update_users', users);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Serveur démarré et en écoute sur le port ${PORT}`);
});