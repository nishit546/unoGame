// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// --- Game State ---
let gameState = {
    players: [],
    deck: [],
    discardPile: [],
    currentPlayerIndex: 0,
    isGameRunning: false,
    direction: 1,
    currentColor: null
};

// --- Helper Functions ---
function createDeck() {
    const colors = ['red', 'yellow', 'green', 'blue'];
    const values = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];
    const wildCards = ['wild', 'wild_draw4'];
    let deck = [];

    for (const color of colors) {
        for (const value of values) {
            deck.push({ color, value });
            if (value !== '0') {
                deck.push({ color, value });
            }
        }
    }
    for (let i = 0; i < 4; i++) {
        deck.push({ color: 'wild', value: wildCards[0] });
        deck.push({ color: 'wild', value: wildCards[1] });
    }
    return deck;
}

function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function drawCards(player, amount) {
    for (let i = 0; i < amount; i++) {
        if (gameState.deck.length === 0) {
            const topCard = gameState.discardPile.pop();
            gameState.deck = shuffleDeck(gameState.discardPile);
            gameState.discardPile = [topCard];
            console.log("Deck reshuffled.");
        }
        if (gameState.deck.length > 0) {
            player.hand.push(gameState.deck.pop());
        }
    }
}

function startGame() {
    console.log("--- Starting Game ---");
    gameState.deck = shuffleDeck(createDeck());
    
    gameState.players.forEach(player => {
        drawCards(player, 7);
    });

    let firstCard = gameState.deck.pop();
    while (['skip', 'reverse', 'draw2', 'wild', 'wild_draw4'].includes(firstCard.value)) {
        gameState.deck.push(firstCard);
        firstCard = gameState.deck.pop();
    }
    gameState.discardPile.push(firstCard);
    gameState.currentColor = firstCard.color;
    
    gameState.isGameRunning = true;
    gameState.currentPlayerIndex = 0;

    console.log("Game started! Broadcasting to all players.");
    io.emit('gameStateUpdate', gameState);
}

function isMoveValid(card, topCard) {
    if (card.color === 'wild') return true;
    if (card.color === gameState.currentColor) return true;
    if (card.value === topCard.value) return true;
    return false;
}

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    socket.on('joinGame', ({ name }) => {
        if (gameState.isGameRunning) {
            socket.emit('error', { message: "Game is already in progress." });
            return;
        }
        if (gameState.players.find(p => p.id === socket.id)) return;
        const newPlayer = { id: socket.id, name: name, hand: [] };
        gameState.players.push(newPlayer);
        console.log(`${name} has joined the lobby. Total players: ${gameState.players.length}`);
        io.emit('gameStateUpdate', gameState);
    });
    
    socket.on('startGameRequest', () => {
        if (gameState.players.length >= 2 && !gameState.isGameRunning) {
            startGame();
        }
    });

    socket.on('playCard', ({ card, chosenColor }) => {
        if (!gameState.isGameRunning) return;
        const player = gameState.players[gameState.currentPlayerIndex];
        if (player.id !== socket.id) return;

        const topCard = gameState.discardPile[gameState.discardPile.length - 1];
        if (!isMoveValid(card, topCard)) {
            console.log(`Invalid move by ${player.name}`);
            return;
        }

        const cardIndex = player.hand.findIndex(c => c.color === card.color && c.value === card.value);
        if (cardIndex > -1) {
            player.hand.splice(cardIndex, 1);
            gameState.discardPile.push(card);
            gameState.currentColor = (card.color === 'wild') ? chosenColor : card.color;

            let turnIncrement = 1;
            const nextPlayerIndex = (gameState.currentPlayerIndex + gameState.direction + gameState.players.length) % gameState.players.length;
            const nextPlayer = gameState.players[nextPlayerIndex];

            switch (card.value) {
                case 'reverse':
                    gameState.direction *= -1;
                    break;
                case 'skip':
                    turnIncrement = 2;
                    break;
                case 'draw2':
                    drawCards(nextPlayer, 2);
                    turnIncrement = 2;
                    break;
                case 'wild_draw4':
                    drawCards(nextPlayer, 4);
                    turnIncrement = 2;
                    break;
            }
            
            if (player.hand.length === 0) {
                io.emit('gameOver', player.name);
                return;
            }
            
            gameState.currentPlayerIndex = (gameState.currentPlayerIndex + (turnIncrement * gameState.direction) + gameState.players.length) % gameState.players.length;
            io.emit('gameStateUpdate', gameState);
        }
    });
    
    socket.on('drawCard', () => {
        if (!gameState.isGameRunning) return;
        const player = gameState.players[gameState.currentPlayerIndex];
        if (player.id !== socket.id) return;
        drawCards(player, 1);
        gameState.currentPlayerIndex = (gameState.currentPlayerIndex + gameState.direction + gameState.players.length) % gameState.players.length;
        io.emit('gameStateUpdate', gameState);
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        const disconnectedPlayerIndex = gameState.players.findIndex(p => p.id === socket.id);
        if (disconnectedPlayerIndex !== -1) {
            gameState.players.splice(disconnectedPlayerIndex, 1);
            if (gameState.isGameRunning && gameState.players.length < 2) {
                gameState.isGameRunning = false;
                console.log("Not enough players, game stopped.");
            }
            io.emit('gameStateUpdate', gameState);
        }
    });
});

app.use(express.static('public'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));