// public/client.js
const socket = io();

// --- Get DOM Elements ---
const loginScreen = document.getElementById('login-screen');
const gameScreen = document.getElementById('game-screen');
const nameInput = document.getElementById('name-input');
const joinBtn = document.getElementById('join-btn');
const opponentsArea = document.getElementById('opponents-area');
const discardPile = document.getElementById('discard-pile');
const turnIndicator = document.getElementById('turn-indicator');
const playerNameDisplay = document.getElementById('player-name-display');
const playerHandDiv = document.getElementById('player-hand');
const drawPile = document.getElementById('draw-pile');
const unoBtn = document.getElementById('uno-btn');
const startGameBtn = document.getElementById('start-game-btn');
const winnerOverlay = document.getElementById('winner-overlay');
const winnerNameEl = document.getElementById('winner-name');

let myPlayerId = null;

// --- Event Listeners ---
joinBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (name) {
        loginScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        socket.emit('joinGame', { name });
    }
});

drawPile.addEventListener('click', () => {
    socket.emit('drawCard');
});

startGameBtn.addEventListener('click', () => {
    socket.emit('startGameRequest');
});

// --- Socket Handlers ---
socket.on('connect', () => {
    myPlayerId = socket.id;
    console.log("Connected to server with ID:", myPlayerId);
});

socket.on('gameStateUpdate', (gameState) => {
    renderGame(gameState);
});

socket.on('gameOver', (winnerName) => {
    winnerNameEl.textContent = winnerName;
    winnerOverlay.classList.remove('hidden');
});

// --- RENDER FUNCTIONS ---
function createCardElement(card, isPlayerHandCard) {
    const cardEl = document.createElement('div');
    cardEl.className = `card ${card.color}`;
    cardEl.textContent = card.value.startsWith('wild') ? '' : card.value;
    if (card.value === 'wild_draw4') cardEl.textContent = '+4';
    if (card.value === 'wild') cardEl.textContent = 'W';

    if (isPlayerHandCard) {
        cardEl.addEventListener('click', () => {
            let payload = { card };
            if (card.color === 'wild') {
                const chosenColor = prompt("Choose a color: red, yellow, green, or blue").toLowerCase();
                if (['red', 'yellow', 'green', 'blue'].includes(chosenColor)) {
                    payload.chosenColor = chosenColor;
                } else {
                    alert("Invalid color. Please try again.");
                    return;
                }
            }
            socket.emit('playCard', payload);
        });
    }
    return cardEl;
}

function renderGame(gameState) {
    const me = gameState.players.find(p => p.id === myPlayerId);
    if (!me) {
        playerNameDisplay.textContent = "Waiting to Join...";
        return;
    }

    // THIS IS THE LOGIC THAT SHOWS THE BUTTON
    const isHost = gameState.players[0] && gameState.players[0].id === myPlayerId;
    if (!gameState.isGameRunning && isHost && gameState.players.length >= 2) {
        startGameBtn.classList.remove('hidden');
    } else {
        startGameBtn.classList.add('hidden');
    }

    playerHandDiv.innerHTML = '';
    me.hand.forEach(card => {
        playerHandDiv.appendChild(createCardElement(card, true));
    });
    playerNameDisplay.textContent = `${me.name} (${me.hand.length} cards)`;

    unoBtn.disabled = me.hand.length !== 1;

    opponentsArea.innerHTML = '';
    gameState.players.forEach(player => {
        if (player.id !== myPlayerId) {
            const opponentDiv = document.createElement('div');
            opponentDiv.className = 'opponent';
            opponentDiv.innerHTML = `<h3>${player.name}</h3><p>${player.hand.length > 0 ? player.hand.length + ' cards' : 'In Lobby'}</p>`;
            opponentsArea.appendChild(opponentDiv);
        }
    });

    discardPile.innerHTML = '';
    const topCard = gameState.discardPile[gameState.discardPile.length - 1];
    if (topCard) {
        const topCardEl = createCardElement(topCard, false);
        discardPile.appendChild(topCardEl);
        discardPile.style.borderColor = gameState.currentColor;
    }

    if (gameState.isGameRunning) {
        const currentPlayer = gameState.players[gameState.currentPlayerIndex];
        turnIndicator.textContent = `Current Color: ${gameState.currentColor.toUpperCase()} | It's ${currentPlayer.name}'s turn`;
        document.body.style.boxShadow = (currentPlayer.id === myPlayerId) ? 'inset 0 0 20px 10px #ffaa00' : 'none';
    } else {
        turnIndicator.textContent = "Waiting for the host to start the game...";
    }
}