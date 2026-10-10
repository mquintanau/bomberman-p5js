const COLS = 15;
const ROWS = 13;
const TILE = 48;          // on-screen size of one grid cell, in pixels
const HUD_H = 64;         // height of the score bar above the arena

const TILE_EMPTY   = 0;   // walkable floor
const TILE_SOLID   = 1;   // indestructible (border + pillars)
const TILE_BRICK   = 2;   // destructible block
const TILE_BURNING = 3;   // brick that was hit. Blocks until the flame ends

const START_LIVES       = 1;
const PLAYER_SPEED      = 150;   // pixels per second
const MAX_BOMBS         = 2;     // bombs a player can have on the field at once
const BOMB_RANGE        = 2;     // flame length in tiles (each direction)
const BOMB_FUSE         = 2.5;   // seconds before a bomb explodes
const EXPLOSION_TIME    = 0.6;   // seconds the flames stay on screen
const INVULNERABLE_TIME = 2.0;   // i-frames after being hit (prevents multi-hits)
const BRICK_DENSITY     = 0.7;

// `angle` used to rotate the explosion beam image
const DIRS = {
  up:    { x:  0, y: -1, angle: 0 },
  right: { x:  1, y:  0, angle: Math.PI / 2 },
  down:  { x:  0, y:  1, angle: Math.PI },
  left:  { x: -1, y:  0, angle: -Math.PI / 2 },
};

const CONTROLS = {
  p1: { up: 87, left: 65, down: 83, right: 68, bomb: 32 },   // W A S D, Space
  p2: { up: 38, left: 37, down: 40, right: 39, bomb: 13 },   // Arrows, Enter
};
const KEY_RESTART = 82; // R

const ASSET_PATHS = {
  player1:   'assets/player1.png',
  player2:   'assets/player2.png',    // optional: if missing, a recoloured copy of player1 is used
  bomb:      'assets/bomb.png',
  explosion: 'assets/explosion.png',
  solid:     'assets/block_solid.png',
  brick:     'assets/block_brick.png',
  floor:     'assets/floor.png',
};

let imgPlayer1, imgPlayer2, imgBomb, imgExplosion;
let imgSolidBlock, imgBrickBlock, imgFloor;

/*
 * spriteWidth / spriteHeight
 *   Size of ONE frame inside the PNG. Leave as null to auto-compute them from
 *   the image size, the number of columns/rows, the outer `margin` and the
 *   `spacing` between frames:
 *       spriteWidth  = (imageWidth  - 2*margin - (cols-1)*spacing) / cols
 *       spriteHeight = (imageHeight - 2*margin - (rows-1)*spacing) / rows
 *   clean sheet with frames packed edge-to-edge uses margin 0, spacing 0.
 */
const PLAYER_SHEET = {
  cols: 3,
  rows: 4,
  spriteWidth: null,
  spriteHeight: null,
  margin: 0,
  spacing: 0,
  rowFor: { down: 0, right: 1, up: 2, left: 3 },
  idleCol: 1,
  walkSequence: [0, 1, 2, 1],   // columns visited while walking (loops)
  walkFrameTime: 0.12,          // seconds per walk frame
  drawWidth: TILE,              // on-screen width; height keeps the frame's aspect ratio
};

const BOMB_SHEET = {
  cols: 3,
  rows: 1,
  spriteWidth: null,
  spriteHeight: null,
  margin: 0,
  spacing: 0,
  frameTime: 0.16,          // seconds per frame normally
  fastFrameTime: 0.06,      // seconds per frame near the end of the fuse
  fastBelow: 0.8,           // switch to fast when fuse < this many seconds
};

const EXPLOSION_SHEET = {
  side:   { x: 0, y: 0.00, w: 1, h: 0.48 },
  center: { x: 0, y: 0.52, w: 1, h: 0.48 },
  sideImagePoints: 'up',
};

let sheetP1, sheetP2, sheetBomb, sheetExplosion;

function loadOptionalImage(path) {
  const img = loadImage(
    path,
    () => {},                                   // success: nothing extra to do
    () => {                                     // failure: mark and warn
      img.failed = true;
      console.warn(`[assets] "${path}" not found — using a placeholder.`);
    }
  );
  return img;
}

function isUsable(img) {
  return img && !img.failed && img.width > 1;
}

