const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const TILE_SIZE = 32;
const ROWS = 20;
const COLS = 20;

// Block types
const BLOCKS = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3
};

// World generation
let world = [];
for (let y = 0; y < ROWS; y++) {
  world[y] = [];
  for (let x = 0; x < COLS; x++) {
    if (y > 12) world[y][x] = BLOCKS.STONE;
    else if (y > 10) world[y][x] = BLOCKS.DIRT;
    else if (y === 10) world[y][x] = BLOCKS.GRASS;
    else world[y][x] = BLOCKS.AIR;
  }
}

// Player
let player = {
  x: 10,
  y: 9
};

// Draw blocks
function drawBlock(x, y, type) {
  if (type === BLOCKS.AIR) return;

  if (type === BLOCKS.GRASS) ctx.fillStyle = "#4CAF50";
  if (type === BLOCKS.DIRT) ctx.fillStyle = "#8B4513";
  if (type === BLOCKS.STONE) ctx.fillStyle = "#777";

  ctx.fillRect(
    x * TILE_SIZE,
    y * TILE_SIZE,
    TILE_SIZE,
    TILE_SIZE
  );
}

// Draw player
function drawPlayer() {
  ctx.fillStyle = "red";
  ctx.fillRect(
    player.x * TILE_SIZE,
    player.y * TILE_SIZE,
    TILE_SIZE,
    TILE_SIZE
  );
}

// Game loop
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      drawBlock(x, y, world[y][x]);
    }
  }

  drawPlayer();
}

draw();

// Controls
document.addEventListener("keydown", e => {
  if (e.key === "w" || e.key === "ArrowUp") player.y--;
  if (e.key === "s" || e.key === "ArrowDown") player.y++;
  if (e.key === "a" || e.key === "ArrowLeft") player.x--;
  if (e.key === "d" || e.key === "ArrowRight") player.x++;

  player.x = Math.max(0, Math.min(COLS - 1, player.x));
  player.y = Math.max(0, Math.min(ROWS - 1, player.y));

  draw();
});

// Mouse controls
canvas.addEventListener("click", e => {
  const x = Math.floor(e.offsetX / TILE_SIZE);
  const y = Math.floor(e.offsetY / TILE_SIZE);
  world[y][x] = BLOCKS.AIR;
  draw();
});

canvas.addEventListener("contextmenu", e => {
  e.preventDefault();
  const x = Math.floor(e.offsetX / TILE_SIZE);
  const y = Math.floor(e.offsetY / TILE_SIZE);
  world[y][x] = BLOCKS.GRASS;
  draw();
});
