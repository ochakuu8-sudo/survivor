import { TAU } from "./constants.js";
import { makeRng } from "./utils/math.js";

function drawPixelGlow(ctx, w, h, rgb) {
  ctx.fillStyle = `rgba(${rgb}, 0.08)`;
  ctx.fillRect(8, 8, w - 16, h - 16);
  ctx.fillStyle = `rgba(${rgb}, 0.14)`;
  ctx.fillRect(18, 18, w - 36, h - 36);
  ctx.fillStyle = `rgba(${rgb}, 0.22)`;
  ctx.fillRect(30, 30, w - 60, h - 60);
}

function drawOutlinedSprite(ctx, w, h, draw, outline, outlineColor) {
  const source = document.createElement("canvas");
  source.width = w;
  source.height = h;
  const sourceCtx = source.getContext("2d");
  sourceCtx.imageSmoothingEnabled = false;
  draw(sourceCtx, w, h);

  const mask = document.createElement("canvas");
  mask.width = w;
  mask.height = h;
  const maskCtx = mask.getContext("2d");
  maskCtx.imageSmoothingEnabled = false;
  maskCtx.drawImage(source, 0, 0);
  maskCtx.globalCompositeOperation = "source-in";
  maskCtx.fillStyle = outlineColor;
  maskCtx.fillRect(0, 0, w, h);

  ctx.drawImage(mask, -outline, 0);
  ctx.drawImage(mask, outline, 0);
  ctx.drawImage(mask, 0, -outline);
  ctx.drawImage(mask, 0, outline);
  ctx.drawImage(source, 0, 0);
}

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawPixelBullet(ctx) {
  ctx.fillStyle = "rgba(255, 228, 107, 0.28)";
  ctx.fillRect(0, 6, 18, 8);
  ctx.fillStyle = "#fff3c4";
  ctx.fillRect(16, 4, 24, 12);
  ctx.fillStyle = "#ff7a5c";
  ctx.fillRect(36, 6, 8, 8);
  ctx.fillStyle = "#ff5d96";
  ctx.fillRect(42, 8, 4, 4);
}

function drawPixelStone(ctx, w, h) {
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  px(ctx, cx - 9, cy + 6, 18, 3, "rgba(35, 25, 76, 0.34)");
  px(ctx, cx - 11, cy - 3, 22, 9, "#3d3326");
  px(ctx, cx - 10, cy - 5, 20, 2, "#3d3326");
  px(ctx, cx - 9, cy + 5, 18, 1, "#2c2218");
  px(ctx, cx - 10, cy - 3, 20, 7, "#5e5443");
  px(ctx, cx - 9, cy - 4, 18, 1, "#5e5443");
  px(ctx, cx - 9, cy - 3, 18, 4, "#7d6f57");
  px(ctx, cx - 7, cy - 4, 14, 1, "#7d6f57");
  px(ctx, cx - 7, cy - 3, 12, 2, "#9b8a6f");
  px(ctx, cx - 4, cy - 4, 8, 1, "#9b8a6f");
  px(ctx, cx - 4, cy - 3, 5, 1, "#d2bd97");
  px(ctx, cx + 1, cy - 3, 2, 1, "#d2bd97");
  px(ctx, cx - 5, cy + 1, 7, 1, "#2c2218");
  px(ctx, cx + 3, cy + 2, 4, 1, "#2c2218");
  px(ctx, cx - 9, cy + 3, 18, 2, "#2a1f15");
  px(ctx, cx - 11, cy - 1, 1, 4, "#241b13");
  px(ctx, cx + 10, cy - 1, 1, 4, "#241b13");
}

function drawPixelGoldCoin(ctx, w, h) {
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  px(ctx, cx - 11, cy + 12, 22, 4, "rgba(50, 83, 38, 0.25)");
  px(ctx, cx - 10, cy - 8, 20, 20, "#8a5a1e");
  px(ctx, cx - 12, cy - 6, 24, 16, "#8a5a1e");
  px(ctx, cx - 8, cy - 10, 16, 24, "#8a5a1e");
  px(ctx, cx - 9, cy - 7, 18, 18, "#d99524");
  px(ctx, cx - 11, cy - 5, 22, 14, "#d99524");
  px(ctx, cx - 7, cy - 9, 14, 22, "#d99524");
  px(ctx, cx - 6, cy - 6, 12, 14, "#ffe46b");
  px(ctx, cx - 8, cy - 4, 16, 10, "#ffe46b");
  px(ctx, cx - 4, cy - 8, 8, 18, "#ffe46b");
  px(ctx, cx - 4, cy - 4, 8, 8, "#b9791d");
  px(ctx, cx - 5, cy - 2, 10, 4, "#b9791d");
  px(ctx, cx - 2, cy - 5, 4, 10, "#b9791d");
  px(ctx, cx - 3, cy - 3, 6, 6, "#ffd451");
  px(ctx, cx - 6, cy - 9, 8, 3, "#fff3a0");
  px(ctx, cx - 9, cy - 4, 4, 6, "#fff3a0");
  px(ctx, cx + 6, cy + 7, 4, 3, "#a96718");
}