function preload() {
  imgPlayer1    = loadOptionalImage(ASSET_PATHS.player1);
  imgPlayer2    = loadOptionalImage(ASSET_PATHS.player2);
  imgBomb       = loadOptionalImage(ASSET_PATHS.bomb);
  imgExplosion  = loadOptionalImage(ASSET_PATHS.explosion);
  imgSolidBlock = loadOptionalImage(ASSET_PATHS.solid);
  imgBrickBlock = loadOptionalImage(ASSET_PATHS.brick);
  imgFloor      = loadOptionalImage(ASSET_PATHS.floor);
}

/**
 * Turns the loaded images into SpriteSheet objects. Any missing image is
 * replaced with a generated placeholder that uses the SAME grid layout
 */
function buildSprites() {
  sheetP1 = isUsable(imgPlayer1)
    ? new SpriteSheet(imgPlayer1, PLAYER_SHEET)
    : new SpriteSheet(makePlaceholderPlayerSheet('#f4f4f4', '#2f6fff'), packed(PLAYER_SHEET));

  if (isUsable(imgPlayer2)) {
    sheetP2 = new SpriteSheet(imgPlayer2, PLAYER_SHEET);
  } else if (isUsable(imgPlayer1)) {
    sheetP2 = new SpriteSheet(makeTintedCopy(imgPlayer1, [255, 120, 120]), PLAYER_SHEET);
  } else {
    sheetP2 = new SpriteSheet(makePlaceholderPlayerSheet('#262626', '#ff3b3b'), packed(PLAYER_SHEET));
  }

  sheetBomb = isUsable(imgBomb)
    ? new SpriteSheet(imgBomb, BOMB_SHEET)
    : new SpriteSheet(makePlaceholderBombSheet(), packed(BOMB_SHEET));

  sheetExplosion = isUsable(imgExplosion)
    ? new SpriteSheet(imgExplosion, EXPLOSION_SHEET)
    : new SpriteSheet(makePlaceholderExplosion(), {
        ...EXPLOSION_SHEET,
        side:   { x: 0, y: 0,   w: 1, h: 0.5 },
        center: { x: 0, y: 0.5, w: 1, h: 0.5 },
        sideImagePoints: 'up',
      });

  if (!isUsable(imgSolidBlock)) imgSolidBlock = makePlaceholderSolidTile();
  if (!isUsable(imgBrickBlock)) imgBrickBlock = makePlaceholderBrickTile();
  if (!isUsable(imgFloor))      imgFloor      = makePlaceholderFloorTile();
}

function packed(cfg) {
  return { ...cfg, margin: 0, spacing: 0, spriteWidth: null, spriteHeight: null };
}

class SpriteSheet {
  constructor(img, cfg) {
    this.img = img;
    this.cfg = cfg;
  }

  get spriteWidth() {
    const { cols = 1, margin = 0, spacing = 0, spriteWidth } = this.cfg;
    return spriteWidth ?? (this.img.width - 2 * margin - (cols - 1) * spacing) / cols;
  }
  get spriteHeight() {
    const { rows = 1, margin = 0, spacing = 0, spriteHeight } = this.cfg;
    return spriteHeight ?? (this.img.height - 2 * margin - (rows - 1) * spacing) / rows;
  }

  drawFrame(col, row, dx, dy, dw, dh) {
    const { margin = 0, spacing = 0 } = this.cfg;
    const sw = this.spriteWidth;
    const sh = this.spriteHeight;
    const sx = margin + col * (sw + spacing);
    const sy = margin + row * (sh + spacing);
    image(this.img, dx, dy, dw, dh, sx, sy, sw, sh);
  }

  drawRegion(region, dx, dy, dw, dh) {
    const W = this.img.width;
    const H = this.img.height;
    image(this.img, dx, dy, dw, dh, region.x * W, region.y * H, region.w * W, region.h * H);
  }
}

function approach(value, target, maxStep) {
  const diff = target - value;
  if (Math.abs(diff) <= maxStep) return target;
  return value + Math.sign(diff) * maxStep;
}

function pingPong(step, n) {
  if (n <= 1) return 0;
  const period = 2 * (n - 1);
  const i = step % period;
  return i < n ? i : period - i;
}

function cellCenter(index) {
  return index * TILE + TILE / 2;
}

