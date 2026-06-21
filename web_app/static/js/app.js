// Chess Reinforcement Learning Dashboard Frontend JavaScript

const sessionId = Math.random().toString(36).substring(2, 15);
let currentBoardFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
let legalMoves = [];
let selectedSquare = null;
let boardFlipped = false;
let audioEnabled = true;
let isTrainingActive = false;
let trainingPollInterval = null;
let lossChart = null;
let gameMode = "human_vs_ai";
let isSpectating = false;
let spectatorTimer = null;
let checkSquare = null;

// Synthesized Audio Player
class ChessAudio {
    constructor() {
        this.ctx = null;
    }
    
    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }
    
    playMove() {
        this.init();
        if (!audioEnabled || !this.ctx) return;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.08);
        
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 0.08);
    }
    
    playCapture() {
        this.init();
        if (!audioEnabled || !this.ctx) return;
        
        const osc = this.ctx.createOscillator();
        const noise = this.ctx.createOscillator(); // High pitch click
        const gain = this.ctx.createGain();
        
        osc.connect(gain);
        noise.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.12);
        
        noise.type = 'sawtooth';
        noise.frequency.setValueAtTime(800, this.ctx.currentTime);
        noise.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.04);
        
        gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
        
        osc.start();
        noise.start();
        osc.stop(this.ctx.currentTime + 0.12);
        noise.stop(this.ctx.currentTime + 0.12);
    }
    
    playCheck() {
        this.init();
        if (!audioEnabled || !this.ctx) return;
        
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(520, this.ctx.currentTime);
        osc1.frequency.linearRampToValueAtTime(620, this.ctx.currentTime + 0.15);
        
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(780, this.ctx.currentTime);
        osc2.frequency.linearRampToValueAtTime(880, this.ctx.currentTime + 0.15);
        
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
        
        osc1.start();
        osc2.start();
        osc1.stop(this.ctx.currentTime + 0.2);
        osc2.stop(this.ctx.currentTime + 0.2);
    }
}

const sounds = new ChessAudio();

// Square coordinates helper (UCI indexing)
// a1 is 0, h8 is 63
const fileNames = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const rankNames = ['1', '2', '3', '4', '5', '6', '7', '8'];

function squareToUci(fileIdx, rankIdx) {
    return fileNames[fileIdx] + rankNames[rankIdx];
}

function uciToSquare(uci) {
    const file = fileNames.indexOf(uci[0]);
    const rank = rankNames.indexOf(uci[1]);
    return { file, rank, index: rank * 8 + file };
}

// FEN Parser
function parseFen(fen) {
    const parts = fen.split(" ");
    const boardPart = parts[0];
    const turn = parts[1];
    
    const rows = boardPart.split("/");
    const board = Array(64).fill(null);
    
    for (let r = 0; r < 8; r++) {
        let fileIdx = 0;
        const row = rows[7 - r]; // FEN starts at Rank 8, index 0 is Rank 1
        
        for (let c = 0; c < row.length; c++) {
            const char = row[c];
            if (isNaN(char)) {
                // Piece
                const isWhite = char === char.toUpperCase();
                const type = char.toUpperCase();
                board[r * 8 + fileIdx] = { type, color: isWhite ? 'w' : 'b', symbol: char };
                fileIdx++;
            } else {
                // Empty squares
                fileIdx += parseInt(char);
            }
        }
    }
    
    return { board, turn };
}