function drawPixelWalkDust(ctx, w, h) {
  ctx.fillStyle = "rgba(35, 25, 76, 0.22)";
  ctx.fillRect(6, 13, 22, 5);
  ctx.fillStyle = "rgba(157, 247, 255, 0.24)";
  ctx.fillRect(8, 10, 8, 4);
  ctx.fillRect(19, 9, 7, 4);
  ctx.fillStyle = "rgba(255, 243, 196, 0.22)";
  ctx.fillRect(14, 7, 8, 4);
}

function drawPixelTrash(ctx, w, h) {
  const x = w / 2 - 16;
  const y = h / 2 - 13;
  px(ctx, x + 2, y + 25, 30, 7, "rgba(50, 83, 38, 0.26)");
  px(ctx, x + 2, y + 10, 25, 16, "#6d7e5a");
  px(ctx, x + 8, y + 4, 20, 22, "#8b9270");
  px(ctx, x + 13, y + 8, 12, 5, "#b5b38a");
  px(ctx, x + 5, y + 20, 7, 4, "#4f623e");
  px(ctx, x + 23, y + 18, 9, 5, "#516e3a");
  px(ctx, x - 1, y + 25, 9, 4, "#5fb74d");
  px(ctx, x + 24, y + 25, 10, 4, "#68c55a");
}

function drawPixelSign(ctx, w, h) {
  const x = w / 2;
  const y = h / 2;
  px(ctx, x - 24, y + 22, 48, 8, "rgba(50, 83, 38, 0.28)");
  px(ctx, x - 25, y + 2, 50, 23, "#4f9f3d");
  px(ctx, x - 19, y - 5, 38, 24, "#62bd4f");
  px(ctx, x - 12, y - 12, 24, 20, "#78d35c");
  px(ctx, x - 19, y + 10, 38, 6, "#3e8233");
  px(ctx, x - 16, y - 4, 6, 6, "#fff270");
  px(ctx, x + 11, y - 2, 6, 6, "#fff270");
  px(ctx, x - 3, y - 9, 6, 6, "#ff8aa0");
  px(ctx, x + 3, y + 5, 6, 6, "#b7ecff");
}

function drawPixelCar(ctx, w, h) {
  const x = w / 2 - 36;
  const y = h / 2 - 18;
  px(ctx, x + 3, y + 40, 72, 8, "rgba(50, 83, 38, 0.28)");
  px(ctx, x + 5, y + 14, 66, 22, "#8a5a2a");
  px(ctx, x + 10, y + 10, 58, 8, "#a56e35");
  px(ctx, x + 13, y + 7, 52, 6, "#c88f4d");
  px(ctx, x + 8, y + 33, 62, 5, "#61401d");
  px(ctx, x + 2, y + 15, 7, 19, "#6b451f");
  px(ctx, x + 69, y + 15, 7, 19, "#6b451f");
  px(ctx, x + 17, y + 19, 10, 5, "#d8ac62");
  px(ctx, x + 36, y + 18, 12, 5, "#d8ac62");
  px(ctx, x + 55, y + 20, 9, 5, "#d8ac62");
}

function drawPixelFieldBoulder(ctx, w, h) {
  const x = w / 2 - 34;
  const y = h / 2 - 22;
  px(ctx, x + 3, y + 39, 66, 10, "rgba(50, 83, 38, 0.3)");
  px(ctx, x + 2, y + 18, 22, 21, "#5f6b54");
  px(ctx, x + 18, y + 10, 33, 30, "#7d866b");
  px(ctx, x + 42, y + 19, 26, 21, "#647158");
  px(ctx, x + 22, y + 14, 23, 7, "#a9ad8b");
  px(ctx, x + 9, y + 22, 11, 5, "#889073");
  px(ctx, x + 48, y + 24, 13, 5, "#8e9677");
  px(ctx, x + 16, y + 36, 48, 5, "#48573e");
  px(ctx, x - 2, y + 38, 14, 6, "#60b94e");
  px(ctx, x + 57, y + 38, 12, 6, "#73cc5a");
  px(ctx, x + 5, y + 34, 4, 4, "#fff270");
  px(ctx, x + 62, y + 34, 4, 4, "#ff8aa0");
}

