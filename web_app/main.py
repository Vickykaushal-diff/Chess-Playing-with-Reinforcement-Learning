import sys
import os
import time
import math
import random
import threading
import traceback
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
import chess
import numpy as np
import torch
import torch.optim as optim
import torch.nn.functional as F

# Add parent directory to path so we can import root modules
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(root_dir)

from model import ChessNet
from mcts import MCTS
from utils import board_to_tensor, encode_move
from nnue_alpha_beta.engine import NNUEEngine

app = FastAPI(title="Chess Reinforcement Learning Web App")

# Global game session storage
class GameSession:
    def __init__(self, opponent: str = "minimax", difficulty: str = "medium", mode: str = "human_vs_ai", white_agent: str = "minimax", black_agent: str = "nnue"):
        self.board = chess.Board()
        self.opponent = opponent
        self.difficulty = difficulty
        self.mode = mode
        self.white_agent = white_agent
        self.black_agent = black_agent
        self.history: List[str] = [] # FEN history for undoing moves
        self.engine_info: Dict[str, Any] = {}

ACTIVE_GAMES: Dict[str, GameSession] = {}

# PIECE-SQUARE TABLES (from White's perspective)
# High values encourage placement on those squares.
PAWN_PST = [
    0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0
]

KNIGHT_PST = [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50
]

BISHOP_PST = [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20
]

ROOK_PST = [
      0,  0,  0,  0,  0,  0,  0,  0,
      5, 10, 10, 10, 10, 10, 10,  5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
      0,  0,  0,  5,  5,  0,  0,  0
]

QUEEN_PST = [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  5,-10,
    -10,  0,  5,  0,  0,  5,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20
]

KING_MIDDLE_PST = [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20
]

class MinimaxEngine:
    """A highly efficient minimax engine with alpha-beta pruning and PST evaluation."""
    def __init__(self):
        self.nodes_visited = 0

    def evaluate_board(self, board: chess.Board) -> int:
        """Returns the evaluation of the board in centipawns (from White's perspective)."""
        if board.is_checkmate():
            return -99999 if board.turn == chess.WHITE else 99999
        if board.is_game_over():
            return 0 # Draw

        score = 0
        
        # Piece values
        piece_values = {
            chess.PAWN: 100,
            chess.KNIGHT: 320,
            chess.BISHOP: 330,
            chess.ROOK: 500,
            chess.QUEEN: 900,
            chess.KING: 20000
        }

        # Piece-square mappings
        pst_mappings = {
            chess.PAWN: PAWN_PST,
            chess.KNIGHT: KNIGHT_PST,
            chess.BISHOP: BISHOP_PST,
            chess.ROOK: ROOK_PST,
            chess.QUEEN: QUEEN_PST,
            chess.KING: KING_MIDDLE_PST
        }

        for square in chess.SQUARES:
            piece = board.piece_at(square)
            if piece:
                val = piece_values.get(piece.piece_type, 0)
                
                # PST adjustment: flip square for Black
                pst_idx = square
                if piece.color == chess.BLACK:
                    pst_idx = chess.square_mirror(square)
                
                pst_val = pst_mappings.get(piece.piece_type, [0]*64)[pst_idx]
                
                if piece.color == chess.WHITE:
                    score += val + pst_val
                else:
                    score -= (val + pst_val)
                    
        return score

    def search(self, board: chess.Board, depth: int) -> chess.Move:
        self.nodes_visited = 0
        best_score = -float('inf') if board.turn == chess.WHITE else float('inf')
        best_move = None
        
        # Move sorting: captures first
        moves = list(board.legal_moves)
        moves.sort(key=lambda m: board.is_capture(m), reverse=True)
        
        alpha = -float('inf')
        beta = float('inf')
        
        for move in moves:
            board.push(move)
            self.nodes_visited += 1
            score = self.minimax(board, depth - 1, alpha, beta, not board.turn)
            board.pop()
            
            if board.turn == chess.WHITE:
                if score > best_score:
                    best_score = score
                    best_move = move
                alpha = max(alpha, score)
            else:
                if score < best_score:
                    best_score = score
                    best_move = move
                beta = min(beta, score)
                
        return best_move

    def minimax(self, board: chess.Board, depth: int, alpha: float, beta: float, is_maximizing: bool) -> int:
        if depth == 0 or board.is_game_over():
            return self.evaluate_board(board)
            
        moves = list(board.legal_moves)
        moves.sort(key=lambda m: board.is_capture(m), reverse=True)
        
        if is_maximizing:
            max_eval = -float('inf')
            for move in moves:
                board.push(move)
                self.nodes_visited += 1
                evaluation = self.minimax(board, depth - 1, alpha, beta, False)
                board.pop()
                max_eval = max(max_eval, evaluation)
                alpha = max(alpha, evaluation)
                if beta <= alpha:
                    break
            return max_eval
        else:
            min_eval = float('inf')
            for move in moves:
                board.push(move)
                self.nodes_visited += 1
                evaluation = self.minimax(board, depth - 1, alpha, beta, True)
                board.pop()
                min_eval = min(min_eval, evaluation)
                beta = min(beta, evaluation)
                if beta <= alpha:
                    break
            return min_eval