// Render Board
function renderBoard(boardId, fen, activeSquare = null, lastMove = null) {
    const container = document.getElementById(boardId);
    container.innerHTML = "";
    
    const { board, turn } = parseFen(fen);
    
    // Highlighting active player turn indicators
    if (boardId === "chess-board") {
        const playerWhiteEl = document.getElementById("player-white");
        const playerBlackEl = document.getElementById("player-black");
        if (playerWhiteEl && playerBlackEl) {
            if (turn === 'w') {
                playerWhiteEl.classList.add("active");
                playerBlackEl.classList.remove("active");
            } else {
                playerBlackEl.classList.add("active");
                playerWhiteEl.classList.remove("active");
            }
        }
    }
    
    // Grid generation (handle flipping)
    for (let displayRow = 0; displayRow < 8; displayRow++) {
        for (let displayCol = 0; displayCol < 8; displayCol++) {
            const r = boardFlipped ? displayRow : 7 - displayRow;
            const c = boardFlipped ? 7 - displayCol : displayCol;
            
            const squareIndex = r * 8 + c;
            const squareUci = squareToUci(c, r);
            const isLight = (r + c) % 2 !== 0; // standard layout light/dark squares
            
            const sqElement = document.createElement("div");
            sqElement.className = `square ${isLight ? 'light' : 'dark'}`;
            sqElement.dataset.uci = squareUci;
            sqElement.dataset.index = squareIndex;
            
            // Highlighting last move
            if (lastMove) {
                const lastMoveFrom = lastMove.slice(0, 2);
                const lastMoveTo = lastMove.slice(2, 4);
                if (squareUci === lastMoveFrom || squareUci === lastMoveTo) {
                    sqElement.classList.add("last-move");
                }
            }
            
            // Active selection
            if (activeSquare === squareUci) {
                sqElement.classList.add("selected");
            }
            
            // Highlight check square
            if (checkSquare === squareUci) {
                sqElement.classList.add("check");
            }
            
            // Piece placing
            const piece = board[squareIndex];
            if (piece) {
                const pieceElement = document.createElement("div");
                pieceElement.className = "piece";
                pieceElement.draggable = (boardId === "chess-board" && piece.color === 'w' && gameMode === "human_vs_ai");
                
                const img = document.createElement("img");
                img.src = `/assets/${piece.color}${piece.type}.png`;
                img.alt = piece.symbol;
                img.draggable = false;
                
                pieceElement.appendChild(img);
                sqElement.appendChild(pieceElement);
                
                // Click handler for selections
                if (boardId === "chess-board") {
                    pieceElement.addEventListener("click", (e) => {
                        e.stopPropagation();
                        handleSquareClick(squareUci);
                    });
                }
            } else {
                // Click handler on empty square
                if (boardId === "chess-board") {
                    sqElement.addEventListener("click", () => {
                        handleSquareClick(squareUci);
                    });
                }
            }
            
            // Drag-and-drop Events (Play Board only)
            if (boardId === "chess-board") {
                setupDragEvents(sqElement);
            }
            
            container.appendChild(sqElement);
        }
    }
    
    // Draw legal move indicators
    if (boardId === "chess-board" && activeSquare) {
        drawLegalHints(activeSquare);
    }
}

// Drag & Drop Setup
function setupDragEvents(squareEl) {
    squareEl.addEventListener("dragstart", (e) => {
        const piece = squareEl.querySelector(".piece");
        if (!piece) return;
        
        sounds.init();
        selectedSquare = squareEl.dataset.uci;
        renderBoard("chess-board", currentBoardFen, selectedSquare);
        e.dataTransfer.setData("text/plain", selectedSquare);
        e.dataTransfer.effectAllowed = "move";
    });
    
    squareEl.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    });
    
    squareEl.addEventListener("drop", (e) => {
        e.preventDefault();
        const fromUci = e.dataTransfer.getData("text/plain");
        const toUci = squareEl.dataset.uci;
        
        attemptMove(fromUci, toUci);
    });
}

// Draw Legal Hints
function drawLegalHints(fromUci) {
    const possibleMoves = legalMoves.filter(m => m.startsWith(fromUci));
    
    possibleMoves.forEach(move => {
        const toUci = move.slice(2, 4);
        const sqElement = document.querySelector(`#chess-board .square[data-uci="${toUci}"]`);
        if (sqElement) {
            const hasPiece = sqElement.querySelector(".piece") !== null;
            const hint = document.createElement("div");
            hint.className = `legal-hint ${hasPiece ? 'capture' : ''}`;
            sqElement.appendChild(hint);
            
            // Allow click to complete move on hint
            hint.addEventListener("click", (e) => {
                e.stopPropagation();
                attemptMove(fromUci, toUci);
            });
        }
    });
}