class GameMap {
  /**
   * @param {number} cols
   * @param {number} rows
   * @param {{col:number,row:number}[]} spawns  spawn points to keep clear
   */
  constructor(cols, rows, spawns) {
    this.cols = cols;
    this.rows = rows;
    this.tiles = [];          // tiles[row][col] -> TILE_* constant
    this.generate(spawns);
  }

  generate(spawns) {
    // Cells that must stay EMPTY: each spawn plus its two neighbours along
    // the corridors, so every player has an "L" of room to drop a first bomb
    // and step out of the blast.
    const safe = new Set();
    for (const s of spawns) {
      for (const [dc, dr] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        safe.add(`${s.col + dc},${s.row + dr}`);
      }
    }

    for (let r = 0; r < this.rows; r++) {
      this.tiles[r] = [];
      for (let c = 0; c < this.cols; c++) {
        const isBorder = r === 0 || c === 0 || r === this.rows - 1 || c === this.cols - 1;
        const isPillar = r % 2 === 0 && c % 2 === 0;

        if (isBorder || isPillar) {
          this.tiles[r][c] = TILE_SOLID;
        } else if (!safe.has(`${c},${r}`) && random() < BRICK_DENSITY) {
          this.tiles[r][c] = TILE_BRICK;
        } else {
          this.tiles[r][c] = TILE_EMPTY;
        }
      }
    }
  }

  /** Tile type at (col,row). Anything outside the grid counts as SOLID. */
  get(col, row) {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return TILE_SOLID;
    return this.tiles[row][col];
  }

  set(col, row, type) {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
    this.tiles[row][col] = type;
  }

  isWalkable(col, row) {
    return this.get(col, row) === TILE_EMPTY;
  }

  draw() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = c * TILE;
        const y = r * TILE;
        const t = this.tiles[r][c];

        image(imgFloor, x, y, TILE, TILE);

        if (t === TILE_SOLID) {
          image(imgSolidBlock, x, y, TILE, TILE);
        } else if (t === TILE_BRICK) {
          image(imgBrickBlock, x, y, TILE, TILE);
        } else if (t === TILE_EMPTY && this.get(c, r - 1) !== TILE_EMPTY) {
          noStroke();
          fill(0, 0, 0, 60);
          rect(x, y, TILE, TILE * 0.18);
        }
      }
    }
  }
}

class Player {
  /**
   * @param {number} id        1 or 2
   * @param {number} col,row   spawn cell
   * @param {object} controls  keyCodes {up,down,left,right,bomb}
   * @param {SpriteSheet} sheet
   * @param {string} color     UI colour (HUD, marker)
   */
  constructor(id, col, row, controls, sheet, color) {
    this.id = id;
    this.controls = controls;
    this.sheet = sheet;
    this.color = color;

    this.x = cellCenter(col);
    this.y = cellCenter(row);

    this.lives = START_LIVES;
    this.invulnerable = 0;
    this.maxBombs = MAX_BOMBS;
    this.range = BOMB_RANGE;

    this.facing = id === 1 ? 'down' : 'up';
    this.isWalking = false;
    this.walkTime = 0;

    this.heldDirs = [];
  }

  get alive() {
    return this.lives > 0;
  }

  get col() { return Math.floor(this.x / TILE); }
  get row() { return Math.floor(this.y / TILE); }


  onKeyPressed(code, game) {
    const dir = this.dirForKey(code);
    if (dir) {
      if (!this.heldDirs.includes(dir)) this.heldDirs.push(dir);
      return true;
    }
    if (code === this.controls.bomb) {
      this.placeBomb(game);
      return true;
    }
    return false;
  }

  onKeyReleased(code) {
    const dir = this.dirForKey(code);
    if (dir) {
      this.heldDirs = this.heldDirs.filter((d) => d !== dir);
      return true;
    }
    return code === this.controls.bomb;
  }

  dirForKey(code) {
    for (const name of ['up', 'down', 'left', 'right']) {
      if (this.controls[name] === code) return name;
    }
    return null;
  }

  clearInput() {
    this.heldDirs = [];
  }

  placeBomb(game) {
    if (!this.alive || game.state !== 'playing') return;

    const ownBombs = game.bombs.filter((b) => b.owner === this).length;
    if (ownBombs >= this.maxBombs) return;
    if (game.bombAt(this.col, this.row)) return;
    if (!game.map.isWalkable(this.col, this.row)) return;

    game.bombs.push(new Bomb(this, this.col, this.row, this.range, game.players));
  }

