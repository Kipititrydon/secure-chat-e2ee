const socket = io();

let myUsername = '';
let selectedTargetId = null;
let currentSharedKey = null; 
let myEcdhKeyPair = null;     
let myEcdsaKeyPair = null;     
let peerEcdsaPublicKey = null; 
let messageCounter = 0;        
const receivedNonces = new Map(); 

const loginSection = document.getElementById('login-section');
const usernameInput = document.getElementById('username-input');
const loginBtn = document.getElementById('login-btn');
const userStatus = document.getElementById('user-status');
const usersList = document.getElementById('users-list');
const chatHeader = document.getElementById('chat-header');
const inputSection = document.getElementById('input-section');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const chatMessages = document.getElementById('chat-messages');

// 1. Connexion et génération des clés
loginBtn.addEventListener('click', async () => {
    myUsername = usernameInput.value.trim();
    if (myUsername) {
        myEcdhKeyPair = await window.crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"]
        );
        myEcdsaKeyPair = await window.crypto.subtle.generateKey(
            { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]
        );

        socket.emit('register_user', myUsername);
        userStatus.textContent = `Connecté : ${myUsername}`;
        loginSection.classList.add('hidden');
        appendSystemMessage("Clés ECDH et ECDSA générées avec succès.");
    }
});

// 2. Liste des utilisateurs et clic pour initier l'échange
socket.on('update_users', (users) => {
    usersList.innerHTML = '';
    users.forEach(user => {
        if (user.name !== myUsername) {
            const li = document.createElement('li');
            li.textContent = user.name;
            li.className = 'p-2 bg-gray-700 rounded cursor-pointer hover:bg-gray-600 transition';
            li.addEventListener('click', async () => {
                selectedTargetId = user.id;
                chatHeader.textContent = `Canal sécurisé avec : ${user.name}`;
                inputSection.classList.remove('hidden');
                appendSystemMessage(`Envoi des clés publiques à ${user.name}...`);

                const ecdhPubJwk = await window.crypto.subtle.exportKey("jwk", myEcdhKeyPair.publicKey);
                const ecdsaPubJwk = await window.crypto.subtle.exportKey("jwk", myEcdsaKeyPair.publicKey);

                socket.emit('share_keys', {
                    targetId: selectedTargetId,
                    ecdhPub: ecdhPubJwk,
                    ecdsaPub: ecdsaPubJwk
                });
            });
            usersList.appendChild(li);
        }
    });
});

// 3. Réception des clés et dérivation
socket.on('receive_keys', async (data) => {
    if (currentSharedKey && selectedTargetId === data.senderId) return;

    selectedTargetId = data.senderId;
    appendSystemMessage(`Clés reçues. Établissement du canal sécurisé...`);

    try {
        const peerEcdh = await window.crypto.subtle.importKey(
            "jwk", data.ecdhPub, { name: "ECDH", namedCurve: "P-256" }, true, []
        );
        peerEcdsaPublicKey = await window.crypto.subtle.importKey(
            "jwk", data.ecdsaPub, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]
        );

        currentSharedKey = await window.crypto.subtle.deriveKey(
            { name: "ECDH", public: peerEcdh },
            myEcdhKeyPair.privateKey,
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );

        inputSection.classList.remove('hidden');
        appendSystemMessage("Canal E2EE + Signature ECDSA opérationnel !");
    } catch (err) {
        console.error("Erreur de dérivation :", err);
        appendSystemMessage("⚠️ Erreur lors de l'établissement du canal.");
    }
});

// 4. Envoi du message chiffré et signé
sendBtn.addEventListener('click', async () => {
    const text = messageInput.value.trim();
    if (!text || !currentSharedKey) return;

    messageCounter++;
    const payload = JSON.stringify({ text, counter: messageCounter, timestamp: Date.now() });
    const encoded = new TextEncoder().encode(payload);

    const signature = await window.crypto.subtle.sign(
        { name: "ECDSA", hash: { name: "SHA-256" } },
        myEcdsaKeyPair.privateKey,
        encoded
    );

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        currentSharedKey,
        encoded
    );

    socket.emit('send_message', {
        targetId: selectedTargetId,
        data: {
            ciphertext: Array.from(new Uint8Array(ciphertext)),
            iv: Array.from(iv),
            signature: Array.from(new Uint8Array(signature))
        }
    });

    appendMessage(`Moi : ${text}`, 'text-right text-green-400');
    messageInput.value = '';
});

// 5. Réception, déchiffrement et affichage du VRAI nom de l'expéditeur
socket.on('receive_message', async (packet) => {
    if (!currentSharedKey || !peerEcdsaPublicKey) return;

    try {
        // Extraction sécurisée des données du paquet et du nom de l'expéditeur
        const messageData = packet.data || packet;
        const { ciphertext, iv, signature } = messageData;
        const senderName = packet.senderName || "Correspondant";

        if (!ciphertext || !iv || !signature) {
            throw new Error("Paquet reçu incomplet (propriétés manquantes)");
        }

        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: new Uint8Array(iv) },
            currentSharedKey,
            new Uint8Array(ciphertext)
        );

        const isValid = await window.crypto.subtle.verify(
            { name: "ECDSA", hash: { name: "SHA-256" } },
            peerEcdsaPublicKey,
            new Uint8Array(signature),
            decryptedBuffer
        );

        if (!isValid) {
            appendSystemMessage("⚠️ ALERTE : Signature ECDSA invalide !");
            return;
        }

        const payload = JSON.parse(new TextDecoder().decode(decryptedBuffer));
        let lastCounter = receivedNonces.get(selectedTargetId) || 0;
        if (payload.counter <= lastCounter) {
            appendSystemMessage("⚠️ ALERTE : Attaque par rejeu détectée !");
            return;
        }
        receivedNonces.set(selectedTargetId, payload.counter);

        // Affichage dynamique du nom de l'expéditeur récupéré du serveur
        appendMessage(`${senderName} : ${payload.text}`, 'text-left text-blue-400');
    } catch (e) {
        console.error("Erreur de traitement :", e);
        appendSystemMessage("⚠️ Erreur de déchiffrement.");
    }
});

function appendMessage(text, className) {
    const div = document.createElement('div');
    div.textContent = text;
    div.className = className;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendSystemMessage(text) {
    const div = document.createElement('div');
    div.textContent = text;
    div.className = 'text-center text-xs text-yellow-400 italic my-1';
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}