// Click selection logic
function handleSquareClick(uci) {
    if (gameMode === "ai_vs_ai") return;
    sounds.init();
    const { board } = parseFen(currentBoardFen);
    const sqIndex = uciToSquare(uci).index;
    const clickedPiece = board[sqIndex];
    
    if (selectedSquare === null) {
        // First selection (must be white piece)
        if (clickedPiece && clickedPiece.color === 'w') {
            selectedSquare = uci;
            renderBoard("chess-board", currentBoardFen, selectedSquare);
        }
    } else {
        // Second click
        const move = selectedSquare + uci;
        const possibleMoves = legalMoves.filter(m => m.startsWith(selectedSquare));
        const matchingMove = possibleMoves.find(m => m.startsWith(move));
        
        if (matchingMove) {
            attemptMove(selectedSquare, uci);
        } else {
            // Deselect or choose other white piece
            if (clickedPiece && clickedPiece.color === 'w') {
                selectedSquare = uci;
                renderBoard("chess-board", currentBoardFen, selectedSquare);
            } else {
                selectedSquare = null;
                renderBoard("chess-board", currentBoardFen);
            }
        }
    }
}

// API: Start Game
async function startNewGame() {
    if (isSpectating) {
        pauseSpectating();
    }

    const opponent = document.getElementById("opponent-select").value;
    const difficulty = document.getElementById("difficulty-select").value;
    const mode = document.getElementById("mode-select").value;
    const whiteAgent = document.getElementById("white-agent-select").value;
    const blackAgent = document.getElementById("black-agent-select").value;
    
    gameMode = mode;
    updateMatchModeUI();
    updatePlayerLabels();
    
    try {
        const response = await fetch("/api/new-game", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: sessionId,
                opponent: opponent,
                difficulty: difficulty,
                mode: mode,
                white_agent: whiteAgent,
                black_agent: blackAgent
            })
        });
        
        const data = await response.json();
        if (data.status === "success") {
            currentBoardFen = data.fen;
            legalMoves = data.legal_moves;
            selectedSquare = null;
            checkSquare = data.check_square || null;
            updateAlertBanner(data.is_check, data.status, null);
            renderBoard("chess-board", currentBoardFen);
            document.getElementById("btn-undo").disabled = true;
            resetTelemetry();
            
            if (gameMode === "ai_vs_ai") {
                document.getElementById("btn-play-spectator").classList.remove("hidden");
                document.getElementById("btn-pause-spectator").classList.add("hidden");
            }
        }
    } catch (e) {
        console.error("Error starting new game:", e);
    }
}

function updateMatchModeUI() {
    const btnUndo = document.getElementById("btn-undo");
    const btnResign = document.getElementById("btn-resign");
    const btnPlay = document.getElementById("btn-play-spectator");
    const btnPause = document.getElementById("btn-pause-spectator");
    
    const groupHuman = document.getElementById("group-human-config");
    const groupSpectator = document.getElementById("group-spectator-config");
    
    if (gameMode === "human_vs_ai") {
        btnUndo.classList.remove("hidden");
        btnResign.classList.remove("hidden");
        btnPlay.classList.add("hidden");
        btnPause.classList.add("hidden");
        groupHuman.classList.remove("hidden");
        groupSpectator.classList.add("hidden");
    } else {
        btnUndo.classList.add("hidden");
        btnResign.classList.add("hidden");
        btnPlay.classList.remove("hidden");
        btnPause.classList.add("hidden");
        groupHuman.classList.add("hidden");
        groupSpectator.classList.remove("hidden");
    }
}

function startSpectating() {
    sounds.init();
    isSpectating = true;
    document.getElementById("btn-play-spectator").classList.add("hidden");
    document.getElementById("btn-pause-spectator").classList.remove("hidden");
    logConsole("AI vs AI Spectator Match Started.");
    stepSpectator();
}

function pauseSpectating() {
    isSpectating = false;
    document.getElementById("btn-play-spectator").classList.remove("hidden");
    document.getElementById("btn-pause-spectator").classList.add("hidden");
    if (spectatorTimer) {
        clearTimeout(spectatorTimer);
        spectatorTimer = null;
    }
    logConsole("AI vs AI Spectator Match Paused.");
}

