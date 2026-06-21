# Playing Chess with Reinforcement Learning

### 🔗 Live Deployed Link: [https://chess-playing-with-reinforcement-learning.onrender.com](https://chess-playing-with-reinforcement-learning.onrender.com)

A comprehensive, multi-architecture chess engine repository exploring state-of-the-art Deep Learning, Reinforcement Learning, and interactive web visualization approaches. This project includes implementations of **AlphaZero-style Policy/Value Networks**, **NNUE-based Alpha-Beta Engines**, and **Transformer-based (GPT) Chess Bots**, complete with Pygame GUIs, UCI support, Elo benchmark tools, and a full-featured **Interactive Web-Based Play Arena & RL Training Dashboard**.

---

## 🌟 Architectures & Key Features

This repository is split into four primary components:

| Feature / Architecture | 🤖 AlphaZero / Root | 🧠 NNUE + Alpha-Beta | 🚀 Transformer / GPT | 🌐 Web-Based Dashboard |
| :--- | :--- | :--- | :--- | :--- |
| **Model Architecture** | ResNet with Policy & Value heads | Feedforward ChessNN (768 → 512 → 32 → 1) | `ChessTransformer` (Embedding + Attention) | Unified Web Console |
| **Search Algorithm** | Monte Carlo Tree Search (MCTS) with PUCT | Alpha-Beta Pruning with Transposition Tables | MCTS / Policy Rollouts | Dynamic Web Interface |
| **Interface** | CLI (`play.py`) & Pygame GUI (`gui.py`) | UCI Engine (`uci.py`) & Pygame GUIs | Pygame CLI/Spectator (`spectator.py`) | Responsive Single Page App |
| **Evaluation Type** | Win/loss/draw value network output | Centipawn evaluation via NNUE | Board sequence token embedding attention | Live Eval Gauge (Black/Draw/White) |
| **Training Source** | Self-play reinforcement learning | Stockfish generated datasets & custom search data | Game-to-game learning with CSV export | Live RL Self-Play dashboard (MCTS + Chart.js) |

---

## 🛠️ Tech Stack & Technologies Used

### Core Technology Stack

