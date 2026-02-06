// L33T CODE NOISE Animation
const canvas = document.getElementById('particles');
const ctx = canvas.getContext('2d');

let microSymbols = [];
let leetWords = [];
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;

// Resize canvas
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Micro Symbol class (кодовая пыль)
class MicroSymbol {
  constructor() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.char = this.getRandomChar();
    this.opacity = Math.random() * 0.25 + 0.1; // 0.1-0.35 (было 0.05-0.2)
    this.targetOpacity = this.opacity;
    this.vx = (Math.random() - 0.5) * 0.3;
    this.vy = (Math.random() - 0.5) * 0.3;
    this.size = Math.random() * 6 + 8; // 8-14px
    this.color = ['#ffffff', '#aaaaaa', '#666666'][Math.floor(Math.random() * 3)];
    this.life = Math.random() * 300 + 200;
  }

  getRandomChar() {
    const chars = '{}[]()<>/\\;_=01';
    return chars[Math.floor(Math.random() * chars.length)];
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life--;

    // Реакция на мышь
    const dx = this.x - mouseX;
    const dy = this.y - mouseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < 100) {
      const force = (100 - dist) / 100;
      this.vx += (dx / dist) * force * 0.5;
      this.vy += (dy / dist) * force * 0.5;
      this.targetOpacity = Math.min(0.5, this.opacity + force * 0.3); // увеличено
    } else {
      this.targetOpacity = Math.random() * 0.25 + 0.1; // увеличено
    }

    // Плавное изменение прозрачности
    this.opacity += (this.targetOpacity - this.opacity) * 0.1;

    // Wrap around edges
    if (this.x < 0) this.x = canvas.width;
    if (this.x > canvas.width) this.x = 0;
    if (this.y < 0) this.y = canvas.height;
    if (this.y > canvas.height) this.y = 0;

    // Respawn if dead
    if (this.life <= 0) {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.char = this.getRandomChar();
      this.life = Math.random() * 300 + 200;
      this.color = ['#ffffff', '#aaaaaa', '#666666'][Math.floor(Math.random() * 3)];
    }
  }

  draw() {
    ctx.font = `${this.size}px monospace`;
    const r = parseInt(this.color.slice(1, 3), 16);
    const g = parseInt(this.color.slice(3, 5), 16);
    const b = parseInt(this.color.slice(5, 7), 16);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${this.opacity})`;
    ctx.fillText(this.char, this.x, this.y);
  }
}

// L33T Word class (редкие крупные вставки)
class LeetWord {
  constructor() {
    this.x = Math.random() * (canvas.width - 200) + 100;
    this.y = Math.random() * (canvas.height - 100) + 50;
    this.word = this.getRandomWord();
    this.opacity = 0;
    this.targetOpacity = Math.random() * 0.05 + 0.05; // 0.05-0.1 (было 0.03-0.06)
    this.size = Math.random() * 40 + 40; // 40-80px
    this.life = Math.random() * 60 + 60; // 1-2 секунды при 60fps
    this.glitchX = 0;
    this.glitchY = 0;
    this.glitchTimer = 0;
  }

  getRandomWord() {
    const words = [
      '1337', 'root', 'sudo', 'null', '0x000000', 'segfault', 'void', 'exec', 'chmod', 'grep',
      'HeliTeam', 'Code by Klieer', 'Klir?', 'Bingo!',
      'RTFM', 'git gud', 'works on my machine', 'deprecated', 'legacy code',
      'stack overflow', 'memory leak', 'race condition', 'deadlock', 'buffer overflow',
      'undefined behavior', 'syntax error', 'merge conflict', 'push --force',
      'rm -rf', 'sudo rm', 'kernel panic', 'core dumped', 'access denied'
    ];
    return words[Math.floor(Math.random() * words.length)];
  }

  update() {
    this.life--;

    // Fade in/out
    if (this.life > 50) {
      this.opacity += (this.targetOpacity - this.opacity) * 0.1;
    } else {
      this.opacity -= 0.001;
    }

    // Glitch effect (редко)
    this.glitchTimer--;
    if (this.glitchTimer <= 0 && Math.random() < 0.05) {
      this.glitchX = (Math.random() - 0.5) * 4;
      this.glitchY = (Math.random() - 0.5) * 4;
      this.glitchTimer = 5;
    } else if (this.glitchTimer <= 0) {
      this.glitchX = 0;
      this.glitchY = 0;
    }
  }

  draw() {
    if (this.opacity > 0) {
      ctx.font = `${this.size}px monospace`;
      ctx.fillStyle = `rgba(170, 170, 170, ${this.opacity})`;
      ctx.fillText(this.word, this.x + this.glitchX, this.y + this.glitchY);
    }
  }

  isDead() {
    return this.life <= 0 && this.opacity <= 0;
  }
}

// Initialize micro symbols
function initMicroSymbols() {
  microSymbols = [];
  const count = Math.floor((canvas.width * canvas.height) / 6000); // больше символов (было 8000)
  for (let i = 0; i < count; i++) {
    microSymbols.push(new MicroSymbol());
  }
}

// Spawn L33T word (очень редко)
let lastLeetSpawn = 0;
function trySpawnLeet() {
  const now = Date.now();
  if (now - lastLeetSpawn > 6000 && Math.random() < 0.4) { // чаще (было 8000 и 0.3)
    leetWords.push(new LeetWord());
    lastLeetSpawn = now;
  }
}

// Animation loop
function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Update and draw micro symbols
  microSymbols.forEach(symbol => {
    symbol.update();
    symbol.draw();
  });

  // Update and draw L33T words
  leetWords.forEach(word => {
    word.update();
    word.draw();
  });

  // Remove dead L33T words
  leetWords = leetWords.filter(w => !w.isDead());

  // Try spawn new L33T word
  trySpawnLeet();

  requestAnimationFrame(animate);
}

// Mouse tracking
document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

// Start
initMicroSymbols();
animate();