async function stepSpectator() {
    if (!isSpectating) return;
    
    try {
        const response = await fetch("/api/spectator-move", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: sessionId
            })
        });
        
        const data = await response.json();
        
        if (data.status === "success" || data.status === "game_over") {
            currentBoardFen = data.fen;
            legalMoves = data.legal_moves || [];
            checkSquare = data.check_square || null;
            updateAlertBanner(data.is_check, data.status, data.reason);
            
            // Render board showing the move
            renderBoard("chess-board", currentBoardFen, null, data.ai_move);
            
            // Play sound
            if (data.ai_move) {
                if (data.ai_move.includes("x") || data.fen.includes("x")) {
                    sounds.playCapture();
                } else {
                    sounds.playMove();
                }
                logConsole(`${data.active_color.toUpperCase()} (${data.active_agent.toUpperCase()}) played: ${data.ai_move}`);
            }
            
            // Telemetry update
            if (data.stats) {
                updateTelemetry(data.stats);
            }
            
            if (data.status === "game_over") {
                sounds.playCheck();
                isSpectating = false;
                document.getElementById("btn-play-spectator").classList.add("hidden");
                document.getElementById("btn-pause-spectator").classList.add("hidden");
                setTimeout(() => showGameOver(data.result, data.reason), 200);
            } else if (isSpectating) {
                spectatorTimer = setTimeout(stepSpectator, 1000);
            }
        } else {
            pauseSpectating();
        }
    } catch (e) {
        console.error("Error in spectator step:", e);
        pauseSpectating();
    }
}

// API: Attempt Move
async function attemptMove(fromUci, toUci) {
    const baseMove = fromUci + toUci;
    // Check if move is legal
    const matchedMove = legalMoves.find(m => m.startsWith(baseMove));
    
    if (!matchedMove) {
        selectedSquare = null;
        renderBoard("chess-board", currentBoardFen);
        return;
    }
    
    // Play move immediately for visual responsiveness
    const { board } = parseFen(currentBoardFen);
    const fromIndex = uciToSquare(fromUci).index;
    const toIndex = uciToSquare(toUci).index;
    const isCapture = board[toIndex] !== null;
    
    if (isCapture) {
        sounds.playCapture();
    } else {
        sounds.playMove();
    }
    
    selectedSquare = null;
    
    // API Call
    try {
        const response = await fetch("/api/make-move", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: sessionId,
                move: matchedMove
            })
        });
        
        const data = await response.json();
        
        if (data.status === "success" || data.status === "game_over") {
            currentBoardFen = data.fen;
            legalMoves = data.legal_moves || [];
            checkSquare = data.check_square || null;
            updateAlertBanner(data.is_check, data.status, data.reason);
            
            // Render board showing AI's move
            renderBoard("chess-board", currentBoardFen, null, data.ai_move);
            document.getElementById("btn-undo").disabled = false;
            
            // Play sound for AI response
            if (data.ai_move) {
                // Simple heuristic check if capture
                if (data.ai_move.includes("x") || data.fen.includes("x")) { // custom
                    sounds.playCapture();
                } else {
                    sounds.playMove();
                }
            }
            
            // Display metrics
            if (data.stats) {
                updateTelemetry(data.stats);
            }
            
            if (data.status === "game_over") {
                sounds.playCheck();
                setTimeout(() => showGameOver(data.result, data.reason), 200);
            }
        } else {
            // Restore fen if error
            renderBoard("chess-board", currentBoardFen);
        }
    } catch (e) {
        console.error("Error making move:", e);
        renderBoard("chess-board", currentBoardFen);
    }
}

// API: Undo
async function handleUndo() {
    try {
        const response = await fetch("/api/undo-move", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: sessionId,
                move: ""
            })
        });
        const data = await response.json();
        if (data.status === "success") {
            currentBoardFen = data.fen;
            legalMoves = data.legal_moves;
            selectedSquare = null;
            checkSquare = data.check_square || null;
            updateAlertBanner(data.is_check, data.status, null);
            renderBoard("chess-board", currentBoardFen);
            if (data.undone_plies === 1 || data.fen === "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") {
                document.getElementById("btn-undo").disabled = true;
            }
            sounds.playMove();
        }
    } catch (e) {
        console.error("Error undoing move:", e);
    }
}