function drawPixelFieldLog(ctx, w, h) {
  const x = w / 2 - 39;
  const y = h / 2 - 18;
  px(ctx, x + 4, y + 39, 76, 9, "rgba(50, 83, 38, 0.28)");
  px(ctx, x + 8, y + 16, 62, 19, "#8a5a2a");
  px(ctx, x + 13, y + 10, 56, 9, "#b27736");
  px(ctx, x + 4, y + 19, 13, 16, "#6b451f");
  px(ctx, x + 66, y + 17, 14, 19, "#6b451f");
  px(ctx, x + 8, y + 22, 6, 6, "#d6ad65");
  px(ctx, x + 70, y + 22, 6, 7, "#d6ad65");
  px(ctx, x + 23, y + 21, 12, 4, "#c98d45");
  px(ctx, x + 46, y + 22, 13, 4, "#65411e");
  px(ctx, x + 16, y + 35, 45, 4, "#4f3519");
  px(ctx, x + 1, y + 36, 14, 5, "#66bf53");
  px(ctx, x + 63, y + 36, 18, 5, "#7ed968");
}

function drawPixelFieldBush(ctx, w, h) {
  const x = w / 2;
  const y = h / 2;
  px(ctx, x - 35, y + 23, 70, 9, "rgba(50, 83, 38, 0.27)");
  px(ctx, x - 31, y + 2, 62, 24, "#3f9135");
  px(ctx, x - 22, y - 10, 46, 30, "#5bbb46");
  px(ctx, x - 12, y - 19, 28, 24, "#79d65c");
  px(ctx, x - 28, y + 13, 54, 8, "#32772d");
  px(ctx, x - 20, y - 5, 9, 8, "#8be56b");
  px(ctx, x + 11, y - 7, 9, 8, "#8be56b");
  px(ctx, x - 4, y - 16, 8, 7, "#a5ee74");
  px(ctx, x - 23, y + 4, 5, 5, "#fff270");
  px(ctx, x + 20, y + 1, 5, 5, "#fff270");
  px(ctx, x - 2, y - 7, 5, 5, "#ff8aa0");
  px(ctx, x + 7, y + 9, 5, 5, "#b7ecff");
}

function drawPixelFieldFence(ctx, w, h) {
  const x = w / 2 - 42;
  const y = h / 2 - 20;
  px(ctx, x + 3, y + 42, 82, 7, "rgba(50, 83, 38, 0.27)");
  px(ctx, x + 10, y + 10, 9, 34, "#7a4f1b");
  px(ctx, x + 38, y + 6, 9, 38, "#8a5a2a");
  px(ctx, x + 66, y + 13, 9, 31, "#7a4f1b");
  px(ctx, x + 4, y + 17, 76, 8, "#b27736");
  px(ctx, x + 2, y + 30, 78, 8, "#9a672f");
  px(ctx, x + 8, y + 17, 65, 3, "#d4a05b");
  px(ctx, x + 8, y + 30, 68, 3, "#c88f4d");
  px(ctx, x + 15, y + 39, 16, 5, "#67bd4f");
  px(ctx, x + 57, y + 39, 20, 5, "#7ed968");
  px(ctx, x + 30, y + 36, 4, 4, "#fff270");
}

function drawPixelFieldFlowers(ctx, w, h) {
  const x = w / 2;
  const y = h / 2;
  px(ctx, x - 27, y + 15, 54, 8, "rgba(50, 83, 38, 0.18)");
  px(ctx, x - 24, y + 4, 13, 13, "#5ebd4d");
  px(ctx, x - 4, y - 3, 18, 17, "#74d85f");
  px(ctx, x + 14, y + 4, 13, 13, "#56ad49");
  px(ctx, x - 18, y + 0, 5, 5, "#fff270");
  px(ctx, x + 2, y - 7, 5, 5, "#ff8aa0");
  px(ctx, x + 19, y + 0, 5, 5, "#b7ecff");
  px(ctx, x - 6, y + 8, 5, 5, "#fff270");
}

