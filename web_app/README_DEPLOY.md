# Running & Deploying the Chess RL Dashboard

A guide to running and deploying the Chess Reinforcement Learning & Playing Web Application.

---

## 🚀 Running Locally

1. **Ensure Dependencies are Installed**:
   Make sure you have all required dependencies installed:
   ```bash
   pip install -r requirements.txt
   pip install -r web_app/requirements_web.txt
   ```

2. **Launch the FastAPI Server**:
   Run the following command from the root directory:
   ```bash
   python -m uvicorn main:app --app-dir web_app --port 8000 --reload
   ```

3. **Open the Web Application**:
   Go to your web browser and open:
   `http://localhost:8000`

---

## 🎨 Web App Key Features

- **Chess Match Arena**: Play against multiple AI difficulty tiers (Easy, Medium, Hard).
  - *Heuristic Minimax*: Search with Alpha-Beta pruning and Piece-Square Tables (runs in milliseconds on CPU).
  - *AlphaZero ResNet*: Deep model policy + Monte Carlo Tree Search.
  - *NNUE Engine*: Sparse input minimax evaluations.
  - *Sound synthesis*: Native board click, check, and capture sounds synthesized directly via the Web Audio API.
- **Interactive Reinforcement Learning Trainer**: Configure and run self-play training loops.
  - *Live Board Stream*: Watch the active self-play training games live move-by-move.
  - *Live Graphs*: Monitor Policy Loss, Value Loss, and Total Loss trends.
  - *Telemetry Console*: View the real-time stdout logs of the PyTorch trainer.

---

## ☁️ Deployment Instructions

### 1. Render (Free Tier Web Service)
Render is an excellent platform for deploying FastAPI applications.

1. **Create a Render Web Service**:
   - Connect your GitHub repository containing the project.
2. **Configure Settings**:
   - **Environment**: `Python`
   - **Build Command**: `pip install -r requirements.txt && pip install -r web_app/requirements_web.txt`
   - **Start Command**: `python -m uvicorn main:app --app-dir web_app --host 0.0.0.0 --port 8000`
3. **Environment Variables**:
   - Render automatically exposes the service on a public HTTPS URL.

### 2. Hugging Face Spaces (Docker or SDK)
Hugging Face Spaces is perfect for running Python machine learning web applications.

1. Create a new Space on Hugging Face.
2. Select the **Docker** SDK.
3. Add a `Dockerfile` at the root of the repository:
   ```dockerfile
   FROM python:3.10-slim

   WORKDIR /code

   COPY ./requirements.txt /code/requirements.txt
   COPY ./web_app/requirements_web.txt /code/web_app/requirements_web.txt

   RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt
   RUN pip install --no-cache-dir --upgrade -r /code/web_app/requirements_web.txt

   COPY . .

   CMD ["python", "-m", "uvicorn", "main:app", "--app-dir", "web_app", "--host", "0.0.0.0", "--port", "7860"]
   ```
4. Push the code to the Space's Git repository. Hugging Face will build the Docker container and host it.