# Training telemetry storage
class TrainingTelemetry:
    def __init__(self):
        self.is_running = False
        self.lock = threading.Lock()
        self.thread: Optional[threading.Thread] = None
        self.current_fen = chess.STARTING_FEN
        self.iteration = 0
        self.game_index = 0
        self.move_index = 0
        self.games_total = 0
        self.logs: List[str] = []
        self.loss_history: List[Dict[str, Any]] = []
        self.white_wins = 0
        self.black_wins = 0
        self.draws = 0
        self.simulations = 50
        self.learning_rate = 0.001
        self.batch_size = 64
        self.stop_signal = False

TRAINING_STATUS = TrainingTelemetry()

# Custom helper to log trainer output
def log_training_message(msg: str):
    with TRAINING_STATUS.lock:
        timestamp = time.strftime("%H:%M:%S")
        formatted = f"[{timestamp}] {msg}"
        TRAINING_STATUS.logs.append(formatted)
        if len(TRAINING_STATUS.logs) > 300: # Limit log size
            TRAINING_STATUS.logs.pop(0)
        print(msg)

def training_worker():
    global TRAINING_STATUS
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    log_training_message(f"Training thread started on device: {device}")
    
    try:
        # Hyperparameters
        sims = TRAINING_STATUS.simulations
        games_total = TRAINING_STATUS.games_total
        lr = TRAINING_STATUS.learning_rate
        bs = TRAINING_STATUS.batch_size
        
        # Load or initialize model
        model = ChessNet().to(device)
        model_path = os.path.join(root_dir, "best_model.pth")
        if os.path.exists(model_path):
            try:
                model.load_state_dict(torch.load(model_path, map_location=device, weights_only=True))
                log_training_message("Loaded existing best_model.pth to resume training.")
            except Exception as e:
                log_training_message(f"Failed to load best_model.pth ({e}). Starting fresh.")
        else:
            log_training_message("Starting training from scratch (no best_model.pth found).")

        optimizer = optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)
        mcts = MCTS(model, device)
        
        # We run iterations until stopped or target games achieved
        iteration = 0
        while not TRAINING_STATUS.stop_signal:
            iteration += 1
            TRAINING_STATUS.iteration = iteration
            log_training_message(f"--- Starting Iteration {iteration} ---")
            
            # 1. Self-Play Episode Collection
            examples = []
            
            for g in range(games_total):
                if TRAINING_STATUS.stop_signal:
                    break
                    
                TRAINING_STATUS.game_index = g + 1
                board = chess.Board()
                episode_data = []
                
                log_training_message(f"Starting Game {g+1}/{games_total}")
                
                while not board.is_game_over() and not TRAINING_STATUS.stop_signal:
                    TRAINING_STATUS.current_fen = board.fen()
                    TRAINING_STATUS.move_index = len(board.move_stack) + 1
                    
                    # Run search
                    root = mcts.search(board, simulations=sims)
                    
                    # Explore initially, then play deterministic
                    temp = 1.0 if len(board.move_stack) < 20 else 0.1
                    moves, probs = mcts.get_action_probs(root, temperature=temp)
                    
                    if not moves:
                        log_training_message("AI resigned during self-play (no MCTS moves).")
                        break
                        
                    # Save position data
                    policy_dict = {m: p for m, p in zip(moves, probs)}
                    state_tensor = board_to_tensor(board)
                    episode_data.append([state_tensor, policy_dict, None])
                    
                    # Pick move according to probabilities
                    choice_idx = np.random.choice(len(moves), p=probs)
                    best_move_idx = moves[choice_idx]
                    
                    # Find and push move
                    found_move = None
                    for m in board.legal_moves:
                        if encode_move(m) == best_move_idx:
                            found_move = m
                            break
                    
                    if found_move:
                        board.push(found_move)
                    else:
                        break
                        
                    # Slow down training self-play moves slightly so user can watch board stream comfortably
                    time.sleep(0.1)
                
                # Check results
                result = board.result()
                reward = 0
                if result == '1-0':
                    reward = 1
                    TRAINING_STATUS.white_wins += 1
                    log_training_message(f"Game {g+1} complete: White Wins (1-0)")
                elif result == '0-1':
                    reward = -1
                    TRAINING_STATUS.black_wins += 1
                    log_training_message(f"Game {g+1} complete: Black Wins (0-1)")
                else:
                    TRAINING_STATUS.draws += 1
                    log_training_message(f"Game {g+1} complete: Draw (1/2-1/2)")
                
                # Backfill rewards
                for i, ex in enumerate(episode_data):
                    perspective = 1 if (i % 2 == 0) else -1
                    ex[2] = reward * perspective
                    examples.extend([ex])
                    
            if TRAINING_STATUS.stop_signal:
                break
                
            # 2. Train Model
            log_training_message(f"Collected {len(examples)} positions. Starting optimizer...")
            
            # Simple manual DataLoader loop to avoid thread conflict
            # Shuffle examples
            random.shuffle(examples)
            
            model.train()
            total_loss = 0
            policy_losses = []
            value_losses = []
            
            num_batches = int(np.ceil(len(examples) / bs))
            
            for b in range(num_batches):
                if TRAINING_STATUS.stop_signal:
                    break
                
                batch = examples[b*bs : (b+1)*bs]
                if len(batch) == 0:
                    continue
                
                # Stack batch tensors
                states = torch.from_numpy(np.stack([x[0] for x in batch])).to(device)
                
                # Create policy targets
                policy_targets = np.zeros((len(batch), 4096), dtype=np.float32)
                for i, x in enumerate(batch):
                    for move_idx, prob in x[1].items():
                        if move_idx < 4096:
                            policy_targets[i, move_idx] = prob
                policy_targets = torch.from_numpy(policy_targets).to(device)
                
                # Create value targets
                value_targets = torch.tensor([x[2] for x in batch], dtype=torch.float32).view(-1, 1).to(device)
                
                optimizer.zero_grad()
                p_out, v_out = model(states)
                
                v_loss = F.mse_loss(v_out, value_targets)
                log_probs = F.log_softmax(p_out, dim=1)
                p_loss = -torch.sum(policy_targets * log_probs) / states.size(0)
                
                loss = v_loss + p_loss
                loss.backward()
                optimizer.step()
                
                total_loss += loss.item()
                policy_losses.append(p_loss.item())
                value_losses.append(v_loss.item())
                
            if TRAINING_STATUS.stop_signal:
                break
                
            avg_loss = total_loss / max(1, num_batches)
            avg_p_loss = np.mean(policy_losses) if policy_losses else 0
            avg_v_loss = np.mean(value_losses) if value_losses else 0
            
            log_training_message(f"Avg Loss: {avg_loss:.4f} (Policy: {avg_p_loss:.4f}, Value: {avg_v_loss:.4f})")
            
            # Save Checkpoints
            try:
                torch.save(model.state_dict(), model_path)
                log_training_message("Saved model to best_model.pth")
            except Exception as e:
                log_training_message(f"Error saving model: {e}")
                
            # Log Loss for Chart
            with TRAINING_STATUS.lock:
                TRAINING_STATUS.loss_history.append({
                    "iteration": iteration,
                    "total_loss": float(avg_loss),
                    "policy_loss": float(avg_p_loss),
                    "value_loss": float(avg_v_loss)
                })

    except Exception as err:
        log_training_message(f"TRAINING FATAL ERROR: {err}")
        log_training_message(traceback.format_exc())
    finally:
        with TRAINING_STATUS.lock:
            TRAINING_STATUS.is_running = False
            TRAINING_STATUS.thread = None
        log_training_message("Training thread stopped.")