  update(dt, game) {
    if (this.invulnerable > 0) this.invulnerable -= dt;
    if (!this.alive) return;

    const dirName = this.heldDirs[this.heldDirs.length - 1];
    if (dirName) {
      this.facing = dirName;
      this.isWalking = true;
      this.walkTime += dt;
      this.move(DIRS[dirName], PLAYER_SPEED * dt, game);
    } else {
      this.isWalking = false;
      this.walkTime = 0;
    }
  }

  canEnter(col, row, game) {
    if (!game.map.isWalkable(col, row)) return false;
    const bomb = game.bombAt(col, row);
    // A bomb only blocks you once you've stepped off it.
    return !bomb || bomb.passThrough.has(this);
  }

  move(dir, step, game) {
    const horizontal = dir.x !== 0;
    const sign = horizontal ? dir.x : dir.y;

    let along  = horizontal ? this.x : this.y;
    let across = horizontal ? this.y : this.x;
    const alongIdx  = horizontal ? this.col : this.row;
    const acrossIdx = horizontal ? this.row : this.col;
    const alongCenter  = cellCenter(alongIdx);
    const acrossCenter = cellCenter(acrossIdx);

    const enterable = (a, b) => (horizontal ? this.canEnter(a, b, game) : this.canEnter(b, a, game));

    if (across !== acrossCenter) {
      const leanSign = Math.sign(across - acrossCenter);
      const otherLane = acrossIdx + leanSign;
      const aheadOpen = enterable(alongIdx + sign, acrossIdx);
      const otherOpen = enterable(alongIdx + sign, otherLane) && enterable(alongIdx, otherLane);

      const target = !aheadOpen && otherOpen ? cellCenter(otherLane) : acrossCenter;
      across = approach(across, target, step);
    } else {
      // Straight movement
      if (enterable(alongIdx + sign, acrossIdx)) {
        along += sign * step;
      } else if ((alongCenter - along) * sign > 0) {
        along = approach(along, alongCenter, step);
      }
    }

    if (horizontal) { this.x = along; this.y = across; }
    else            { this.y = along; this.x = across; }
  }

  hit() {
    if (this.invulnerable > 0 || !this.alive) return;
    this.lives--;
    this.invulnerable = INVULNERABLE_TIME;
  }

  currentColumn() {
    if (!this.isWalking) return PLAYER_SHEET.idleCol;
    const seq = PLAYER_SHEET.walkSequence;
    const i = Math.floor(this.walkTime / PLAYER_SHEET.walkFrameTime) % seq.length;
    return seq[i];
  }

  draw() {
    if (this.invulnerable > 0 && Math.floor(this.invulnerable * 12) % 2 === 0) return;

    const dw = PLAYER_SHEET.drawWidth;
    const dh = dw * (this.sheet.spriteHeight / this.sheet.spriteWidth);
    const dx = this.x - dw / 2;
    const dy = this.y + TILE / 2 - dh;   // feet sit on the bottom of the cell; head overhangs upward

    noStroke();
    fill(0, 0, 0, 70);
    ellipse(this.x, this.y + TILE * 0.38, TILE * 0.7, TILE * 0.22);

    if (!this.alive) tint(255, 90);
    const row = PLAYER_SHEET.rowFor[this.facing];
    this.sheet.drawFrame(this.currentColumn(), row, dx, dy, dw, dh);
    noTint();

    // Small coloured marker above the head so players can tell who is who.
    fill(this.color);
    stroke(0);
    strokeWeight(2);
    const my = dy - 6;
    triangle(this.x - 6, my - 8, this.x + 6, my - 8, this.x, my);
  }
}

class Bomb {
  constructor(owner, col, row, range, players) {
    this.owner = owner;
    this.col = col;
    this.row = row;
    this.range = range;
    this.fuse = BOMB_FUSE;
    this.exploded = false;

    this.frameTimer = 0;
    this.frameStep = 0;

    this.passThrough = new Set(players.filter((p) => p.col === col && p.row === row));
  }

  update(dt) {
    this.fuse -= dt;

    const frameTime = this.fuse < BOMB_SHEET.fastBelow ? BOMB_SHEET.fastFrameTime : BOMB_SHEET.frameTime;
    this.frameTimer += dt;
    while (this.frameTimer >= frameTime) {
      this.frameTimer -= frameTime;
      this.frameStep++;
    }

    for (const p of this.passThrough) {
      if (p.col !== this.col || p.row !== this.row) this.passThrough.delete(p);
    }
  }