function drawPixelFieldTree(ctx, w, h) {
  const x = w / 2;
  const y = h / 2;
  px(ctx, x - 32, y + 39, 64, 10, "rgba(50, 83, 38, 0.3)");
  px(ctx, x - 8, y + 5, 16, 42, "#7a4f1b");
  px(ctx, x - 5, y + 7, 8, 38, "#a56e35");
  px(ctx, x - 14, y + 27, 28, 6, "#5f3a18");
  px(ctx, x - 34, y - 18, 68, 36, "#2f8833");
  px(ctx, x - 25, y - 38, 52, 42, "#48a63c");
  px(ctx, x - 13, y - 50, 34, 34, "#68c653");
  px(ctx, x - 37, y - 5, 18, 20, "#3f9a36");
  px(ctx, x + 20, y - 8, 20, 23, "#3c8d35");
  px(ctx, x - 23, y - 29, 12, 9, "#7bdc60");
  px(ctx, x + 10, y - 39, 11, 8, "#8de66b");
  px(ctx, x - 3, y - 16, 13, 8, "#5fbd4a");
  px(ctx, x - 21, y + 43, 14, 5, "#6bc356");
  px(ctx, x + 10, y + 43, 18, 5, "#7bdc60");
  px(ctx, x - 29, y - 11, 5, 5, "#fff270");
  px(ctx, x + 29, y - 1, 5, 5, "#ff8aa0");
}

function drawPixelPlayer(ctx, w, h, step = 0) {
  const x = w / 2 - 20;
  const y = h / 2 - 30 + (step === 0 ? 0 : -1);
  const leftLift = step < 0 ? -1 : step > 0 ? 2 : 0;
  const rightLift = step > 0 ? -1 : step < 0 ? 2 : 0;
  const leftShift = step < 0 ? -2 : step > 0 ? 1 : 0;
  const rightShift = step > 0 ? 2 : step < 0 ? -1 : 0;
  const leftArmLift = step < 0 ? 2 : step > 0 ? -2 : 0;
  const rightArmLift = step > 0 ? 2 : step < 0 ? -2 : 0;
  px(ctx, x + 2, y + 56, 36, 7, "rgba(35, 25, 76, 0.26)");
  px(ctx, x + 5, y + 9, 30, 22, "#f4bf91");
  px(ctx, x + 3, y + 3, 30, 9, "#2b184c");
  px(ctx, x + 8, y - 1, 19, 7, "#2b184c");
  px(ctx, x + 4, y + 10, 8, 9, "#2b184c");
  px(ctx, x + 24, y + 9, 11, 6, "#2b184c");
  px(ctx, x + 9, y + 15, 7, 2, "#5b3761");
  px(ctx, x + 24, y + 15, 7, 2, "#5b3761");
  px(ctx, x + 10, y + 18, 4, 4, "#201653");
  px(ctx, x + 26, y + 18, 4, 4, "#201653");
  px(ctx, x + 19, y + 20, 3, 5, "#c78163");
  px(ctx, x + 15, y + 27, 10, 2, "#7c4b37");
  px(ctx, x + 5, y + 31, 30, 27, "#a94424");
  px(ctx, x + 9, y + 31, 22, 25, "#e17332");
  px(ctx, x + 13, y + 31, 14, 24, "#d8d0b0");
  px(ctx, x + 5, y + 39, 30, 6, "#742f27");
  px(ctx, x + 9, y + 35, 5, 19, "#5a2825");
  px(ctx, x + 26, y + 35, 5, 19, "#5a2825");
  px(ctx, x + 16, y + 35, 8, 5, "#fff3c4");
  px(ctx, x + 15, y + 45, 4, 4, "#5a2825");
  px(ctx, x + 23, y + 50, 5, 3, "#8b5a1f");
  px(ctx, x + 0, y + 33 + leftArmLift, 8, 21, "#a94424");
  px(ctx, x + 32, y + 33 + rightArmLift, 8, 21, "#a94424");
  px(ctx, x + 1, y + 51 + leftArmLift, 7, 3, "#d8d0b0");
  px(ctx, x + 32, y + 51 + rightArmLift, 7, 3, "#d8d0b0");
  px(ctx, x + 1, y + 54 + leftArmLift, 7, 4, "#f4bf91");
  px(ctx, x + 32, y + 54 + rightArmLift, 7, 4, "#f4bf91");
  px(ctx, x + 33, y + 45, 5, 8, "#742f27");
  px(ctx, x + 9 + leftShift, y + 56 + leftLift, 9, 13, "#26345f");
  px(ctx, x + 23 + rightShift, y + 56 + rightLift, 9, 13, "#26345f");
  px(ctx, x + 7 + leftShift, y + 66 + leftLift, 13, 4, "#2a2336");
  px(ctx, x + 21 + rightShift, y + 66 + rightLift, 13, 4, "#2a2336");
  px(ctx, x + 17, y + 47, 7, 5, "#3b2f3d");
}