# --- API MODELS ---
class MoveRequest(BaseModel):
    session_id: str
    move: str # UCI string like e2e4

class GameConfig(BaseModel):
    session_id: str
    opponent: str # random, minimax, alphazero, nnue
    difficulty: str # easy, medium, hard
    mode: Optional[str] = "human_vs_ai"
    white_agent: Optional[str] = "minimax"
    black_agent: Optional[str] = "nnue"

class SpectatorRequest(BaseModel):
    session_id: str

class TrainConfig(BaseModel):
    simulations: int
    games_total: int
    learning_rate: float
    batch_size: int

# --- ENGINE MOVE HELPER ---
def run_agent_move(board: chess.Board, agent: str, difficulty: str) -> tuple[Optional[chess.Move], dict[str, Any]]:
    ai_move = None
    engine_stats = {}
    
    if agent == "random":
        ai_move = random.choice(list(board.legal_moves))
        engine_stats = {"nodes": 1, "depth": 1, "score": 0.0}
        
    elif agent == "minimax":
        depth = 2
        if difficulty == "medium":
            depth = 3
        elif difficulty == "hard":
            depth = 4
            
        engine = MinimaxEngine()
        ai_move = engine.search(board, depth=depth)
        eval_score = engine.evaluate_board(board) / 100.0 # Convert to pawn units
        engine_stats = {
            "nodes": engine.nodes_visited,
            "depth": depth,
            "score": eval_score
        }
        
    elif agent == "alphazero":
        sims = 20
        if difficulty == "medium":
            sims = 50
        elif difficulty == "hard":
            sims = 100
            
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        model = ChessNet().to(device)
        model_path = os.path.join(root_dir, "best_model.pth")
        if os.path.exists(model_path):
            model.load_state_dict(torch.load(model_path, map_location=device, weights_only=True))
        model.eval()
        
        mcts = MCTS(model, device)
        root = mcts.search(board, simulations=sims)
        moves, probs = mcts.get_action_probs(root, temperature=0.0)
        
        if moves:
            best_idx = np.argmax(probs)
            move_idx = moves[best_idx]
            for m in board.legal_moves:
                if encode_move(m) == move_idx:
                    ai_move = m
                    break
        
        state_t = torch.from_numpy(board_to_tensor(board)).unsqueeze(0).to(device)
        with torch.no_grad():
            _, val = model(state_t)
        
        engine_stats = {
            "nodes": sims,
            "depth": 1,
            "score": float(val.item())
        }
        
    elif agent == "nnue":
        time_limit = 1.0
        if difficulty == "medium":
            time_limit = 2.0
        elif difficulty == "hard":
            time_limit = 5.0
            
        model_path = os.path.join(root_dir, "nnue_alpha_beta", "checkpoints", "checkpoint_latest.pth")
        if not os.path.exists(model_path):
            model_path = os.path.join(root_dir, "best_model.pth")
            
        device = 'cpu'
        engine = NNUEEngine(model_path, device=device)
        ai_move = engine.search(board, time_limit=time_limit)
        
        engine_stats = engine.last_search_info
        if 'score' in engine_stats:
            engine_stats['score'] = float(engine_stats['score']) / 100.0
        else:
            engine_stats['score'] = 0.0
            
    if ai_move is None or ai_move not in board.legal_moves:
        if list(board.legal_moves):
            ai_move = random.choice(list(board.legal_moves))
            
    return ai_move, engine_stats