// Update player text labels dynamically based on game mode
function updatePlayerLabels() {
    const whiteNameEl = document.getElementById("player-white-name");
    const blackNameEl = document.getElementById("player-black-name");
    if (!whiteNameEl || !blackNameEl) return;
    
    if (gameMode === "human_vs_ai") {
        const opponent = document.getElementById("opponent-select").value.toUpperCase();
        whiteNameEl.innerText = "White (You)";
        blackNameEl.innerText = `Black (AI: ${opponent})`;
    } else {
        const whiteAgent = document.getElementById("white-agent-select").value.toUpperCase();
        const blackAgent = document.getElementById("black-agent-select").value.toUpperCase();
        whiteNameEl.innerText = `White (AI: ${whiteAgent})`;
        blackNameEl.innerText = `Black (AI: ${blackAgent})`;
    }
}

// Update check alert banner
function updateAlertBanner(isCheck, status, reason) {
    const banner = document.getElementById("alert-banner");
    if (!banner) return;
    
    if (status === "game_over") {
        banner.innerText = reason || "Game Over";
        banner.classList.remove("hidden");
    } else if (isCheck) {
        banner.innerText = "Check!";
        banner.classList.remove("hidden");
    } else {
        banner.classList.add("hidden");
    }
}

// Display game over glass overlay modal
function showGameOver(result, reason) {
    const overlay = document.getElementById("game-over-overlay");
    const titleEl = document.getElementById("game-over-title");
    const resultEl = document.getElementById("game-over-result");
    const reasonEl = document.getElementById("game-over-reason");
    if (!overlay) return;
    
    let resultText = "";
    if (result === "1-0") {
        resultText = "White Wins (1-0)";
    } else if (result === "0-1") {
        resultText = "Black Wins (0-1)";
    } else if (result === "1/2-1/2") {
        resultText = "Draw (1/2-1/2)";
    } else {
        resultText = result || "Match Terminated";
    }
    
    const iconEl = overlay.querySelector(".overlay-icon");
    if (result === "1/2-1/2") {
        if (iconEl) iconEl.innerText = "🤝";
        if (titleEl) titleEl.innerText = "Game Drawn";
    } else {
        if (iconEl) iconEl.innerText = "🏆";
        if (titleEl) titleEl.innerText = "Game Over";
    }
    
    if (resultEl) resultEl.innerText = resultText;
    if (reasonEl) reasonEl.innerText = reason || "End of Match";
    overlay.classList.remove("hidden");
}

// Update Evaluation/Telemetry Panel
function updateTelemetry(stats) {
    document.getElementById("telemetry-time").innerText = `${stats.time || 0}s`;
    document.getElementById("telemetry-depth").innerText = stats.depth || 0;
    document.getElementById("telemetry-nodes").innerText = stats.nodes || 0;
    
    const score = stats.score !== undefined ? stats.score : 0;
    document.getElementById("telemetry-score").innerText = score.toFixed(2);
    
    // Map score [-5.0, 5.0] to evaluation bar [0%, 100%]
    const cleanScore = Math.max(-5, Math.min(5, score));
    const percent = ((cleanScore + 5) / 10) * 100;
    document.getElementById("eval-bar-fill").style.width = `${percent}%`;
}

function resetTelemetry() {
    document.getElementById("telemetry-time").innerText = "0.00s";
    document.getElementById("telemetry-depth").innerText = "0";
    document.getElementById("telemetry-nodes").innerText = "0";
    document.getElementById("telemetry-score").innerText = "0.00";
    document.getElementById("eval-bar-fill").style.width = "50%";
}

// --- TRAINING INTERACTION ---