function drawPixelZombie(ctx, w, h, skin, clothes, accent, scale = 1) {
  ctx.save();
  ctx.translate(w / 2, h / 2 + (scale - 1) * 12);
  ctx.scale(scale, scale);
  const x = -20;
  const y = -30;
  px(ctx, x + 2, y + 56, 36, 7, "rgba(35, 25, 76, 0.26)");
  px(ctx, x + 4, y + 9, 32, 22, skin);
  px(ctx, x + 0, y + 0, 20, 8, "#31461e");
  px(ctx, x + 8, y + 16, 6, 5, "#243012");
  px(ctx, x + 26, y + 16, 6, 5, "#243012");
  px(ctx, x + 14, y + 25, 18, 4, "#243012");
  px(ctx, x + 5, y + 31, 30, 27, clothes);
  px(ctx, x + 5, y + 40, 30, 7, accent);
  px(ctx, x - 10, y + 31, 13, 8, skin);
  px(ctx, x + 37, y + 35, 13, 8, skin);
  px(ctx, x + 9, y + 56, 9, 13, "#223064");
  px(ctx, x + 23, y + 56, 9, 13, "#223064");
  px(ctx, x + 6, y + 31, 6, 27, "#3f2a99");
  ctx.restore();
}

function drawPixelBone(ctx, w, h) {
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  px(ctx, cx - 12, cy - 4, 24, 8, "#3d3326");
  px(ctx, cx - 14, cy - 5, 4, 10, "#3d3326");
  px(ctx, cx + 10, cy - 5, 4, 10, "#3d3326");
  px(ctx, cx - 11, cy - 3, 22, 6, "#f4ecd8");
  px(ctx, cx - 13, cy - 4, 4, 8, "#f4ecd8");
  px(ctx, cx + 9, cy - 4, 4, 8, "#f4ecd8");
  px(ctx, cx - 9, cy - 3, 18, 1, "#fdf8e4");
  px(ctx, cx - 12, cy - 4, 2, 2, "#fdf8e4");
  px(ctx, cx + 10, cy - 4, 2, 2, "#fdf8e4");
}

function drawPixelOrc(ctx, w, h) {
  const scale = 1.4;
  ctx.save();
  ctx.translate(w / 2, h / 2 + (scale - 1) * 14);
  ctx.scale(scale, scale);
  const x = -22;
  const y = -32;
  px(ctx, x + 2, y + 58, 40, 7, "rgba(35, 25, 76, 0.34)");
  px(ctx, x + 4, y + 9, 36, 22, "#5e8b3e");
  px(ctx, x + 4, y + 4, 36, 5, "#243012");
  px(ctx, x + 18, y, 8, 6, "#1a1208");
  px(ctx, x + 8, y + 13, 11, 2, "#3a2419");
  px(ctx, x + 25, y + 13, 11, 2, "#3a2419");
  px(ctx, x + 10, y + 16, 7, 6, "#0a0606");
  px(ctx, x + 27, y + 16, 7, 6, "#0a0606");
  px(ctx, x + 12, y + 18, 3, 2, "#ff5050");
  px(ctx, x + 29, y + 18, 3, 2, "#ff5050");
  px(ctx, x + 14, y + 25, 16, 4, "#0a0606");
  px(ctx, x + 14, y + 24, 3, 7, "#fff8d8");
  px(ctx, x + 27, y + 24, 3, 7, "#fff8d8");
  px(ctx, x + 5, y + 31, 34, 27, "#5d3812");
  px(ctx, x + 5, y + 40, 34, 5, "#a76732");
  px(ctx, x + 18, y + 40, 8, 5, "#1a1208");
  px(ctx, x + 2, y + 31, 8, 12, "#3a2419");
  px(ctx, x + 34, y + 31, 8, 12, "#3a2419");
  px(ctx, x - 6, y + 35, 12, 12, "#5e8b3e");
  px(ctx, x + 38, y + 35, 12, 12, "#5e8b3e");
  px(ctx, x - 8, y + 44, 10, 7, "#3a2419");
  px(ctx, x + 42, y + 38, 10, 8, "#3a2419");
  px(ctx, x + 47, y + 6, 5, 36, "#7a4f1b");
  px(ctx, x + 46, y + 6, 1, 36, "#3a2419");
  px(ctx, x + 52, y + 6, 1, 36, "#3a2419");
  px(ctx, x + 44, y - 4, 11, 14, "#5d3812");
  px(ctx, x + 43, y - 4, 1, 14, "#3a2419");
  px(ctx, x + 55, y - 4, 1, 14, "#3a2419");
  px(ctx, x + 44, y - 5, 11, 1, "#3a2419");
  px(ctx, x + 44, y + 10, 11, 1, "#3a2419");
  px(ctx, x + 47, y - 1, 2, 2, "#a76732");
  px(ctx, x + 50, y + 4, 2, 2, "#a76732");
  px(ctx, x + 10, y + 58, 10, 13, "#3a2419");
  px(ctx, x + 24, y + 58, 10, 13, "#3a2419");
  px(ctx, x + 8, y + 67, 13, 4, "#1a1208");
  px(ctx, x + 23, y + 67, 13, 4, "#1a1208");
  ctx.restore();
}

