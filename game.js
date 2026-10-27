const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

const FONT = "Times New Roman, 'brittanic bold', Arial, sans-serif";
const COLORS = {
  indigo: "#111113",
  indigoDark: "#0a0a0c",
  lavender: "#b3b3b3",
  light: "#161619",
  coral: "#8b0000",       // Merah Darah Gothic
  yellow: "#d4af37",      // Emas Antik
  text: "#e0e0e0",
  muted: "#888888",
  teal: "#2c3e50"         // Warna Pemain
};

const WIN_SCORE = 100;
const COIN_VALUE = 10;
const START_TIME = 60;
const DANGER_COUNT = 5;

const player = {
  x: 100,
  y: 100,
  width: 40,
  height: 40,
  speed: 5,
  color: COLORS.teal
};

let muted = false;
let highScore = Number(localStorage.getItem("highScore")) || 0;

const card = { x: W / 2 - 260, y: H / 2 - 155, width: 520, height: 310 };
const startButton = { x: W / 2 - 95, y: card.y + 200, width: 190, height: 56 };
const restartButton = { x: W / 2 - 95, y: card.y + 200, width: 190, height: 56 };
const muteButton = { x: W - 150, y: H - 46, width: 130, height: 32 };

const bgmAudio = document.getElementById("bgmAudio");
if (bgmAudio) {
  bgmAudio.volume = 0.5;
}

function fontOf(size, weight) {
  return (weight || "normal") + " " + size + "px " + FONT;
}

function randomPosition(size) {
  return {
    x: Math.random() * (canvas.width - size),
    y: Math.random() * (canvas.height - size)
  };
}

function createCoins() {
  return [
    { width: 20, height: 20, color: COLORS.yellow },
    { width: 20, height: 20, color: COLORS.yellow },
    { width: 20, height: 20, color: COLORS.yellow }
  ].map(function (coin) {
    const pos = randomPosition(coin.width);
    coin.x = pos.x;
    coin.y = pos.y;
    return coin;
  });
}

function createDangers() {
  return Array.from({ length: DANGER_COUNT }, function () {
    const pos = randomPosition(30);
    return { x: pos.x, y: pos.y, width: 30, height: 30, color: COLORS.coral };
  });
}

let coins = createCoins();
let dangers = createDangers();

let score = 0;
let timeLeft = START_TIME;
let messageTimer = 0;
let flashTimer = 0;
let popups = [];
let gameState = "START";
let timerInterval = null;
let touchingDanger = false;

const keysPressed = {};

let audioCtx = null;
let masterGain = null;

function getAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playTone(freq, start, duration, type, volume, destination) {
  const audio = getAudio();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain);
  gain.connect(destination);
  osc.start(start);
  osc.stop(start + duration);
}

function playCoinSound() {
  const t = getAudio().currentTime;
  playTone(987, t, 0.1, "sine", 0.2, masterGain);
  playTone(1567, t + 0.1, 0.2, "sine", 0.2, masterGain);
}

function playWinSound() {
  const t = getAudio().currentTime;
  [349, 440, 523, 698, 880].forEach(function (freq, i) {
    playTone(freq, t + i * 0.12, 0.2, "square", 0.1, masterGain);
  });
}

function playLoseSound() {
  const t = getAudio().currentTime;
  [330, 277, 233, 164].forEach(function (freq, i) {
    playTone(freq, t + i * 0.25, 0.4, "triangle", 0.15, masterGain);
  });
}

function playDangerSound() {
  const t = getAudio().currentTime;
  playTone(180, t, 0.15, "sawtooth", 0.12, masterGain);
  playTone(130, t + 0.1, 0.25, "sawtooth", 0.15, masterGain);
}

function startBgm() {
  if (bgmAudio && !muted) {
    bgmAudio.currentTime = 0;
    bgmAudio.play().catch(err => console.log("Autoplay diblokir browser:", err));
  }
}

function stopBgm() {
  if (bgmAudio) {
    bgmAudio.pause();
  }
}

function toggleMute() {
  muted = !muted;
  getAudio();
  if (masterGain) {
    masterGain.gain.value = muted ? 0 : 1;
  }
  if (bgmAudio) {
    bgmAudio.muted = muted;
  }
}

