/* ============================================================================
   TALLINN SUNSET WAVES — p5.js sketch
   Градиентное закатное небо + силуэт таллиннской Старой города + анимированные
   волны на переднем плане. При наведении курсора на область волн они
   становятся выше (амплитуда плавно увеличивается).

   Как использовать: вставьте этот файл как sketch.js в редакторе p5js.org
   (глобальный режим, функции setup()/draw() вызываются автоматически).
   ============================================================================ */


/* ============================================================================
   1. НАСТРАИВАЕМЫЕ ПАРАМЕТРЫ
   Меняйте значения в этом блоке, чтобы настроить внешний вид и поведение.
   ============================================================================ */
const CONFIG = {

  // ---- Небо (вертикальный градиент заката) ----
  sky: {
    topColor:    '#1b1035',  // цвет неба вверху (тёмно-фиолетовый)
    midColor:    '#ff6f61',  // цвет неба в середине (закатный оранжево-розовый)
    bottomColor: '#ffd27a',  // цвет неба у горизонта (тёплый жёлтый)
  },

  // ---- Солнце (медленно движется по дуге: восход слева -> зенит в центре -> закат справа) ----
  sun: {
    color: '#fff3c4',        // цвет диска солнца
    glowColor: '#ffb347',    // цвет свечения вокруг солнца
    radius: 46,              // радиус диска солнца (px)
    glowLayers: 6,           // сколько полупрозрачных колец рисуется для свечения
    glowSpread: 3.2,         // во сколько раз свечение шире самого диска
    cycleSeconds: 50,        // за сколько секунд солнце проходит путь слева направо
    startXRatio: -0.05,      // X старта (восход), в долях ширины холста (может быть за краем)
    endXRatio: 1.05,         // X финиша (закат), в долях ширины холста
    horizonYRatio: 0.58,     // Y на восходе/закате (у горизонта), в долях высоты холста
    peakYRatio: 0.10,        // Y в зените (наивысшая точка), в долях высоты холста
    loop: true,              // true = после заката солнце сразу снова восходит слева
  },

  // ---- Силуэт города ----
  skyline: {
    color: '#120a1c',        // цвет силуэта башен/крыш (почти чёрный)
    baselineRatio: 0.40,     // на какой высоте холста стоит город (0 = верх, 1 = низ)
                              // сделано заметно меньше, чем waves.topRatio, чтобы волны
                              // накрывали только основание города, а не середину башен
    scale: 1.0,              // масштаб силуэта города
  },

  // ---- Волны ----
  waves: {
    layerCount: 5,           // количество слоёв волн (чем больше — тем "глубже" море)
    topRatio: 0.56,          // с какой высоты холста (доля от высоты) начинаются волны
    baseAmplitude: 14,       // высота волны в спокойном состоянии (px)
    hoverAmplitude: 55,      // высота волны при наведении мыши (px)
    amplitudeEasing: 0.06,   // скорость плавного перехода амплитуды (0..1, больше = быстрее)
    frequency: 0.010,        // "частота" волны по X (чем больше — тем чаще волны)
    speed: 0.035,            // скорость движения волн по времени
    layerSpacing: 26,        // расстояние по вертикали между слоями (px)
    // Цвета волн от заднего (верхнего/дальнего) к переднему (нижнему/ближнему) слою.
    // Каждый слой — вертикальный градиент [верхний цвет, нижний цвет].
    colors: [
      ['#5a3d8c', '#3a2a63'],
      ['#7a4b8f', '#4c2f6e'],
      ['#c1548c', '#6a2f6e'],
      ['#f0806c', '#8a3160'],
      ['#ffb06a', '#a83a55'],
    ],
    alpha: 235,               // общая прозрачность волн (0..255)
  },
};


/* ============================================================================
   2. ВНУТРЕННЕЕ СОСТОЯНИЕ (не требует ручной настройки)
   ============================================================================ */
let currentAmplitude;   // текущая (плавно анимируемая) амплитуда волн
let timeOffset = 0;     // счётчик времени для анимации волн
let sunProgress = 0;    // 0..1 — положение солнца на пути от восхода до заката