// Initialize Chart.js
function initLossChart() {
    const ctx = document.getElementById('lossChart').getContext('2d');
    lossChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Total Loss',
                    borderColor: '#00f0ff',
                    borderWidth: 2,
                    data: [],
                    fill: false,
                    tension: 0.15
                },
                {
                    label: 'Policy Loss',
                    borderColor: '#b300ff',
                    borderWidth: 1,
                    data: [],
                    fill: false,
                    tension: 0.15
                },
                {
                    label: 'Value Loss',
                    borderColor: '#00e676',
                    borderWidth: 1,
                    data: [],
                    fill: false,
                    tension: 0.15
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#90a0b8', font: { size: 9 } },
                    position: 'top'
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#64748b', font: { size: 8 } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#64748b', font: { size: 8 } }
                }
            }
        }
    });
}

// API: Start Training
async function startTraining() {
    const sims = parseInt(document.getElementById("train-sims").value) || 20;
    const games = parseInt(document.getElementById("train-games").value) || 10;
    const lr = parseFloat(document.getElementById("train-lr").value) || 0.001;
    const batch = parseInt(document.getElementById("train-batch").value) || 32;
    
    try {
        const response = await fetch("/api/train/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                simulations: sims,
                games_total: games,
                learning_rate: lr,
                batch_size: batch
            })
        });
        
        const data = await response.json();
        if (data.status === "success") {
            isTrainingActive = true;
            toggleTrainingUI(true);
            startPollingStatus();
        } else {
            alert(data.message);
        }
    } catch (e) {
        console.error("Error starting training:", e);
    }
}

// API: Stop Training
async function stopTraining() {
    try {
        const response = await fetch("/api/train/stop", {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });
        const data = await response.json();
        if (data.status === "success") {
            logConsole("Stopping training gracefully... Waiting for active game to finish.");
        }
    } catch (e) {
        console.error("Error stopping training:", e);
    }
}

// Telemetry Poller
function startPollingStatus() {
    if (trainingPollInterval) clearInterval(trainingPollInterval);
    
    trainingPollInterval = setInterval(async () => {
        try {
            const response = await fetch("/api/train/status");
            const data = await response.json();
            
            updateTrainingStats(data);
            
            if (!data.is_running) {
                isTrainingActive = false;
                toggleTrainingUI(false);
                clearInterval(trainingPollInterval);
            }
        } catch (e) {
            console.error("Error polling training status:", e);
        }
    }, 1000);
}

function updateTrainingStats(data) {
    document.getElementById("train-iter").innerText = data.iteration || "1";
    document.getElementById("train-game").innerText = `${data.game_index || 0} / ${data.games_total}`;
    document.getElementById("train-moves").innerText = data.move_index || "0";
    document.getElementById("train-wld").innerText = `${data.white_wins} / ${data.black_wins} / ${data.draws}`;
    
    // Live Board update
    if (data.current_fen) {
        renderBoard("mini-board", data.current_fen);
    }
    
    // Loss chart update
    if (data.loss_history && data.loss_history.length > 0 && lossChart) {
        const labels = data.loss_history.map(h => `Iter ${h.iteration}`);
        const totalLoss = data.loss_history.map(h => h.total_loss);
        const policyLoss = data.loss_history.map(h => h.policy_loss);
        const valueLoss = data.loss_history.map(h => h.value_loss);
        
        lossChart.data.labels = labels;
        lossChart.data.datasets[0].data = totalLoss;
        lossChart.data.datasets[1].data = policyLoss;
        lossChart.data.datasets[2].data = valueLoss;
        lossChart.update();
    }
    
    // Logs console update
    if (data.logs && data.logs.length > 0) {
        const consoleEl = document.getElementById("console-log");
        consoleEl.innerHTML = "";
        data.logs.forEach(log => {
            const row = document.createElement("div");
            row.innerText = log;
            consoleEl.appendChild(row);
        });
        consoleEl.scrollTop = consoleEl.scrollHeight;
    }
}

function toggleTrainingUI(running) {
    const badge = document.getElementById("train-status-badge");
    const startBtn = document.getElementById("btn-start-train");
    const stopBtn = document.getElementById("btn-stop-train");
    const dashboard = document.getElementById("training-dashboard");
    
    if (running) {
        badge.innerText = "ACTIVE";
        badge.className = "badge badge-active";
        startBtn.classList.add("hidden");
        stopBtn.classList.remove("hidden");
        dashboard.classList.remove("hidden");
        if (!lossChart) initLossChart();
    } else {
        badge.innerText = "OFFLINE";
        badge.className = "badge badge-inactive";
        startBtn.classList.remove("hidden");
        stopBtn.classList.add("hidden");
    }
}