def get_game_over_reason(board: chess.Board) -> str:
    if board.is_checkmate():
        return "Checkmate"
    elif board.is_stalemate():
        return "Stalemate"
    elif board.is_insufficient_material():
        return "Insufficient Material"
    elif board.is_seventyfive_moves() or board.is_fifty_moves():
        return "Fifty-moves / 75-moves rule"
    elif board.is_fivefold_repetition() or board.is_threefold_repetition():
        return "Repetition"
    return "Draw / End of Game"

# --- ENDPOINTS ---

@app.get("/")
def get_index():
    from fastapi.responses import FileResponse
    html_path = os.path.join(os.path.dirname(__file__), "templates", "index.html")
    if os.path.exists(html_path):
        return FileResponse(html_path)
    raise HTTPException(status_code=404, detail="index.html not found")

@app.post("/api/new-game")
def new_game(config: GameConfig):
    session_id = config.session_id
    opponent = config.opponent
    difficulty = config.difficulty
    mode = config.mode or "human_vs_ai"
    white_agent = config.white_agent or "minimax"
    black_agent = config.black_agent or "nnue"
    
    session = GameSession(
        opponent=opponent, 
        difficulty=difficulty, 
        mode=mode, 
        white_agent=white_agent, 
        black_agent=black_agent
    )
    ACTIVE_GAMES[session_id] = session
    
    return {
        "status": "success",
        "fen": session.board.fen(),
        "turn": "white" if session.board.turn == chess.WHITE else "black",
        "legal_moves": [m.uci() for m in session.board.legal_moves],
        "is_check": session.board.is_check(),
        "check_square": chess.square_name(session.board.king_squares[session.board.turn]) if session.board.is_check() else None
    }