function setup() {
  createCanvas(windowWidth, windowHeight);
  currentAmplitude = CONFIG.waves.baseAmplitude;
  noStroke();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
  drawSky();
  drawSun();
  drawSkyline();
  updateWaveAmplitude();
  drawWaves();

  timeOffset += CONFIG.waves.speed;
  updateSunProgress();
}


/* ============================================================================
   3. НЕБО — вертикальный градиент заката (3 опорные точки цвета)
   ============================================================================ */
function drawSky() {
  const c1 = color(CONFIG.sky.topColor);
  const c2 = color(CONFIG.sky.midColor);
  const c3 = color(CONFIG.sky.bottomColor);

  for (let y = 0; y < height; y++) {
    const t = y / height;
    let col;
    if (t < 0.5) {
      // интерполяция между верхним и средним цветом
      col = lerpColor(c1, c2, t / 0.5);
    } else {
      // интерполяция между средним и нижним цветом
      col = lerpColor(c2, c3, (t - 0.5) / 0.5);
    }
    stroke(col);
    line(0, y, width, y);
  }
  noStroke();
}


/* ============================================================================
   3b. СОЛНЦЕ — медленно движется по дуге слева направо (восход -> зенит -> закат)
   ============================================================================ */
function updateSunProgress() {
  const cfg = CONFIG.sun;
  const framesPerCycle = cfg.cycleSeconds * 60; // ориентируемся на ~60 fps
  sunProgress += 1 / framesPerCycle;

  if (sunProgress > 1) {
    // либо зацикливаем (солнце снова восходит слева), либо останавливаем на закате
    sunProgress = cfg.loop ? sunProgress - 1 : 1;
  }
}

function drawSun() {
  const cfg = CONFIG.sun;

  // X движется линейно слева направо
  const x = lerp(width * cfg.startXRatio, width * cfg.endXRatio, sunProgress);

  // Y движется по дуге: sin(0) = горизонт, sin(PI/2) = зенит, sin(PI) = горизонт
  const arcHeight = sin(sunProgress * PI); // 0 в начале/конце, 1 в середине пути
  const horizonY = height * cfg.horizonYRatio;
  const peakY = height * cfg.peakYRatio;
  const y = lerp(horizonY, peakY, arcHeight);

  push();
  noStroke();

  // Мягкое свечение: несколько всё более крупных и прозрачных колец
  const glowCol = color(cfg.glowColor);
  for (let i = cfg.glowLayers; i >= 1; i--) {
    const t = i / cfg.glowLayers;
    const r = cfg.radius * lerp(1, cfg.glowSpread, t);
    fill(red(glowCol), green(glowCol), blue(glowCol), 55 * (1 - t));
    ellipse(x, y, r * 2, r * 2);
  }

  // Диск солнца
  fill(cfg.color);
  ellipse(x, y, cfg.radius * 2, cfg.radius * 2);

  pop();
}


/* ============================================================================
   4. СИЛУЭТ ГОРОДА
   Обобщённый силуэт Старого Таллинна: крепостная стена с круглыми башнями,
   шпили церквей (Олевисте, Нигулисте) и холм Тоомпеа. Форма нарисована
   вручную как условный, собирательный образ старого города — а не копия
   конкретного изображения.
   ============================================================================ */