  get readyToExplode() {
    return this.fuse <= 0;
  }

  draw() {
    const frame = pingPong(this.frameStep, BOMB_SHEET.cols);
    sheetBomb.drawFrame(frame, 0, this.col * TILE, this.row * TILE, TILE, TILE);
  }
}

class Explosion {
  /**
   * @param {Player} owner
   * @param {number} col
   */
  constructor(owner, col, row) {
    this.owner = owner;
    this.col = col;
    this.row = row;
    this.timer = EXPLOSION_TIME;

    this.cells = [];
    this.burning = [];
    this.cellKeys = new Set();
  }

  addCell(col, row, kind, dir) {
    this.cells.push({ col, row, kind, dir });
    this.cellKeys.add(`${col},${row}`);
  }

  /**
   * @returns {Bomb[]} bombs hit by this explosion
   */
  spread(range, map, bombs) {
    const chained = [];
    this.addCell(this.col, this.row, 'center', null);

    for (const dirName of Object.keys(DIRS)) {
      const d = DIRS[dirName];
      for (let i = 1; i <= range; i++) {
        const c = this.col + d.x * i;
        const r = this.row + d.y * i;
        const tile = map.get(c, r);

        if (tile === TILE_SOLID || tile === TILE_BURNING) break;

        if (tile === TILE_BRICK) {
          map.set(c, r, TILE_BURNING);
          this.burning.push({ col: c, row: r });
          break;
        }

        const bomb = bombs.find((b) => !b.exploded && b.col === c && b.row === r);
        if (bomb) {
          chained.push(bomb);
          break;
        }

        this.addCell(c, r, 'side', dirName);
      }
    }
    return chained;
  }

  covers(col, row) {
    return this.cellKeys.has(`${col},${row}`);
  }

  get finished() {
    return this.timer <= 0;
  }

  update(dt, map) {
    this.timer -= dt;
    if (this.finished) {
      for (const b of this.burning) map.set(b.col, b.row, TILE_EMPTY);
    }
  }

  draw() {
    const t = 1 - Math.max(this.timer, 0) / EXPLOSION_TIME;
    const pulse = 0.55 + 0.45 * Math.sin(t * Math.PI);

    for (const b of this.burning) {
      tint(255, 255 * (1 - t), 255 * (1 - t), 255 * (1 - t * 0.9));
      image(imgBrickBlock, b.col * TILE, b.row * TILE, TILE, TILE);
    }
    noTint();

    const pointsAngle = DIRS[sheetExplosion.cfg.sideImagePoints].angle;

    for (const cell of this.cells) {
      push();
      translate(cellCenter(cell.col), cellCenter(cell.row));

      if (cell.kind === 'center') {
        scale(pulse);
        sheetExplosion.drawRegion(sheetExplosion.cfg.center, -TILE / 2, -TILE / 2, TILE, TILE);
      } else {
        rotate(DIRS[cell.dir].angle - pointsAngle);
        scale(pulse, 1);
        sheetExplosion.drawRegion(sheetExplosion.cfg.side, -TILE / 2, -TILE / 2, TILE, TILE);
      }
      pop();
    }
  }
}

class Game {
  constructor() {
    this.state = 'title';     // 'title' | 'playing' | 'gameover'
    this.reset();
  }

  reset() {
    const spawn1 = { col: 1, row: 1 };
    const spawn2 = { col: COLS - 2, row: ROWS - 2 };

    this.map = new GameMap(COLS, ROWS, [spawn1, spawn2]);
    this.players = [
      new Player(1, spawn1.col, spawn1.row, CONTROLS.p1, sheetP1, '#3d7bff'),
      new Player(2, spawn2.col, spawn2.row, CONTROLS.p2, sheetP2, '#ff4040'),
    ];
    this.bombs = [];
    this.explosions = [];
    this.winner = null;
    this.stateTime = 0;
  }

  setState(s) {
    this.state = s;
    this.stateTime = 0;
  }

  bombAt(col, row) {
    return this.bombs.find((b) => b.col === col && b.row === row);
  }