function isInside(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function addPopup(x, y, text) {
  popups.push({ x: x, y: y, text: text, life: 40 });
}

function startGame() {
  clearInterval(timerInterval);

  player.x = 100;
  player.y = 100;
  coins = createCoins();
  dangers = createDangers();
  score = 0;
  timeLeft = START_TIME;
  messageTimer = 0;
  flashTimer = 0;
  touchingDanger = false;
  popups = [];
  gameState = "PLAYING";
  startBgm();

  timerInterval = setInterval(function () {
    timeLeft--;
    if (timeLeft <= 0) {
      timeLeft = 0;
      endGame("GAME_OVER");
    }
  }, 1000);
}

function endGame(state) {
  gameState = state;
  clearInterval(timerInterval);
  stopBgm();

  if (score > highScore) {
    highScore = score;
    localStorage.setItem("highScore", highScore);
  }

  if (state === "WIN") {
    playWinSound();
  } else {
    // --- FITUR PENUTUPAN BROWSER SAAT KALAH ---
    playLoseSound();
    flashTimer = 30;

    // Memberikan jeda singkat (600ms) agar efek suara & efek kilat merah sempat berjalan
    setTimeout(function () {
      // 1. Coba tutup jendela/tab browser secara langsung
      window.close();

      // 2. Jika browser memblokir window.close() (kebijakan keamanan standar browser modern),
      // alihkan halaman ke about:blank sebagai tindakan fallback penutupan tampilan.
      window.location.href = "about:blank";
    }, 600);
  }
}

function isColliding(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function update() {
  if (messageTimer > 0) messageTimer--;
  if (flashTimer > 0) flashTimer--;

  if (gameState !== "PLAYING") return;

  if (keysPressed["ArrowRight"]) player.x += player.speed;
  if (keysPressed["ArrowLeft"]) player.x -= player.speed;
  if (keysPressed["ArrowUp"]) player.y -= player.speed;
  if (keysPressed["ArrowDown"]) player.y += player.speed;

  if (player.x < 0) player.x = 0;
  if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;
  if (player.y < 0) player.y = 0;
  if (player.y + player.height > canvas.height) player.y = canvas.height - player.height;

  coins.forEach(function (coin) {
    if (isColliding(player, coin)) {
      addPopup(coin.x, coin.y, "+" + COIN_VALUE);
      playCoinSound();

      const pos = randomPosition(coin.width);
      coin.x = pos.x;
      coin.y = pos.y;
      score += COIN_VALUE;
    }
  });

  if (score >= WIN_SCORE) endGame("WIN");

  const touching = dangers.some(function (danger) {
    return isColliding(player, danger);
  });
  if (touching) {
    messageTimer = 60;
    if (!touchingDanger) playDangerSound();
  }
  touchingDanger = touching;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function measurePill(text, fontStr) {
  ctx.font = fontStr;
  return ctx.measureText(text).width + 28;
}

function drawPill(text, x, y, bg, fg, fontStr) {
  const w = measurePill(text, fontStr);
  ctx.save();
  roundRect(x, y, w, 30, 15);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.font = fontStr;
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, y + 15);
  ctx.restore();
}

function drawCenteredPill(text, y, bg, fg) {
  const fontStr = fontOf(14, "bold");
  drawPill(text, W / 2 - measurePill(text, fontStr) / 2, y, bg, fg, fontStr);
}

function drawCenteredText(text, y, fontStr, color) {
  ctx.save();
  ctx.font = fontStr;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, y);
  ctx.restore();
}

function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#0a0a0c");
  grad.addColorStop(1, "#15151a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.strokeStyle = "rgba(139, 0, 0, 0.12)";
  ctx.lineWidth = 1;

  for (let x = 80; x < W; x += 160) {
    for (let y = 80; y < H; y += 140) {
      ctx.beginPath();
      ctx.arc(x, y, 32, 0, Math.PI * 2);
      ctx.stroke();

      for (let i = 0; i < 5; i++) {
        const angle = (i * 2 * Math.PI) / 5;
        const px = x + Math.cos(angle) * 12;
        const py = y + Math.sin(angle) * 12;
        ctx.beginPath();
        ctx.arc(px, py, 14, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(212, 175, 55, 0.08)";
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawPlayer() {
  const cx = player.x + player.width / 2;
  const cy = player.y + player.height / 2;
  const r = player.width / 2;

  ctx.save();

  ctx.fillStyle = COLORS.coral;
  ctx.strokeStyle = "#4a0000";
  ctx.lineWidth = 1.5;

  const numPetals = 5;
  for (let i = 0; i < numPetals; i++) {
    const angle = (i * 2 * Math.PI) / numPetals;
    const px = cx + Math.cos(angle) * (r * 0.55);
    const py = cy + Math.sin(angle) * (r * 0.55);

    ctx.beginPath();
    ctx.arc(px, py, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = "#b30000";
  for (let i = 0; i < 4; i++) {
    const angle = (i * 2 * Math.PI) / 4 + Math.PI / 4;
    const px = cx + Math.cos(angle) * (r * 0.25);
    const py = cy + Math.sin(angle) * (r * 0.25);

    ctx.beginPath();
    ctx.arc(px, py, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = "#4a0000";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = COLORS.yellow;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.12, 0, Math.PI * 1.5);
  ctx.stroke();

  ctx.restore();
}

function drawCoin(coin) {
  const r = coin.width / 2;
  ctx.beginPath();
  ctx.arc(coin.x + r, coin.y + coin.height / 2, r, 0, Math.PI * 2);
  ctx.fillStyle = coin.color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#997d22";
  ctx.stroke();
}

function drawDanger(danger) {
  roundRect(danger.x, danger.y, danger.width, danger.height, 6);
  ctx.fillStyle = danger.color;
  ctx.fill();
  ctx.save();
  ctx.font = fontOf(20, "bold");
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", danger.x + danger.width / 2, danger.y + danger.height / 2);
  ctx.restore();
}

function drawPopups() {
  ctx.save();
  ctx.font = fontOf(20, "bold");
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.yellow;
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 4;
  popups.forEach(function (p) {
    ctx.fillText(p.text, p.x, p.y);
    p.y -= 1;
    p.life--;
  });
  ctx.restore();
  popups = popups.filter(function (p) {
    return p.life > 0;
  });
}

function drawHUD() {
  const hudFont = fontOf(17, "bold");
  const dark = "rgba(20, 20, 26, 0.9)";
  const timeText = "WAKTU  " + timeLeft;

  drawPill("SKOR  " + score, 20, 18, dark, "#fff", hudFont);
  const timeWidth = measurePill(timeText, hudFont);
  drawPill(timeText, W - 20 - timeWidth, 18, timeLeft <= 10 ? COLORS.coral : dark, "#fff", hudFont);
}

function drawFlash() {
  ctx.fillStyle = "rgba(139, 0, 0, " + (flashTimer / 30) * 0.5 + ")";
  ctx.fillRect(0, 0, W, H);
}

function drawOverlay() {
  ctx.fillStyle = "rgba(10, 10, 13, 0.8)";
  ctx.fillRect(0, 0, W, H);
}

function drawCard() {
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 8;
  roundRect(card.x, card.y, card.width, card.height, 18);
  ctx.fillStyle = "#1e1e24";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#33333d";
  ctx.stroke();
  ctx.restore();
}

function drawButton(rect, label) {
  ctx.save();
  roundRect(rect.x, rect.y, rect.width, rect.height, 14);
  ctx.fillStyle = COLORS.coral;
  ctx.fill();
  ctx.font = fontOf(22, "bold");
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2);
  ctx.restore();
}

function drawStartScreen() {
  drawOverlay();
  drawCard();
  drawCenteredPill("GOTHIC EDITION", card.y + 26, COLORS.yellow, "#111113");
  drawCenteredText("CATCH THE COIN", card.y + 100, fontOf(42, "bold"), "#f0f0f0");
  drawCenteredText("Ambil koin emas, hindari duri merah, kumpulkan " + WIN_SCORE + " poin", card.y + 138, fontOf(18), COLORS.muted);
  drawCenteredText("High Score: " + highScore, card.y + 172, fontOf(18, "bold"), COLORS.yellow);
  drawButton(startButton, "MULAI");
  drawCenteredText("atau tekan ENTER", card.y + 285, fontOf(14), COLORS.muted);
}

function drawEndScreen() {
  const won = gameState === "WIN";
  drawOverlay();
  drawCard();
  drawCenteredPill(won ? "SELESAI · MENANG" : "SELESAI · WAKTU HABIS", card.y + 26, won ? COLORS.yellow : COLORS.lavender, "#111113");
  drawCenteredText(won ? "YOU WIN!" : "GAME OVER", card.y + 100, fontOf(44, "bold"), won ? COLORS.yellow : COLORS.coral);
  drawCenteredText("Score akhir: " + score, card.y + 142, fontOf(22), COLORS.text);
  drawCenteredText("High Score: " + highScore, card.y + 174, fontOf(18, "bold"), COLORS.yellow);
  drawButton(restartButton, "RESTART");
  drawCenteredText("atau tekan ENTER", card.y + 285, fontOf(14), COLORS.muted);
}

function drawMuteButton() {
  ctx.save();
  roundRect(muteButton.x, muteButton.y, muteButton.width, muteButton.height, 16);
  ctx.fillStyle = "rgba(40, 40, 50, 0.9)";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#555566";
  ctx.stroke();
  ctx.font = fontOf(15, "bold");
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(muted ? "Suara: OFF" : "Suara: ON", muteButton.x + muteButton.width / 2, muteButton.y + muteButton.height / 2);
  ctx.restore();
}

function draw() {
  drawBackground();
  dangers.forEach(drawDanger);
  coins.forEach(drawCoin);
  drawPlayer();

  drawPopups();
  drawHUD();

  if (flashTimer > 0) drawFlash();
  if (gameState === "START") drawStartScreen();
  if (gameState === "WIN" || gameState === "GAME_OVER") drawEndScreen();
  drawMuteButton();

  document.getElementById("message").textContent = messageTimer > 0 ? "⚠️ Bahaya!" : "";
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

document.addEventListener("keydown", function (event) {
  keysPressed[event.key] = true;

  if (event.key.startsWith("Arrow")) event.preventDefault();
  if (event.key === "Enter" && gameState !== "PLAYING") startGame();
  if (event.key === "m" || event.key === "M") toggleMute();
});

document.addEventListener("keyup", function (event) {
  keysPressed[event.key] = false;
});

canvas.addEventListener("click", function (event) {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (W / rect.width);
  const y = (event.clientY - rect.top) * (H / rect.height);

  if (isInside(x, y, muteButton)) {
    toggleMute();
  } else if (gameState === "START" && isInside(x, y, startButton)) {
    startGame();
  } else if ((gameState === "WIN" || gameState === "GAME_OVER") && isInside(x, y, restartButton)) {
    startGame();
  }
});

gameLoop();