function drawSkyline() {
  push();
  fill(CONFIG.skyline.color);

  const baseY = height * CONFIG.skyline.baselineRatio;
  const s = CONFIG.skyline.scale;
  translate(0, baseY);
  scale(s, s);

  const w = width / s;

  beginShape();
  vertex(0, 200);

  // --- Холм Тоомпеа: невысокая волнистая гряда крыш слева ---
  vertex(0, 40);
  vertex(w * 0.03, 30);
  vertex(w * 0.06, 45);
  vertex(w * 0.09, 20);
  vertex(w * 0.11, 35);

  // --- Круглая крепостная башня (типа Кик-ин-де-Кёк) ---
  vertex(w * 0.13, 35);
  arc2(w * 0.15, 20, 20);
  vertex(w * 0.17, 35);

  vertex(w * 0.20, 30);
  vertex(w * 0.23, 45);

  // --- Шпиль церкви Нигулисте ---
  vertex(w * 0.26, 40);
  vertex(w * 0.275, -60);
  vertex(w * 0.29, 40);

  vertex(w * 0.32, 35);
  vertex(w * 0.35, 48);
  vertex(w * 0.38, 30);

  // --- Толстая круглая башня (типа Толстая Маргарита) ---
  vertex(w * 0.40, 35);
  arc2(w * 0.43, 5, 32);
  vertex(w * 0.46, 35);

  vertex(w * 0.49, 25);
  vertex(w * 0.51, 42);

  // --- Шпиль церкви Олевисте (самый высокий, доминанта) ---
  vertex(w * 0.55, 38);
  vertex(w * 0.565, -110);
  vertex(w * 0.575, -60);
  vertex(w * 0.585, -110);
  vertex(w * 0.60, 38);

  vertex(w * 0.63, 30);
  vertex(w * 0.66, 44);

  // --- Ратушная башня со шпилем-флюгером ---
  vertex(w * 0.69, 36);
  vertex(w * 0.70, 0);
  vertex(w * 0.71, -18);
  vertex(w * 0.72, 0);
  vertex(w * 0.73, 36);

  vertex(w * 0.76, 28);
  vertex(w * 0.79, 40);

  // --- Ещё одна круглая крепостная башня ---
  vertex(w * 0.82, 35);
  arc2(w * 0.84, 15, 24);
  vertex(w * 0.86, 35);

  vertex(w * 0.89, 25);
  vertex(w * 0.92, 42);
  vertex(w * 0.95, 32);
  vertex(w * 0.97, 40);

  vertex(w, 30);
  vertex(w, 200);
  endShape(CLOSE);

  pop();
}

// Вспомогательная функция: рисует полукруглый купол башни как часть vertex-контура
function arc2(cx, topY, r) {
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const a = PI + (PI * i) / steps; // полукруг сверху
    const x = cx + cos(a) * r;
    const y = topY + sin(a) * r + r;
    vertex(x, y);
  }
}


/* ============================================================================
   5. АМПЛИТУДА ВОЛН — плавно увеличивается, если мышь над областью волн
   ============================================================================ */
function updateWaveAmplitude() {
  const wavesTopY = height * CONFIG.waves.topRatio;
  const isHovering = mouseY > wavesTopY && mouseY < height &&
                      mouseX > 0 && mouseX < width;

  const target = isHovering ? CONFIG.waves.hoverAmplitude : CONFIG.waves.baseAmplitude;

  // плавная (easing) интерполяция к целевому значению
  currentAmplitude += (target - currentAmplitude) * CONFIG.waves.amplitudeEasing;
}


/* ============================================================================
   6. ВОЛНЫ — несколько слоёв синусоид с градиентной заливкой
   ============================================================================ */
function drawWaves() {
  const cfg = CONFIG.waves;
  const wavesTopY = height * cfg.topRatio;

  for (let layer = 0; layer < cfg.layerCount; layer++) {
    // каждый следующий (более передний) слой волн смещён ниже и немного крупнее
    const layerBaseY = wavesTopY + layer * cfg.layerSpacing;
    const layerAmp = currentAmplitude * (0.6 + layer * 0.15);
    const phase = layer * 1.3; // сдвиг фазы, чтобы слои не двигались синхронно
    const [topColHex, botColHex] = cfg.colors[layer % cfg.colors.length];

    drawWaveLayer(layerBaseY, layerAmp, phase, topColHex, botColHex);
  }
}

function drawWaveLayer(baseY, amp, phase, topColHex, botColHex) {
  const cfg = CONFIG.waves;

  // вертикальный градиент для этого слоя, через нативный canvas-контекст
  const ctx = drawingContext;
  const gradient = ctx.createLinearGradient(0, baseY - amp, 0, height);
  gradient.addColorStop(0, hexToRgba(topColHex, cfg.alpha));
  gradient.addColorStop(1, hexToRgba(botColHex, cfg.alpha));
  ctx.fillStyle = gradient;

  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, baseY);

  for (let x = 0; x <= width; x += 10) {
    const y = baseY + sin(x * cfg.frequency + timeOffset + phase) * amp;
    ctx.lineTo(x, y);
  }

  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
}

// Вспомогательная функция: '#rrggbb' + альфа(0-255) -> строка rgba() для canvas
function hexToRgba(hex, alpha) {
  const c = color(hex);
  return `rgba(${red(c)}, ${green(c)}, ${blue(c)}, ${alpha / 255})`;
}