  detonate(bomb) {
    if (bomb.exploded) return;
    bomb.exploded = true;
    this.bombs = this.bombs.filter((b) => b !== bomb);

    const exp = new Explosion(bomb.owner, bomb.col, bomb.row);
    const chained = exp.spread(bomb.range, this.map, this.bombs);
    this.explosions.push(exp);

    for (const other of chained) this.detonate(other);
  }

  update(dt) {
    this.stateTime += dt;
    if (this.state !== 'playing') return;

    for (const p of this.players) p.update(dt, this);

    for (const b of this.bombs) b.update(dt);
    for (const b of [...this.bombs]) {
      if (b.readyToExplode) this.detonate(b);
    }

    for (const e of this.explosions) e.update(dt, this.map);
    this.explosions = this.explosions.filter((e) => !e.finished);

    for (const e of this.explosions) {
      for (const p of this.players) {
        if (p.alive && e.covers(p.col, p.row)) p.hit();
      }
    }

    const alive = this.players.filter((p) => p.alive);
    if (alive.length < this.players.length) {
      this.winner = alive.length === 1 ? alive[0] : null;
      this.setState('gameover');
    }
  }

  /** @returns {boolean} true if the key was used by the game */
  keyPressed(code) {
    if (this.state === 'title') {
      if (code === CONTROLS.p1.bomb || code === CONTROLS.p2.bomb) {
        this.setState('playing');
        return true;
      }
    } else if (this.state === 'gameover') {
      const confirm = code === CONTROLS.p1.bomb || code === CONTROLS.p2.bomb;
      if (code === KEY_RESTART || (confirm && this.stateTime > 1)) {
        this.reset();
        this.setState('playing');
        return true;
      }
    }

    let used = false;
    for (const p of this.players) used = p.onKeyPressed(code, this) || used;
    return used;
  }

  keyReleased(code) {
    let used = false;
    for (const p of this.players) used = p.onKeyReleased(code) || used;
    return used;
  }

  clearInput() {
    for (const p of this.players) p.clearInput();
  }

  draw() {
    background(10);
    this.drawHUD();

    push();
    translate(0, HUD_H);
    this.map.draw();
    for (const b of this.bombs) b.draw();
    for (const e of this.explosions) e.draw();
    // Draw the lower player last so overlapping sprites layer correctly.
    [...this.players].sort((a, b) => a.y - b.y).forEach((p) => p.draw());
    pop();

    if (this.state === 'title') this.drawTitle();
    if (this.state === 'gameover') this.drawGameOver();
  }

  drawHUD() {
    noStroke();
    fill('#1d2f7a');
    rect(0, 0, width, HUD_H);
    fill('#0c1748');
    rect(0, HUD_H - 4, width, 4);

    textFont('Press Start 2P');
    const [p1, p2] = this.players;

    this.drawPlayerBadge(p1, 16, 'left');
    this.drawPlayerBadge(p2, width - 16, 'right');

    fill(255, 220, 60);
    textAlign(CENTER, CENTER);
    textSize(16);
    text('VS', width / 2, HUD_H / 2 - 2);
  }

  drawPlayerBadge(player, x, side) {
    const heartSize = 3;
    const heartW = HEART_PIXELS[0].length * heartSize;
    const gap = 6;

    textSize(12);
    fill(player.color);
    textAlign(side === 'left' ? LEFT : RIGHT, TOP);
    text(`PLAYER ${player.id}`, x, 12);

    for (let i = 0; i < START_LIVES; i++) {
      const offset = i * (heartW + gap);
      const hx = side === 'left' ? x + offset : x - offset - heartW;
      drawPixelHeart(hx, 32, heartSize, i < player.lives);
    }
  }

  drawOverlayBox() {
    noStroke();
    fill(0, 0, 0, 170);
    rect(0, HUD_H, width, height - HUD_H);
  }

