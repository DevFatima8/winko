import {
  HORSES,
  RACE_DISTANCE,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  getRacePositions,
  type Horse,
  type RacePhase,
  type RacePlan,
} from "./derby";

type Point = readonly [number, number];

const INK = "#07101b";
const FONT: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "#": ["01010", "11111", "01010", "01010", "11111", "01010", "01010"],
  ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00100", "00100"],
  "/": ["00001", "00001", "00010", "00100", "01000", "10000", "10000"],
};

class Pixels {
  constructor(private ctx: CanvasRenderingContext2D, private ox = 0, private oy = 0) {}

  rect(x: number, y: number, width: number, height: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x + this.ox), Math.round(y + this.oy), Math.round(width), Math.round(height));
  }

  line(a: Point, b: Point, color = INK, width = 1) {
    let x0 = Math.round(a[0]);
    let y0 = Math.round(a[1]);
    const x1 = Math.round(b[0]);
    const y1 = Math.round(b[1]);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    const half = Math.floor(width / 2);

    for (;;) {
      this.rect(x0 - half, y0 - half, width, width, color);
      if (x0 === x1 && y0 === y1) break;
      const twice = error * 2;
      if (twice >= dy) { error += dy; x0 += sx; }
      if (twice <= dx) { error += dx; y0 += sy; }
    }
  }

  poly(points: readonly Point[], color: string, outline: string | null = INK) {
    const firstY = Math.floor(Math.min(...points.map((point) => point[1])));
    const lastY = Math.ceil(Math.max(...points.map((point) => point[1])));

    for (let y = firstY; y <= lastY; y++) {
      const at = y + 0.5;
      const crossings: number[] = [];
      points.forEach((a, index) => {
        const b = points[(index + 1) % points.length];
        if ((a[1] <= at && b[1] > at) || (b[1] <= at && a[1] > at)) {
          crossings.push(a[0] + ((at - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      });
      crossings.sort((a, b) => a - b);
      for (let index = 0; index < crossings.length; index += 2) {
        const x = Math.ceil(crossings[index] - 0.5);
        const end = Math.floor(crossings[index + 1] - 0.5);
        if (end >= x) this.rect(x, y, end - x + 1, 1, color);
      }
    }

    if (outline) points.forEach((point, index) => this.line(point, points[(index + 1) % points.length], outline));
  }

  text(text: string, x: number, y: number, color: string, scale = 1) {
    [...text.toUpperCase()].forEach((letter, letterIndex) => {
      const glyph = FONT[letter];
      if (!glyph) return;
      glyph.forEach((row, rowIndex) => {
        [...row].forEach((pixel, column) => {
          if (pixel === "1") this.rect(x + (letterIndex * 6 + column) * scale, y + rowIndex * scale, scale, scale, color);
        });
      });
    });
  }
}

function canvas(width: number, height: number): HTMLCanvasElement {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  return element;
}

function tree(ctx: CanvasRenderingContext2D, x: number, y: number, variant = 0) {
  const p = new Pixels(ctx, x, y);
  p.poly([[0, 31], [7, 28], [17, 30], [17, 34], [5, 35], [0, 34]], "#151665", null);
  p.poly([[9, 5], [10, 1], [12, 4], [15, 4], [15, 8], [18, 10], [16, 13], [20, 16], [18, 20], [20, 24], [15, 26], [13, 30], [8, 28], [5, 29], [4, 25], [1, 23], [3, 18], [0, 16], [4, 12], [3, 8], [6, 8]], "#9bdd24", "#123666");
  p.poly([[10, 3], [13, 6], [12, 10], [15, 12], [13, 16], [17, 19], [14, 21], [15, 25], [11, 25], [8, 21], [10, 18], [8, 15], [10, 12], [8, 8]], variant % 2 ? "#e0ed33" : "#c9ef2b", null);
  p.poly([[5, 10], [7, 13], [5, 17], [7, 20], [5, 23], [8, 26], [6, 28], [3, 25], [4, 21], [2, 17]], "#26ac3b", null);
  p.line([9, 20], [9, 32], "#153e48", 2);
  p.line([10, 24], [14, 19], "#153e48");
  p.line([8, 23], [5, 18], "#153e48");
  [[6, 9], [10, 7], [13, 12], [5, 15], [11, 16], [16, 20], [8, 25], [12, 23]].forEach(([px, py], index) => {
    p.rect(px, py, 2, 2, index % 2 ? "#ecf052" : "#52c640");
  });
}

function shrub(ctx: CanvasRenderingContext2D, x: number, y: number, big = false) {
  const p = new Pixels(ctx, x, y);
  if (big) {
    p.poly([[1, 10], [1, 5], [5, 1], [12, 0], [19, 3], [22, 9], [19, 17], [12, 19], [4, 17]], "#95da20", "#112958");
    p.poly([[3, 7], [5, 13], [9, 13], [11, 18], [4, 16], [1, 11]], "#074a83", null);
    p.poly([[8, 2], [12, 4], [12, 7], [18, 8], [17, 11], [12, 10], [9, 7]], "#e5ec30", null);
    p.line([8, 3], [13, 15], "#3c9440");
    p.rect(15, 4, 3, 2, "#bde926");
  } else {
    p.poly([[0, 7], [3, 2], [9, 0], [16, 2], [22, 5], [21, 10], [14, 12], [5, 11]], "#91d523", "#13256b");
    p.poly([[1, 7], [5, 6], [8, 10], [16, 10], [14, 12], [4, 10]], "#075b87", null);
    p.poly([[7, 2], [14, 2], [16, 6], [13, 8], [9, 6]], "#d7ec2e", null);
    p.rect(7, 4, 2, 3, "#eff454");
    p.rect(18, 5, 2, 2, "#3aa736");
  }
}

function flowers(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const p = new Pixels(ctx, x, y);
  p.poly([[0, 5], [3, 2], [7, 3], [10, 0], [15, 2], [19, 1], [24, 5], [23, 9], [1, 9]], "#f77a24", "#167132");
  p.line([4, 5], [18, 5], "#ed4124");
  p.rect(9, 3, 4, 2, "#ffa637");
}

function landscape(): HTMLCanvasElement {
  const image = canvas(512, SCREEN_HEIGHT);
  const ctx = image.getContext("2d")!;
  const p = new Pixels(ctx);
  p.rect(0, 63, 512, 83, "#25c441");
  p.rect(0, 146, 512, 108, "#c69e49");
  p.rect(0, 254, 512, 17, "#b8a56b");
  p.rect(0, 271, 512, 26, "#25c441");

  const trees: [number, number][] = [
    [17, 67], [60, 75], [75, 64], [126, 62], [146, 74], [201, 51], [245, 45],
    [291, 66], [321, 76], [337, 68], [376, 49], [410, 66], [462, 77], [478, 65],
  ];
  trees.forEach(([x, y], index) => tree(ctx, x, y, index));
  p.rect(46, 109, 18, 4, "#142065");
  p.rect(57, 106, 13, 4, "#142065");
  flowers(ctx, 200, 104);
  flowers(ctx, -2, 132);
  flowers(ctx, 302, 132);
  p.rect(259, 103, 29, 10, "#397431");
  p.rect(260, 104, 26, 8, "#c2b342");
  p.rect(262, 106, 8, 5, "#e64c21");
  p.rect(274, 106, 7, 5, "#ae241c");
  p.rect(268, 106, 4, 2, "#f0d72d");

  p.rect(0, 124, 512, 5, INK);
  p.rect(0, 125, 512, 3, "#f8f3d0");
  p.rect(0, 144, 512, 3, "#1b5636");
  p.rect(0, 144, 512, 1, "#f0ddac");
  for (let x = 74; x < 540; x += 129) {
    p.line([x + 7, 127], [x + 2, 133], INK, 4);
    p.line([x + 2, 133], [x + 2, 146], INK, 4);
    p.line([x + 7, 127], [x + 2, 133], "#eeeccc", 2);
    p.line([x + 2, 133], [x + 2, 145], "#eeeccc", 2);
  }
  shrub(ctx, 214, 131);
  shrub(ctx, 242, 130);
  flowers(ctx, 291, 263);
  flowers(ctx, 342, 263);
  shrub(ctx, 43, 271, true);
  shrub(ctx, 66, 261);
  shrub(ctx, 118, 277);
  shrub(ctx, 146, 276);
  shrub(ctx, 170, 263);
  shrub(ctx, 194, 261);
  shrub(ctx, 231, 270, true);
  shrub(ctx, 303, 272, true);
  shrub(ctx, 433, 269, true);
  shrub(ctx, 454, 260);
  shrub(ctx, 500, 278);
  return image;
}

function frontFence(ctx: CanvasRenderingContext2D, camera: number) {
  const p = new Pixels(ctx);
  p.rect(0, 251, 480, 5, INK);
  p.rect(0, 252, 480, 3, "#f8f0d3");
  const offset = ((Math.round(camera) % 131) + 131) % 131;
  for (let x = -offset; x < 490; x += 131) {
    p.line([x + 8, 255], [x + 2, 260], INK, 4);
    p.line([x + 2, 260], [x + 2, 270], INK, 4);
    p.line([x + 8, 255], [x + 2, 260], "#f7f0d1", 2);
    p.line([x + 2, 260], [x + 2, 269], "#f7f0d1", 2);
  }
  p.rect(0, 270, 480, 1, "#7b713c");
}

function startingGates(): HTMLCanvasElement {
  const image = canvas(220, 260);
  const ctx = image.getContext("2d")!;
  for (let id = 6; id >= 1; id--) {
    const x = 58 + (id - 1) * 21;
    const y = 160 - (id - 1) * 17;
    const p = new Pixels(ctx, x, y);
    p.poly([[-9, 6], [-2, 5], [-2, 91 - (id - 1) * 3], [-9, 93 - (id - 1) * 3]], "#b7e4e8");
    p.line([-7, 8], [-7, 89 - (id - 1) * 3], "#edf7ef", 2);
    p.poly([[0, 2], [19, -13], [19, 32], [0, 47]], "#aed6de");
    p.poly([[0, 2], [19, -13], [19, 5], [0, 20]], "#f2f07c");
    p.text(String(id), 7, 0, INK, 1);
    for (let row = 0; row < 5; row++) {
      p.line([3, 25 + row * 4], [16, 25 + row * 4], "#213654", 2);
      p.line([3, 24 + row * 4], [16, 24 + row * 4], "#e8f0ed");
    }
    p.rect(19, -15, 5, 66, INK);
    p.rect(20, -14, 3, 64, "#96d0d2");
    p.rect(20, -14, 1, 63, "#e6f5ec");
    if (id === 6) p.poly([[12, 58], [26, 58], [30, 62], [6, 63]], "#18372a", null);
  }
  return image;
}

function official(ctx: CanvasRenderingContext2D, x: number, waving: boolean, time: number) {
  const p = new Pixels(ctx, x, 0);
  const wave = waving ? Math.round(Math.sin(time * 7) * 2) : 0;
  p.line([155, 194], [155, 231], "#684928", 2);
  p.poly([[158, 195], [168, 200 + wave], [176, 201 + wave], [186, 207 + wave], [177, 212], [158, 216]], "#f32828");
  p.poly([[142, 212], [149, 212], [151, 217], [149, 226], [141, 226], [139, 219]], "#ecc07b");
  p.poly([[138, 215], [142, 211], [150, 211], [153, 215], [153, 218], [139, 218]], "#e2b85e");
  p.line([141, 215], [149, 215], "#8b762f");
  p.rect(149, 220, 2, 2, INK);
  p.poly([[137, 229], [144, 226], [149, 230], [151, 229], [154, 220], [158, 220], [157, 234], [151, 239], [131, 240], [131, 235]], "#e4be77");
  p.poly([[130, 238], [143, 238], [150, 231], [161, 228], [161, 247], [150, 255], [129, 255]], "#a5e4e7");
  p.line([146, 239], [146, 253], "#368597");
  p.poly([[132, 255], [142, 255], [136, 267], [124, 271], [122, 268]], "#d7eddb");
  p.poly([[146, 254], [153, 254], [152, 269], [146, 271], [144, 266]], "#d7eddb");
  p.line([122, 271], [131, 271], INK, 2);
  p.line([145, 271], [153, 271], INK, 2);
}

const REAR_KNEES: Point[] = [[15, 52], [21, 55], [30, 53], [34, 46], [28, 49], [20, 48], [16, 46], [12, 49]];
const REAR_FEET: Point[] = [[8, 63], [17, 65], [38, 60], [42, 50], [30, 60], [12, 54], [5, 47], [4, 57]];
const FRONT_KNEES: Point[] = [[62, 46], [65, 53], [58, 57], [48, 55], [46, 48], [50, 46], [56, 44], [62, 43]];
const FRONT_FEET: Point[] = [[76, 48], [71, 61], [53, 65], [42, 62], [38, 48], [48, 52], [65, 50], [75, 43]];

function sprite(horse: Horse, frame: number): HTMLCanvasElement {
  const image = canvas(88, 72);
  const ctx = image.getContext("2d")!;
  const bob = [1, 0, -1, -1, 0, 1, 2, 1][frame];
  const p = new Pixels(ctx, 0, bob + 2);

  function leg(front: boolean, offset: number, dark = false) {
    const index = (frame + offset) % 8;
    const hip: Point = front ? [54, 41] : [24, 42];
    const knee = front ? FRONT_KNEES[index] : REAR_KNEES[index];
    const foot = front ? FRONT_FEET[index] : REAR_FEET[index];
    p.line(hip, knee, INK, 5);
    p.line(knee, foot, INK, 4);
    p.line(hip, knee, dark ? horse.shadow : horse.coat, 3);
    p.line(knee, foot, dark ? horse.shadow : horse.coat, 2);
    p.rect(foot[0] - 2, foot[1] - 1, 5, 2, INK);
  }

  leg(false, 4, true);
  leg(true, 3, true);
  const tailLift = frame < 4 ? 1 : -2;
  p.poly([[21, 33], [14, 32], [9, 33 + tailLift], [3, 29 + tailLift], [0, 30 + tailLift], [3, 35 + tailLift], [9, 37 + tailLift], [18, 37]], "#16111e");
  p.line([1, 31 + tailLift], [8, 33 + tailLift], "#554044");
  p.poly([[16, 35], [20, 30], [29, 28], [39, 29], [47, 32], [56, 29], [61, 34], [61, 41], [53, 47], [39, 49], [26, 47], [18, 43]], horse.coat);
  p.poly([[20, 39], [24, 44], [35, 45], [40, 48], [27, 46], [20, 43]], horse.shadow, null);
  p.poly([[25, 30], [38, 31], [44, 34], [38, 34], [28, 32], [21, 34]], horse.highlight, null);
  leg(false, 0);
  leg(true, 0);

  const toss = frame === 2 || frame === 3 ? -1 : 0;
  const head: Point[] = [[51, 35], [57, 29], [60, 22 + toss], [63, 17 + toss], [69, 19 + toss], [75, 19 + toss], [82, 24 + toss], [84, 29 + toss], [81, 32 + toss], [75, 31 + toss], [71, 27 + toss], [66, 29 + toss], [63, 40], [58, 45], [53, 42]];
  p.poly(head, horse.coat);
  p.poly([[56, 30], [59, 22 + toss], [62, 18 + toss], [64, 20 + toss], [61, 27], [59, 36]], horse.shadow, null);
  p.poly([[63, 19 + toss], [61, 12 + toss], [64, 12 + toss], [68, 20 + toss]], horse.coat);
  p.poly([[70, 20 + toss], [72, 15 + toss], [74, 16 + toss], [74, 21 + toss]], horse.coat);
  p.poly([[54, 31], [58, 22 + toss], [61, 17 + toss], [64, 19 + toss], [62, 23], [59, 30]], "#17101b");
  p.rect(75, 23 + toss, 2, 2, INK);
  p.rect(81, 28 + toss, 2, 1, INK);
  p.line([69, 20 + toss], [77, 31 + toss], "#121536", 2);
  p.line([76, 30 + toss], [55, 26], INK);
  p.line([71, 22 + toss], [74, 26 + toss], horse.highlight);

  p.poly([[24, 29], [39, 28], [40, 40], [25, 43]], "#f5f36f");
  p.rect(26, 31, 11, 10, "#f8f578");
  p.text(String(horse.id), 29, 32, "#070b10");
  p.line([39, 29], [38, 42], "#5d5937");

  const lean = frame === 3 || frame === 4 ? 1 : 0;
  p.poly([[31, 24], [38, 23], [44, 27], [43, 32], [36, 36], [36, 40], [31, 41], [29, 37], [33, 30], [29, 28]], "#f0ece6");
  p.line([37, 28], [34, 35], "#9096a6");
  p.poly([[31, 37], [36, 37], [37, 42], [32, 44], [27, 43], [27, 41]], "#1b2035");
  p.poly([[28, 19], [31, 13], [38 + lean, 11], [44 + lean, 14], [47, 20], [42, 25], [35, 28], [30, 25]], horse.jersey);
  p.poly([[31, 14], [34, 13], [39, 21], [36, 24], [31, 20]], horse.id === 1 ? "#e94429" : "#f4efdd", null);
  p.poly([[41 + lean, 9], [45 + lean, 8], [50 + lean, 10], [51 + lean, 14], [47 + lean, 17], [42 + lean, 14]], "#e7bb82");
  p.poly([[38 + lean, 8], [39 + lean, 4], [43 + lean, 2], [48 + lean, 3], [52 + lean, 7], [52 + lean, 10], [39 + lean, 10]], horse.helmet);
  p.line([41 + lean, 5], [47 + lean, 5], "#f5ecdb", 2);
  p.rect(48 + lean, 11, 2, 2, INK);
  p.poly([[42, 18], [46, 19], [49, 23], [56, 23], [57, 26], [48, 27], [40, 22]], horse.jersey);
  p.rect(55, 23, 4, 3, "#e6bb83");
  p.line([31, 18], [25 + (frame % 3), 2], "#5c2635");
  p.line([25 + (frame % 3), 2], [26 + (frame % 3), 0], "#a74631");
  return image;
}

export function drawHorsePortrait(ctx: CanvasRenderingContext2D, horse: Horse) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite(horse, 0), 0, 0);
}

export type RunnerLocation = { id: number; x: number; y: number; width: number; height: number; frame: number };

export type TrackSnapshot = {
  phase: RacePhase;
  progress: number;
  time: number;
  plan: RacePlan | null;
  countdown: number;
  selectedHorseId: number;
  animatePreview: boolean;
  reducedMotion: boolean;
};

const PACK: Record<number, { x: number; y: number; scale: number }> = {
  1: { x: 280, y: 216, scale: 1 },
  2: { x: 389, y: 232, scale: 1 },
  3: { x: 292, y: 249, scale: 1 },
  4: { x: 362, y: 210, scale: 0.94 },
  5: { x: 346, y: 194, scale: 0.88 },
  6: { x: 366, y: 179, scale: 0.81 },
};

export class PixelDerbyRenderer {
  private background = landscape();
  private gates = startingGates();
  private frames = new Map<number, HTMLCanvasElement[]>();

  constructor(private ctx: CanvasRenderingContext2D) {
    this.ctx.imageSmoothingEnabled = false;
    HORSES.forEach((horse) => this.frames.set(horse.id, Array.from({ length: 8 }, (_, frame) => sprite(horse, frame))));
  }

  draw(snapshot: TrackSnapshot): RunnerLocation[] {
    const { ctx } = this;
    const { phase, time, plan, progress, reducedMotion } = snapshot;
    const inRace = (phase === "racing" || phase === "result") && plan !== null;
    const raceProgress = phase === "result" ? 1 : progress;
    const positions = inRace ? getRacePositions(raceProgress, plan) : HORSES.map(() => 0);
    const camera = inRace ? Math.max(0, raceProgress * RACE_DISTANCE - 145) : 0;
    const animate = !reducedMotion && (phase === "racing" || (phase === "idle" && snapshot.animatePreview));
    const animationTime = animate ? time : 0;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 63, SCREEN_WIDTH, 234);
    ctx.clip();
    const offset = ((Math.floor(camera) % 512) + 512) % 512;
    ctx.drawImage(this.background, -offset, 0);
    ctx.drawImage(this.background, 512 - offset, 0);
    if (camera < 250) ctx.drawImage(this.gates, -Math.floor(camera), 0);

    if (inRace) {
      const finishX = Math.round(160 + RACE_DISTANCE + 64 - camera);
      if (finishX < 480) {
        const p = new Pixels(ctx);
        p.rect(finishX - 1, 146, 8, 105, INK);
        for (let y = 146; y < 251; y += 5) {
          p.rect(finishX, y, 3, 5, Math.floor((y - 146) / 5) % 2 ? "#222238" : "#fffae4");
          p.rect(finishX + 3, y, 3, 5, Math.floor((y - 146) / 5) % 2 ? "#fffae4" : "#222238");
        }
      }
    }

    const actors = HORSES.map((horse, index): RunnerLocation => {
      const pack = PACK[horse.id];
      const startX = 52 + index * 21;
      const startY = 249 - index * 14;
      let x = pack.x;
      let y = pack.y;
      if (phase === "countdown") {
        x = startX;
        y = startY;
      } else if (inRace) {
        const opening = Math.min(1, raceProgress / 0.12);
        const shift = opening * opening * (3 - 2 * opening);
        x = 160 + positions[index] * RACE_DISTANCE - camera + (startX - 160) * (1 - shift);
        y = startY + (pack.y - startY) * Math.min(1, raceProgress / 0.28);
      } else if (animate) {
        x += Math.round(Math.sin(time * 1.6 + index * 1.8) * 2);
      }
      return {
        id: horse.id,
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(88 * pack.scale),
        height: Math.round(72 * pack.scale),
        frame: Math.floor(animationTime * (phase === "racing" ? 12 : 10) + index * 1.7) % 8,
      };
    }).sort((a, b) => a.y - b.y);

    actors.forEach((actor) => {
      if (phase === "racing" && !reducedMotion) {
        const p = new Pixels(ctx);
        for (let particle = 0; particle < 3; particle++) {
          const drift = (time * 35 + particle * 8 + actor.id * 5) % 25;
          p.rect(actor.x + 8 - drift, actor.y - 3 - particle * 2, 3 - (particle % 2), 2, particle % 2 ? "#e0b467" : "#a6833e");
        }
      }
      const image = this.frames.get(actor.id)?.[actor.frame];
      if (image) ctx.drawImage(image, actor.x, actor.y - Math.round(actor.height * 0.92), actor.width, actor.height);
    });
    frontFence(ctx, camera);
    if (camera < 200) {
      const waveFlag = !reducedMotion && (phase === "countdown" || phase === "racing" || (phase === "idle" && snapshot.animatePreview));
      official(ctx, -Math.round(camera), waveFlag, time);
    }
    ctx.restore();

    const p = new Pixels(ctx);
    if (phase === "countdown") {
      const readyText = "READY TO RACE";
      p.text(readyText, (480 - readyText.length * 6) / 2, 22, "#f5ee80");
      p.text(String(snapshot.countdown), 231, 42, "#ffffff", 3);
    }
    if (phase === "racing" && plan) {
      p.text(`RACE ${String(plan.round).padStart(2, "0")}`, 15, 22, "#f6ed8b");
      const meters = `${Math.min(1200, Math.floor(raceProgress * 1200))} M`;
      p.text(meters, 465 - meters.length * 6, 22, "#f4f0df");
      p.text(`YOUR HORSE : ${snapshot.selectedHorseId}`, 15, 322, "#e9edab");
      const leading = HORSES.map((horse, index) => ({ id: horse.id, value: positions[index] })).sort((a, b) => b.value - a.value)[0];
      p.text(`LEADER : ${leading.id}`, 465 - 60, 322, "#f2ecd6");
    }
    if (phase === "result" && plan) {
      const winnerText = `WINNER : HORSE ${plan.winnerId}`;
      p.text(winnerText, (480 - winnerText.length * 12) / 2, 24, "#fbf281", 2);
      const resultText = plan.stake <= 0 ? "NEXT RACE STARTING SOON" : plan.playerWon ? "YOU WIN!" : "BETTER LUCK NEXT RACE";
      p.text(resultText, (480 - resultText.length * 6) / 2, 323, plan.playerWon ? "#9cec6c" : "#f0eeee");
    }
    return actors;
  }
}