function drawPixelSkeleton(ctx, w, h) {
  ctx.save();
  ctx.translate(w / 2, h / 2);
  const x = -20;
  const y = -30;
  px(ctx, x + 2, y + 56, 36, 7, "rgba(35, 25, 76, 0.32)");
  px(ctx, x + 4, y + 9, 32, 22, "#eef2f7");
  px(ctx, x + 8, y + 5, 24, 4, "#eef2f7");
  px(ctx, x + 2, y + 11, 2, 16, "#cdd3df");
  px(ctx, x + 36, y + 11, 2, 16, "#cdd3df");
  px(ctx, x + 9, y + 15, 7, 8, "#0d1330");
  px(ctx, x + 24, y + 15, 7, 8, "#0d1330");
  px(ctx, x + 11, y + 17, 3, 3, "#7adaff");
  px(ctx, x + 26, y + 17, 3, 3, "#7adaff");
  px(ctx, x + 18, y + 22, 4, 5, "#0d1330");
  px(ctx, x + 11, y + 28, 18, 2, "#0d1330");
  px(ctx, x + 14, y + 28, 1, 2, "#eef2f7");
  px(ctx, x + 19, y + 28, 1, 2, "#eef2f7");
  px(ctx, x + 24, y + 28, 1, 2, "#eef2f7");
  px(ctx, x + 17, y + 31, 6, 3, "#cdd3df");
  px(ctx, x + 5, y + 34, 30, 22, "#dde3ed");
  px(ctx, x + 8, y + 37, 24, 1, "#0d1330");
  px(ctx, x + 8, y + 41, 24, 1, "#0d1330");
  px(ctx, x + 8, y + 45, 24, 1, "#0d1330");
  px(ctx, x + 8, y + 49, 24, 1, "#0d1330");
  px(ctx, x + 19, y + 34, 2, 22, "#5b6276");
  px(ctx, x + 7, y + 56, 26, 3, "#cdd3df");
  px(ctx, x + 9, y + 59, 8, 10, "#dde3ed");
  px(ctx, x + 23, y + 59, 8, 10, "#dde3ed");
  px(ctx, x - 6, y + 35, 11, 4, "#dde3ed");
  px(ctx, x + 35, y + 35, 11, 4, "#dde3ed");
  px(ctx, x + 38, y + 28, 2, 18, "#9e6a25");
  px(ctx, x + 36, y + 26, 2, 3, "#7a4f1b");
  px(ctx, x + 36, y + 45, 2, 3, "#7a4f1b");
  px(ctx, x + 39, y + 30, 1, 14, "#a3bcd6");
  ctx.restore();
}