@app.post("/api/make-move")
def make_move(request: MoveRequest):
    session_id = request.session_id
    move_uci = request.move
    
    if session_id not in ACTIVE_GAMES:
        raise HTTPException(status_code=404, detail="Game session not found. Please start a new game.")
        
    session = ACTIVE_GAMES[session_id]
    board = session.board
    
    if board.is_game_over():
        return {
            "status": "game_over",
            "result": board.result(),
            "reason": get_game_over_reason(board),
            "fen": board.fen(),
            "is_check": board.is_check(),
            "check_square": chess.square_name(board.king_squares[board.turn]) if board.is_check() else None
        }
        
    # Apply human move
    try:
        move = chess.Move.from_uci(move_uci)
        if board.piece_at(move.from_square) and board.piece_at(move.from_square).piece_type == chess.PAWN:
            to_rank = chess.square_rank(move.to_square)
            if to_rank in [0, 7]:
                move.promotion = chess.QUEEN
                
        if move not in board.legal_moves:
            possible_prom = chess.Move(move.from_square, move.to_square, promotion=chess.QUEEN)
            if possible_prom in board.legal_moves:
                move = possible_prom
            else:
                raise HTTPException(status_code=400, detail="Illegal move.")
                
        session.history.append(board.fen())
        board.push(move)
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid move format: {str(e)}")
        
    if board.is_game_over():
        return {
            "status": "game_over",
            "result": board.result(),
            "reason": get_game_over_reason(board),
            "fen": board.fen(),
            "player_move": move.uci(),
            "is_check": board.is_check(),
            "check_square": chess.square_name(board.king_squares[board.turn]) if board.is_check() else None
        }
        
    # AI OPPONENT RESPONSE
    ai_move = None
    engine_stats = {}
    start_time = time.time()
    
    try:
        ai_move, engine_stats = run_agent_move(board, session.opponent, session.difficulty)
        if ai_move:
            board.push(ai_move)
    except Exception as e:
        log_training_message(f"Error in engine generation: {e}")
        if list(board.legal_moves):
            ai_move = random.choice(list(board.legal_moves))
            board.push(ai_move)
            
    time_taken = time.time() - start_time
    engine_stats["time"] = round(time_taken, 3)
    
    session.engine_info = engine_stats
    
    return {
        "status": "game_over" if board.is_game_over() else "success",
        "result": board.result() if board.is_game_over() else None,
        "reason": get_game_over_reason(board) if board.is_game_over() else None,
        "fen": board.fen(),
        "ai_move": ai_move.uci() if ai_move else None,
        "turn": "white" if board.turn == chess.WHITE else "black",
        "legal_moves": [m.uci() for m in board.legal_moves],
        "stats": engine_stats,
        "is_check": board.is_check(),
        "check_square": chess.square_name(board.king_squares[board.turn]) if board.is_check() else None
    }

@app.post("/api/spectator-move")
def spectator_move(request: SpectatorRequest):
    session_id = request.session_id
    if session_id not in ACTIVE_GAMES:
        raise HTTPException(status_code=404, detail="Game session not found.")
        
    session = ACTIVE_GAMES[session_id]
    board = session.board
    
    if board.is_game_over():
        return {
            "status": "game_over",
            "result": board.result(),
            "reason": get_game_over_reason(board),
            "fen": board.fen(),
            "is_check": board.is_check(),
            "check_square": chess.square_name(board.king_squares[board.turn]) if board.is_check() else None
        }
        
    # Check whose turn it is
    current_turn_color = "white" if board.turn == chess.WHITE else "black"
    current_agent = session.white_agent if board.turn == chess.WHITE else session.black_agent
    
    start_time = time.time()
    ai_move = None
    engine_stats = {}
    
    try:
        ai_move, engine_stats = run_agent_move(board, current_agent, session.difficulty)
        if ai_move:
            session.history.append(board.fen())
            board.push(ai_move)
    except Exception as e:
        log_training_message(f"Error in spectator move calculation: {e}")
        if list(board.legal_moves):
            ai_move = random.choice(list(board.legal_moves))
            session.history.append(board.fen())
            board.push(ai_move)
            
    time_taken = time.time() - start_time
    engine_stats["time"] = round(time_taken, 3)
    
    session.engine_info = engine_stats
    
    return {
        "status": "game_over" if board.is_game_over() else "success",
        "result": board.result() if board.is_game_over() else None,
        "reason": get_game_over_reason(board) if board.is_game_over() else None,
        "fen": board.fen(),
        "ai_move": ai_move.uci() if ai_move else None,
        "turn": "white" if board.turn == chess.WHITE else "black",
        "legal_moves": [m.uci() for m in board.legal_moves],
        "stats": engine_stats,
        "active_agent": current_agent,
        "active_color": current_turn_color,
        "is_check": board.is_check(),
        "check_square": chess.square_name(board.king_squares[board.turn]) if board.is_check() else None
    }