function logConsole(msg) {
    const consoleEl = document.getElementById("console-log");
    const emptySpan = consoleEl.querySelector(".console-empty");
    if (emptySpan) emptySpan.remove();
    
    const row = document.createElement("div");
    row.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    consoleEl.appendChild(row);
    consoleEl.scrollTop = consoleEl.scrollHeight;
}

// Bind Button Elements
document.addEventListener("DOMContentLoaded", () => {
    // Start game initially
    startNewGame();
    
    // Tab switching handlers
    const tabArena = document.getElementById("tab-arena");
    const tabTraining = document.getElementById("tab-training");
    const mainContent = document.getElementById("main-content");

    tabArena.addEventListener("click", () => {
        tabArena.classList.add("active");
        tabTraining.classList.remove("active");
        mainContent.className = "dashboard-grid view-arena";
    });

    tabTraining.addEventListener("click", () => {
        tabTraining.classList.add("active");
        tabArena.classList.remove("active");
        mainContent.className = "dashboard-grid view-training";
        
        // Pause active spectator matches if switching to training dashboard
        if (isSpectating) {
            pauseSpectating();
        }
        
        // Resize and redraw loss chart once container is visible
        if (lossChart) {
            setTimeout(() => {
                lossChart.resize();
                lossChart.update();
            }, 50);
        }
    });
    
    // Bind buttons
    document.getElementById("btn-new-game").addEventListener("click", startNewGame);
    document.getElementById("btn-undo").addEventListener("click", handleUndo);
    
    document.getElementById("btn-play-spectator").addEventListener("click", startSpectating);
    document.getElementById("btn-pause-spectator").addEventListener("click", pauseSpectating);
    
    document.getElementById("mode-select").addEventListener("change", () => {
        startNewGame();
    });
    
    document.getElementById("btn-resign").addEventListener("click", () => {
        sounds.playCheck();
        if (isSpectating) {
            pauseSpectating();
        }
        if (gameMode === "human_vs_ai") {
            showGameOver("0-1", "Resigned");
        } else {
            showGameOver("1/2-1/2", "Spectator match terminated");
        }
    });
    
    document.getElementById("btn-close-overlay").addEventListener("click", () => {
        document.getElementById("game-over-overlay").classList.add("hidden");
        startNewGame();
    });
    
    document.getElementById("opponent-select").addEventListener("change", updatePlayerLabels);
    document.getElementById("white-agent-select").addEventListener("change", updatePlayerLabels);
    document.getElementById("black-agent-select").addEventListener("change", updatePlayerLabels);
    
    document.getElementById("btn-sound-toggle").addEventListener("click", (e) => {
        audioEnabled = !audioEnabled;
        const btn = document.getElementById("btn-sound-toggle");
        if (audioEnabled) {
            btn.classList.add("active");
            btn.innerHTML = '<span class="icon">🔊</span>';
        } else {
            btn.classList.remove("active");
            btn.innerHTML = '<span class="icon">🔇</span>';
        }
    });
    
    document.getElementById("btn-theme-toggle").addEventListener("click", () => {
        boardFlipped = !boardFlipped;
        renderBoard("chess-board", currentBoardFen);
    });
    
    document.getElementById("btn-start-train").addEventListener("click", startTraining);
    document.getElementById("btn-stop-train").addEventListener("click", stopTraining);
    
    document.getElementById("btn-clear-console").addEventListener("click", () => {
        document.getElementById("console-log").innerHTML = '<span class="console-empty">Logs cleared. Ready...</span>';
    });
    
    // Auto start polling status if page loads and training is running
    fetch("/api/train/status")
        .then(res => res.json())
        .then(data => {
            if (data.is_running) {
                isTrainingActive = true;
                toggleTrainingUI(true);
                startPollingStatus();
            }
        });
});