export function buildAtlas() {
  const specs = [];
  const add = (name, width, height, draw) => specs.push({ name, width, height, draw });

  add("white", 4, 4, (ctx, w, h) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  });

  add("shadow", 72, 36, (ctx, w, h) => {
    ctx.fillStyle = "rgba(17, 12, 43, 0.42)";
    ctx.fillRect(12, 14, w - 24, 10);
    ctx.fillStyle = "rgba(17, 12, 43, 0.32)";
    ctx.fillRect(4, 18, w - 8, 8);
    ctx.fillStyle = "rgba(17, 12, 43, 0.2)";
    ctx.fillRect(18, 8, w - 36, 4);
  });

  add("glowCyan", 96, 96, (ctx, w, h) => drawPixelGlow(ctx, w, h, "85, 246, 199"));
  add("glowRed", 96, 96, (ctx, w, h) => drawPixelGlow(ctx, w, h, "255, 93, 150"));
  add("glowEnemyRed", 96, 96, (ctx, w, h) => drawPixelGlow(ctx, w, h, "255, 42, 42"));
  add("glowAmber", 96, 96, (ctx, w, h) => drawPixelGlow(ctx, w, h, "255, 228, 107"));

  add("road", 96, 96, (ctx, w, h) => {
    const rng = makeRng(31);
    ctx.fillStyle = "#76c85c";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#6fbd52";
    for (let y = 0; y < h; y += 24) ctx.fillRect(0, y + 20, w, 3);
    ctx.fillStyle = "#8bdd68";
    for (let i = 0; i < 34; i += 1) {
      const x = Math.floor(rng() * 12) * 8;
      const y = Math.floor(rng() * 12) * 8;
      ctx.fillRect(x, y + 2, 3, 8);
      ctx.fillRect(x + 3, y, 3, 6);
    }
    ctx.fillStyle = "#5da548";
    for (let i = 0; i < 12; i += 1) ctx.fillRect(Math.floor(rng() * 12) * 8, Math.floor(rng() * 12) * 8, 8, 3);
  });

  add("lane", 96, 96, (ctx, w, h) => {
    const rng = makeRng(44);
    ctx.fillStyle = "#78c95b";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#b98348";
    ctx.fillRect(0, 34, w, 25);
    ctx.fillStyle = "#d3a05e";
    ctx.fillRect(0, 38, w, 6);
    ctx.fillRect(0, 52, w, 4);
    ctx.fillStyle = "#8bd568";
    for (let i = 0; i < 22; i += 1) ctx.fillRect(Math.floor(rng() * 12) * 8, Math.floor(rng() * 12) * 8, 5, 7);
    ctx.fillStyle = "#8a6237";
    for (let i = 0; i < 9; i += 1) ctx.fillRect(Math.floor(rng() * 12) * 8, 40 + Math.floor(rng() * 2) * 8, 7, 3);
  });

  add("sidewalk", 96, 96, (ctx, w, h) => {
    const rng = makeRng(59);
    ctx.fillStyle = "#8bd767";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#6fbd54";
    for (let x = 0; x < w; x += 24) ctx.fillRect(x + 2, 0, 3, h);
    for (let y = 0; y < h; y += 24) ctx.fillRect(0, y + 2, w, 3);
    ctx.fillStyle = "#a6e678";
    for (let i = 0; i < 18; i += 1) {
      const x = Math.floor(rng() * 12) * 8;
      const y = Math.floor(rng() * 12) * 8;
      ctx.fillRect(x, y + 2, 4, 4);
      ctx.fillRect(x + 4, y, 4, 4);
    }
  });

  add("pavement", 96, 96, (ctx, w, h) => {
    const rng = makeRng(73);
    ctx.fillStyle = "#67b94e";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#5aa742";
    for (let x = 0; x < w; x += 16) ctx.fillRect(x, 0, 2, h);
    for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 2);
    ctx.fillStyle = "#7dd35d";
    for (let i = 0; i < 18; i += 1) {
      ctx.fillRect(Math.floor(rng() * 11) * 8, Math.floor(rng() * 11) * 8, 8, 4);
    }
    ctx.fillStyle = "#f9de58";
    for (let i = 0; i < 5; i += 1) ctx.fillRect(Math.floor(rng() * 11) * 8 + 2, Math.floor(rng() * 11) * 8 + 2, 4, 4);
  });

  add("crosswalk", 96, 96, (ctx, w, h) => {
    ctx.fillStyle = "#83d763";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#c69a58";
    for (let y = 12; y < h; y += 18) ctx.fillRect(7, y, w - 14, 8);
    ctx.fillStyle = "#e6c17a";
    for (let y = 12; y < h; y += 18) ctx.fillRect(7, y, w - 14, 3);
    ctx.fillStyle = "#fff270";
    ctx.fillRect(18, 26, 5, 5);
    ctx.fillRect(70, 45, 5, 5);
    ctx.fillStyle = "#ff8aa0";
    ctx.fillRect(36, 67, 5, 5);
    ctx.fillRect(57, 16, 5, 5);
  });

  add("trash", 48, 48, (ctx, w, h) => {
    drawPixelTrash(ctx, w, h);
  });

  add("sign", 72, 72, (ctx, w, h) => {
    drawPixelSign(ctx, w, h);
  });

  add("car", 96, 72, (ctx, w, h) => {
    drawPixelCar(ctx, w, h);
  });

  add("fieldBoulder", 88, 68, (ctx, w, h) => {
    drawPixelFieldBoulder(ctx, w, h);
  });

  add("fieldLog", 96, 64, (ctx, w, h) => {
    drawPixelFieldLog(ctx, w, h);
  });

  add("fieldBush", 88, 72, (ctx, w, h) => {
    drawPixelFieldBush(ctx, w, h);
  });

  add("fieldFence", 96, 58, (ctx, w, h) => {
    drawPixelFieldFence(ctx, w, h);
  });

  add("fieldFlowers", 72, 50, (ctx, w, h) => {
    drawPixelFieldFlowers(ctx, w, h);
  });

  add("fieldTree", 96, 112, (ctx, w, h) => {
    drawPixelFieldTree(ctx, w, h);
  });

  add("player", 72, 72, (ctx, w, h) => {
    drawPixelPlayer(ctx, w, h);
  });
  add("playerReadable", 72, 72, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, drawPixelPlayer, 1, "rgba(17, 12, 43, 0.58)");
  });
  add("playerWalkAReadable", 72, 72, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, (target, width, height) => drawPixelPlayer(target, width, height, -1), 1, "rgba(17, 12, 43, 0.58)");
  });
  add("playerWalkBReadable", 72, 72, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, (target, width, height) => drawPixelPlayer(target, width, height, 1), 1, "rgba(17, 12, 43, 0.58)");
  });

  add("zombieA", 72, 72, (ctx, w, h) => drawPixelZombie(ctx, w, h, "#98f06e", "#5131a8", "#ff7a5c"));
  add("zombieB", 72, 72, (ctx, w, h) => drawPixelZombie(ctx, w, h, "#c5ff6b", "#f04d8b", "#ffe46b"));
  add("orc", 96, 96, (ctx, w, h) => drawPixelOrc(ctx, w, h));
  add("zombieAReadable", 72, 72, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, (target, width, height) => drawPixelZombie(target, width, height, "#98f06e", "#5131a8", "#ff7a5c"), 2, "rgba(222, 28, 45, 0.78)");
  });
  add("zombieBReadable", 72, 72, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, (target, width, height) => drawPixelZombie(target, width, height, "#c5ff6b", "#f04d8b", "#ffe46b"), 2, "rgba(235, 34, 48, 0.8)");
  });
  add("orcReadable", 96, 96, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, drawPixelOrc, 2, "rgba(245, 38, 50, 0.84)");
  });
  add("skeletonArcher", 72, 72, (ctx, w, h) => drawPixelSkeleton(ctx, w, h));
  add("skeletonArcherReadable", 72, 72, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, drawPixelSkeleton, 2, "rgba(255, 168, 64, 0.85)");
  });

  add("bone", 32, 14, (ctx, w, h) => drawPixelBone(ctx, w, h));
  add("boneReadable", 32, 14, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, drawPixelBone, 1, "rgba(15, 11, 38, 0.62)");
  });

  add("bullet", 48, 20, (ctx, w, h) => {
    drawPixelBullet(ctx, w, h);
  });
  add("bulletReadable", 48, 20, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, drawPixelBullet, 1, "rgba(17, 12, 43, 0.48)");
  });
  add("stone", 32, 22, (ctx, w, h) => {
    drawPixelStone(ctx, w, h);
  });
  add("stoneReadable", 32, 22, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, drawPixelStone, 1, "rgba(17, 12, 43, 0.6)");
  });

  add("goldCoin", 34, 34, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, drawPixelGoldCoin, 1, "rgba(93, 58, 16, 0.5)");
  });

  add("walkDust", 34, 22, (ctx, w, h) => {
    drawPixelWalkDust(ctx, w, h);
  });

  add("spark", 40, 40, (ctx, w, h) => {
    ctx.fillStyle = "rgba(255, 228, 107, 0.3)";
    ctx.fillRect(12, 8, 16, 24);
    ctx.fillRect(8, 12, 24, 16);
    ctx.fillStyle = "#fff3c4";
    ctx.fillRect(16, 12, 8, 16);
    ctx.fillRect(12, 16, 16, 8);
    ctx.fillStyle = "#ff7a5c";
    ctx.fillRect(18, 18, 4, 4);
  });

  const size = 1024;
  const pad = 3;
  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = size;
  atlasCanvas.height = size;
  const atlasCtx = atlasCanvas.getContext("2d");
  atlasCtx.imageSmoothingEnabled = false;
  atlasCtx.clearRect(0, 0, size, size);

  let x = pad;
  let y = pad;
  let rowHeight = 0;
  const sprites = {};

  for (const spec of specs) {
    if (x + spec.width + pad > size) {
      x = pad;
      y += rowHeight + pad;
      rowHeight = 0;
    }
    if (y + spec.height + pad > size) {
      throw new Error("Texture atlas overflow");
    }

    const spriteCanvas = document.createElement("canvas");
    spriteCanvas.width = spec.width;
    spriteCanvas.height = spec.height;
    const spriteCtx = spriteCanvas.getContext("2d");
    spriteCtx.imageSmoothingEnabled = false;
    spec.draw(spriteCtx, spec.width, spec.height);
    atlasCtx.drawImage(spriteCanvas, x, y);

    sprites[spec.name] = {
      x,
      y,
      w: spec.width,
      h: spec.height,
      u0: x / size,
      v0: y / size,
      u1: (x + spec.width) / size,
      v1: (y + spec.height) / size,
    };

    x += spec.width + pad;
    rowHeight = Math.max(rowHeight, spec.height);
  }

  return { canvas: atlasCanvas, sprites };
}