#### Backend
[![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![PyTorch](https://img.shields.io/badge/PyTorch-EE4C2C?style=for-the-badge&logo=pytorch&logoColor=white)](https://pytorch.org/)
[![NumPy](https://img.shields.io/badge/NumPy-013243?style=for-the-badge&logo=numpy&logoColor=white)](https://numpy.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

#### Frontend
[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/Guide/HTML/HTML5)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Chart.js](https://img.shields.io/badge/Chart.js-FF6384?style=for-the-badge&logo=chartdotjs&logoColor=white)](https://www.chartjs.org/)

---

### Detailed Component Explanations

#### ⚙️ Engine & API Server (Backend)
* **Python 3.10+**: Core programming language.
* **FastAPI**: Modern, fast web framework for building APIs. Handles REST endpoints for move calculations, undo operations, spectator loops, and live training status.
* **Uvicorn**: High-performance ASGI web server.
* **PyTorch (torch, nn, optim)**: Deep Learning framework used to define, load, and run the **AlphaZero ChessNet (ResNet)** model and the **NNUE ChessNN (Feedforward)** model.
* **python-chess**: Pure Python chess library for move generation, validation, FEN parsing, and rules tracking.
* **NumPy**: Linear algebra and numerical operations for game state representation and MCTS probabilities.
* **Pygame**: Library used for local graphical user interfaces (Human vs AI, versus engines, spectator screens).

#### 🖥️ Interactive Dashboard (Frontend)
* **HTML5**: Semantic document structure for chess boards, config panels, and responsive widgets.
* **CSS3 (Vanilla)**: Styling with a premium dark cyber-glassmorphism system (radial neon glow elements, backdrop-filter blurs, drop-shadow filters) and responsive CSS Grid/Flexbox layouts.
* **Vanilla JavaScript (ES6)**: Visual board paint controller, drag-and-drop mechanics, state subscriber, and asynchronous API consumer (Fetch API).
* **Chart.js**: Graphing library to plot policy loss, value loss, and total loss trends in real-time.
* **Web Audio API**: Browser-native synthesized audio generator simulating wood knock sound waves for clicks, captures, and checks (completely offline, zero audio asset files required).

---

## 📂 Project Directory Structure

```directory
├── Chess_AI.ipynb             # Jupyter Notebook for Root AlphaZero training/testing
├── best_model.pth             # Pre-trained checkpoint for the root AlphaZero agent
├── model.py                   # PyTorch implementation of ChessNet (Deep Residual Network)
├── mcts.py                    # Monte Carlo Tree Search with PUCT formula selection
├── trainer.py                 # Self-play training pipeline for the AlphaZero agent
├── play.py                    # CLI loop to play against the AlphaZero agent
├── gui.py                     # Interactive Pygame GUI for Human (White) vs AI (Black)
├── utils.py                   # Helper functions (board tensor representation, move encodings)
├── download_assets.py         # Utility to download chess piece sprite images
├── requirements.txt           # Core Python requirements (Torch, Numpy, pygame, python-chess)
│
├── 🌐 web_app/                # Web Dashboard Application (FastAPI + Vanilla JS/CSS)
│   ├── main.py                # FastAPI backend endpoints (moves, undo, spectator, training status)
│   ├── requirements_web.txt   # Web-specific python packages (fastapi, uvicorn, jinja2)
│   ├── README_DEPLOY.md       # Deployment instructions (Render, Hugging Face, Docker)
│   ├── templates/
│   │   └── index.html         # HTML layout, glassmorphic overlays, configuration settings
│   └── static/
│       ├── css/
│       │   └── styles.css     # CSS style sheet, mobile responsive media queries, check pulse keys
│       └── js/
│           └── app.js         # Frontend controller, Audio synthesis, training polling, Chart.js loss
│
├── 🧠 nnue_alpha_beta/        # Efficiently Updatable Neural Network & Alpha-Beta Engine
│   ├── model.py               # Feedforward NNUE network (sparse 768-feature input)
│   ├── engine.py              # Alpha-Beta pruning engine with transposition tables & move ordering
│   ├── train.py               # Train script for NNUE model
│   ├── data_gen.py            # Self-play dataset generator for NNUE training
│   ├── uci.py                 # UCI interface support for integration into standard GUIs
│   ├── gui_play.py            # Pygame GUI for human vs NNUE bot
│   ├── gui_versus.py          # Pygame GUI for watching engine matches
│   ├── gui_watch.py           # GUI to spectate self-play or specific matches
│   ├── benchmark_elo.py       # ELO estimation benchmarker using Cutechess and Bayeselo
│   └── Chess_Training.ipynb   # Jupyter Notebook training guide for NNUE
│
└── 🚀 v2_transformer/         # Transformer/GPT-based Chess Agent
    ├── model.py               # ChessTransformer model mapping board inputs via self-attention
    ├── trainer.py             # Policy training pipeline for ChessTransformer
    ├── mcts.py                # MCTS search modified for Transformer evaluations
    ├── play.py                # Play module for Transformer agent
    ├── spectator.py           # Match spectator loop for Transformer matches
    └── ChessGPT.ipynb         # Jupyter Notebook training guide for ChessGPT
```

---

## ⚙️ Installation & Setup

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/your-username/Playing-Chess-with-Reinforcement-Learning.git
   cd Playing-Chess-with-Reinforcement-Learning
   ```

2. **Install Core & Web Dependencies**:
   Ensure you have Python 3.8+ installed. Install the packages using:
   ```bash
   pip install -r requirements.txt
   pip install -r web_app/requirements_web.txt
   ```
   *Core packages include `torch`, `numpy`, `python-chess`, `tqdm`, `pygame`, and `requests`. Web packages include `fastapi`, `uvicorn`, and `jinja2`.*

3. **Download Graphic Assets**:
   Run the following script to download standard Wikipedia chess piece sprites into the `assets` folder:
   ```bash
   python download_assets.py
   ```

---

## 🎮 How to Run

### 1. Interactive Web Dashboard (Recommended)
Launch the local development server:
```bash
python -m uvicorn main:app --app-dir web_app --port 8000 --reload
```
Open [http://localhost:8000](http://localhost:8000) in your browser. The web dashboard features:
* **Play Arena (Human vs AI)**: Click/drag pieces to play against Heuristic Minimax, AlphaZero ResNet, or NNUE models.
* **AI vs AI Spectator Mode**: Set up matches between different models (e.g. NNUE vs Minimax) and watch them play live.
* **RL Trainer Self-Play Panel**: Run a live self-play reinforcement learning training loop, showing a streaming mini-board, loss charts (Chart.js), and logs console.
* **Responsive UI & Overlays**: Full mobile support and a glassmorphic Game Over modal overlay for win/loss/draw results.

### 2. AlphaZero Agent (CLI & Pygame GUI)
* **Play in GUI (Human vs AI)**:
  ```bash
  python gui.py
  ```
* **Play in CLI**:
  ```bash
  python play.py
  ```
* **Train AlphaZero Offline**:
  ```bash
  python trainer.py
  ```

### 3. NNUE Engine with Alpha-Beta
Change directory into `nnue_alpha_beta/`:
* **Play against NNUE Agent in GUI**:
  ```bash
  python gui_play.py --model checkpoints_1/checkpoint_latest.pth --time 2.0
  ```
* **Watch NNUE Engine Play vs Random**:
  ```bash
  python gui_versus.py
  ```
* **Train NNUE Network**:
  1. Generate training data: `python data_gen.py`
  2. Start training: `python train.py`
* **Run Elo Benchmarking**:
  ```bash
  python benchmark_elo.py
  ```

### 4. Transformer Agent (ChessGPT)
Change directory into `v2_transformer/`:
* **Play against ChessGPT**:
  ```bash
  python play.py
  ```
* **Watch Transformer Play in Spectator Mode**:
  ```bash
  python spectator.py
  ```
* **Train ChessGPT**:
  ```bash
  python trainer.py
  ```

---

## 📘 Deep Dive: Architecture Details & Tech Stack

### Web Application Tech Stack
* **Backend (Python)**:
  * **FastAPI**: High-performance async microframework to serve game-play REST endpoints and training states.
  * **python-chess**: State tracking, legal move validation, checks, checkmates, and draws parsing.
  * **Uvicorn**: Lightweight ASGI web server.
* **Frontend (Vanilla Web Stack)**:
  * **HTML5**: Structured semantic nodes containing configuration tabs, dashboards, and modal elements.
  * **Vanilla CSS3**: Cyber glassmorphism layout, radial background gradients, neon board accents, active turn indicators, pulsing check highlights, and full responsive grid system support down to `360px` viewports.
  * **Vanilla JavaScript (ES6)**: Visual board paint controller, drag-and-drop piece movement listeners, API consumer, and dynamic player name toggler.
  * **Chart.js**: Graphing library to plot policy, value, and total training losses live.
  * **Web Audio API**: Client-side synthesized audio synthesis generating distinct sound waves for move knocks, captures, and checks (no external `.mp3` loading needed).

### AlphaZero (MCTS + ChessNet)
* **State Representation**: The board state is converted into a $12 \times 8 \times 8$ tensor (6 piece types for White, 6 for Black).
* **Policy Head**: Predicts a probability distribution over all possible moves ($64 \times 64 = 4096$ output values).
* **Value Head**: Evaluates the position, outputting a scalar between $-1$ (loss) and $+1$ (win).
* **PUCT Search**: Monte Carlo Tree Search selects moves by balancing exploitation (high value) and exploration (high prior probability) using the PUCT formula:
  $$U(s, a) = c_{puct} \cdot P(s, a) \cdot \frac{\sqrt{\sum_b N(s, b)}}{1 + N(s, a)}$$

### NNUE (Efficiently Updatable Neural Network)
* **Input Layer**: Features a sparse 768-element bitboard mapping piece types to specific squares.
* **Alpha-Beta Engine**: Evaluates leaf nodes using the neural network rather than static piece-square tables, allowing for deep positional awareness combined with fast search speeds.
* **Transposition Tables**: Stores previously searched board states to eliminate redundant branch evaluations.

### ChessGPT (ChessTransformer)
* **Board Sequence Embedding**: Embeds the 64 squares of the board as a sequential sequence, adding learned positional encodings to maintain file/rank references.
* **Multi-Head Attention**: Captures long-range spatial relationships on the board across multiple attention layers.

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