  drawTitle() {
    this.drawOverlayBox();
    const cx = width / 2;
    const cy = HUD_H + (height - HUD_H) / 2;
    textFont('Press Start 2P');
    textAlign(CENTER, CENTER);

    textSize(24);
    strokeWeight(4);
    stroke(0, 210, 255);
    fill(0, 50, 255);
    text('SUPER', cx - 50, cy - 174);

    textSize(40);
    strokeWeight(5);
    stroke(32, 0, 0);
    fill(255, 68, 0);
    text('CAPUCHO', cx, cy - 140);

    textSize(32);
    stroke(255);
    strokeWeight(2);
    fill(255, 140, 0);
    text('MAN', cx + 100, cy - 104);

    noStroke();
    fill(255);
    textSize(14);
    text('P v P   B A T T L E', cx, cy - 66);

    textSize(10);
    fill('#7fa8ff');
    text('P1: W A S D move - SPACE tear gas', cx, cy - 10);
    fill('#ff8080');
    text('P2:  ARROWS move - ENTER tear gas', cx, cy + 14);
    fill(220);
    text(`${START_LIVES} lives each. Last player without tears wins!`, cx, cy + 50);

    if (Math.floor(this.stateTime * 2) % 2 === 0) {
      fill(255);
      textSize(12);
      text('PRESS SPACE OR ENTER', cx, cy + 130);
    }
  }

  drawGameOver() {
    this.drawOverlayBox();
    const cx = width / 2;
    const cy = HUD_H + (height - HUD_H) / 2;
    textFont('Press Start 2P');
    textAlign(CENTER, CENTER);

    textSize(24);
    if (this.winner) {
      fill(this.winner.color);
      text(`PLAYER ${this.winner.id} WINS!`, cx, cy - 30);
    } else {
      fill(255, 220, 60);
      text('DRAW!', cx, cy - 30);
    }

    if (this.stateTime > 1 && Math.floor(this.stateTime * 2) % 2 === 0) {
      fill(255);
      textSize(11);
      text('PRESS R / SPACE / ENTER TO REMATCH', cx, cy + 30);
    }
  }
}

const HEART_PIXELS = [
  '0110110',
  '1111111',
  '1111111',
  '0111110',
  '0011100',
  '0001000',
];

function drawPixelHeart(x, y, s, filled) {
  noStroke();
  fill(filled ? '#ff3d6e' : '#3a3f5c');
  for (let r = 0; r < HEART_PIXELS.length; r++) {
    for (let c = 0; c < HEART_PIXELS[r].length; c++) {
      if (HEART_PIXELS[r][c] === '1') rect(x + c * s, y + r * s, s, s);
    }
  }
  if (filled) {
    fill(255, 200);
    rect(x + s, y + s, s, s);
  }
}

function newCanvas(w, h) {
  const g = createGraphics(w, h);
  g.pixelDensity(1);
  g.noSmooth();
  g.noStroke();
  g.clear();
  return g;
}

function makePlaceholderPlayerSheet(bodyColor, accentColor) {
  const fw = 24;
  const fh = 36;
  const g = newCanvas(fw * 3, fh * 4);
  const skin = '#f8c890';

  for (const [dir, row] of Object.entries(PLAYER_SHEET.rowFor)) {
    for (let col = 0; col < 3; col++) {
      const ox = col * fw;
      const oy = row * fh;
      const lift = col - 1;            // -1 / 0 / +1 -> which foot is up

      g.fill(accentColor);
      g.rect(ox + 5,  oy + 31 - (lift < 0 ? 2 : 0), 6, 4);
      g.rect(ox + 13, oy + 31 - (lift > 0 ? 2 : 0), 6, 4);
      // Body + belt
      g.fill(bodyColor);
      g.rect(ox + 6, oy + 20, 12, 11);
      g.fill(accentColor);
      g.rect(ox + 6, oy + 25, 12, 2);
      // Swinging arms
      g.fill(bodyColor);
      g.rect(ox + 3,  oy + 21 + lift, 3, 6);
      g.rect(ox + 18, oy + 21 - lift, 3, 6);
      // Head
      g.ellipse(ox + 12, oy + 12, 20, 18);
      // Antenna
      g.fill(accentColor);
      g.rect(ox + 11, oy + 2, 2, 2);
      g.ellipse(ox + 12, oy + 2, 4, 4);
      // Face visor depends on direction ('up' shows the back of the head)
      if (dir === 'down') {
        g.fill(skin);  g.rect(ox + 6, oy + 9, 12, 8, 2);
        g.fill(0);     g.rect(ox + 9, oy + 10, 2, 5); g.rect(ox + 13, oy + 10, 2, 5);
      } else if (dir === 'left') {
        g.fill(skin);  g.rect(ox + 3, oy + 9, 9, 8, 2);
        g.fill(0);     g.rect(ox + 5, oy + 10, 2, 5);
      } else if (dir === 'right') {
        g.fill(skin);  g.rect(ox + 12, oy + 9, 9, 8, 2);
        g.fill(0);     g.rect(ox + 17, oy + 10, 2, 5);
      }
    }
  }
  return g;
}