@app.post("/api/undo-move")
def undo_move(request: MoveRequest):
    session_id = request.session_id
    if session_id not in ACTIVE_GAMES:
        raise HTTPException(status_code=404, detail="Game session not found.")
        
    session = ACTIVE_GAMES[session_id]
    board = session.board
    
    # We must undo 2 moves (both AI's move and Human's move) to get back to user's turn
    # Unless there's only 1 move in history, or the game is already over
    undone = 0
    if len(session.history) >= 2:
        # Restore the FEN from two plies ago
        session.board = chess.Board(session.history[-2])
        session.history = session.history[:-2]
        undone = 2
    elif len(session.history) == 1:
        session.board = chess.Board(session.history[0])
        session.history = []
        undone = 1
    else:
        raise HTTPException(status_code=400, detail="Cannot undo, no moves recorded.")
        
    return {
        "status": "success",
        "fen": session.board.fen(),
        "turn": "white" if session.board.turn == chess.WHITE else "black",
        "legal_moves": [m.uci() for m in session.board.legal_moves],
        "undone_plies": undone,
        "is_check": session.board.is_check(),
        "check_square": chess.square_name(session.board.king_squares[session.board.turn]) if session.board.is_check() else None
    }

# --- TRAINING API ---

@app.post("/api/train/start")
def start_training(config: TrainConfig):
    global TRAINING_STATUS
    
    with TRAINING_STATUS.lock:
        if TRAINING_STATUS.is_running:
            return {"status": "error", "message": "Training is already running in background."}
            
        TRAINING_STATUS.simulations = config.simulations
        TRAINING_STATUS.games_total = config.games_total
        TRAINING_STATUS.learning_rate = config.learning_rate
        TRAINING_STATUS.batch_size = config.batch_size
        TRAINING_STATUS.stop_signal = False
        TRAINING_STATUS.is_running = True
        TRAINING_STATUS.logs = [] # Reset logs
        
        # Create thread
        TRAINING_STATUS.thread = threading.Thread(target=training_worker, daemon=True)
        TRAINING_STATUS.thread.start()
        
    return {"status": "success", "message": "Background self-play training successfully started."}

@app.post("/api/train/stop")
def stop_training():
    global TRAINING_STATUS
    with TRAINING_STATUS.lock:
        if not TRAINING_STATUS.is_running:
            return {"status": "error", "message": "Training is not running."}
        TRAINING_STATUS.stop_signal = True
        
    return {"status": "success", "message": "Stop signal sent to trainer."}

@app.get("/api/train/status")
def get_training_status():
    global TRAINING_STATUS
    with TRAINING_STATUS.lock:
        return {
            "is_running": TRAINING_STATUS.is_running,
            "iteration": TRAINING_STATUS.iteration,
            "game_index": TRAINING_STATUS.game_index,
            "move_index": TRAINING_STATUS.move_index,
            "games_total": TRAINING_STATUS.games_total,
            "current_fen": TRAINING_STATUS.current_fen,
            "white_wins": TRAINING_STATUS.white_wins,
            "black_wins": TRAINING_STATUS.black_wins,
            "draws": TRAINING_STATUS.draws,
            "loss_history": list(TRAINING_STATUS.loss_history),
            "logs": list(TRAINING_STATUS.logs)
        }

# Mount static and templates folders
# Note: In FastAPI, mounting static files is easy
static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(static_dir, exist_ok=True)
os.makedirs(os.path.join(static_dir, "css"), exist_ok=True)
os.makedirs(os.path.join(static_dir, "js"), exist_ok=True)

# Also expose standard assets for pieces
# We serve assets/ folder directly from root
assets_dir = os.path.join(root_dir, "assets")
if os.path.exists(assets_dir):
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

app.mount("/static", StaticFiles(directory=static_dir), name="static")

if __name__ == "__main__":
    import uvicorn
    # When executed directly, run server
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