function makePlaceholderBombSheet() {
  const fs = 32;
  const g = newCanvas(fs * 3, fs);
  const sizes = [22, 24, 26];
  for (let i = 0; i < 3; i++) {
    const cx = i * fs + fs / 2;
    const cy = fs / 2 + 2;
    const d = sizes[i];
    g.fill(18, 22, 40);
    g.ellipse(cx, cy, d, d);
    g.fill(90, 140, 210);
    g.ellipse(cx - d * 0.2, cy - d * 0.2, d * 0.28, d * 0.28);
    g.fill(200);
    g.rect(cx + d * 0.18, cy - d / 2 - 3, 3, 4);                // fuse cap
    g.fill(255, 120 + i * 60, 0);
    g.ellipse(cx + d * 0.18 + 2, cy - d / 2 - 4, 3 + i, 3 + i); // spark
  }
  return g;
}

function makePlaceholderExplosion() {
  const s = 32;
  const g = newCanvas(s, s * 2);
  const bands = [
    [6, '#e0400c'],   // [inset from the edge, colour]
    [10, '#ffb000'],
    [13, '#fff7d0'],
  ];

  for (const [inset, col] of bands) {
    g.fill(col);
    g.rect(inset, 0, s - inset * 2, s);
  }

  for (const [inset, col] of bands) {
    g.fill(col);
    g.rect(inset, s, s - inset * 2, s);
    g.rect(0, s + inset, s, s - inset * 2);
  }
  g.fill(255);
  g.ellipse(s / 2, s + s / 2, 12, 12);
  return g;
}

function makePlaceholderSolidTile() {
  const g = newCanvas(16, 16);
  g.fill('#9a9aa6'); g.rect(0, 0, 16, 16);
  g.fill('#d6d6e0'); g.rect(0, 0, 16, 2); g.rect(0, 0, 2, 16);   // highlight
  g.fill('#55556a'); g.rect(0, 14, 16, 2); g.rect(14, 0, 2, 16); // shadow
  g.fill('#7c7c8a'); g.rect(4, 4, 8, 8);                         // inset
  return g;
}

function makePlaceholderBrickTile() {
  const g = newCanvas(16, 16);
  g.fill('#c26a3a'); g.rect(0, 0, 16, 16);
  g.fill('#6e3418');                       // mortar lines
  for (const y of [0, 5, 10, 15]) g.rect(0, y, 16, 1);
  for (const [x, y] of [[4, 1], [12, 1], [0, 6], [8, 6], [4, 11], [12, 11]]) g.rect(x, y, 1, 4);
  g.fill('#e39462');                       // top-left highlight on each brick
  for (const [x, y] of [[0, 1], [5, 1], [13, 1], [1, 6], [9, 6], [0, 11], [5, 11], [13, 11]]) g.rect(x, y, 2, 1);
  return g;
}

function makePlaceholderFloorTile() {
  const g = newCanvas(16, 16);
  g.fill('#2f8a3f'); g.rect(0, 0, 16, 16);
  g.fill('#2a7c38'); g.rect(0, 0, 8, 8); g.rect(8, 8, 8, 8);
  return g;
}

function makeTintedCopy(img, rgb) {
  const g = createGraphics(img.width, img.height);
  g.pixelDensity(1);
  g.noSmooth();
  g.clear();
  g.tint(...rgb);
  g.image(img, 0, 0);
  return g;
}

let game;

function setup() {
  createCanvas(COLS * TILE, ROWS * TILE + HUD_H);
  pixelDensity(1);
  noSmooth();
  buildSprites();
  game = new Game();

  // If the window loses focus while a key is held, the keyup never arrives.
  // Clear held keys so players don't keep walking on their own.
  window.addEventListener('blur', () => game.clearInput());
}

function draw() {
  // deltaTime is in ms. A lag spike or a background tab can't
  // teleport players through walls.
  const dt = Math.min(deltaTime / 1000, 1 / 20);
  game.update(dt);
  game.draw();
}

function keyPressed() {
  // Returning false stops the browser from scrolling with arrows/space.
  if (game.keyPressed(keyCode)) return false;
}

function keyReleased() {
  if (game.keyReleased(keyCode)) return false;
}
