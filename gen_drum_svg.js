// gen_drum_svg.js — рендер барабанного ритма из input.md в SVG нотный стан.
// Запуск: node gen_drum_svg.js  ->  course3-drums.svg
//
// Формат input.md: ритм в блоке ``` ... ```, строки вида:
// HH | X . x . | X . X . | X . X . | X . X . |
// SN | . . . . | X . . X | . . . . | X . . . |
// BD | X . . . | . . . . | . . X . | . . . . |
// (любой символ кроме "." = удар; 16 шестнадцатых = такт 4/4)

const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "output.svg");
const INPUT = path.join(__dirname, "input.md");

// ---------- ввод: читаем ритм из блока ``` ... ``` в input.md ----------
function loadPattern(file) {
  const md = fs.readFileSync(file, "utf8");
  const m = md.match(/```[a-z]*\s*\n([\s\S]*?)```/);
  if (!m) throw new Error("в input.md не найден блок ``` ... ``` с ритмом");
  const pat = {};
  for (const raw of m[1].split("\n")) {
    const lm = raw.trim().match(/^([A-Za-z]{2})\s*\|(.+)$/);
    if (!lm) continue;
    const key = lm[1].toUpperCase();
    const cells = lm[2].split("|").join(" ").trim().split(/\s+/).filter(Boolean);
    pat[key] = cells.map(c => (c === "." ? 0 : 1));
  }
  for (const key of ["HH", "SN", "BD"]) {
    if (!pat[key]) {
      console.warn("предупреждение: строка " + key + " не найдена, взята тишина");
      pat[key] = new Array(16).fill(0);
    }
  }
  return pat;
}

const PAT = loadPattern(INPUT);  // 1 = удар, 0 = пауза
const N = PAT.HH.length;         // число шагов (16 = такт 4/4 шестнадцатыми)

// ---------- геометрия ----------
const S = 11.0;                    // расстояние между линейками стана
const TOP1 = 150.0;                // верхний стан: хай-хэт
const TOP2 = 226.0;                // нижний стан: малый + бас
const STAVES = [TOP1, TOP2];
const STEM = 3.5 * S;              // длина штиля (октава)

const SHOW_RESTS = false;          // рисовать паузы (true/false)

const X0 = 100.0, DX = 34.0;       // x первой шестнадцатой и шаг сетки
const X_END = X0 + (N - 1) * DX + 42;
const W = X_END + 24, H = 340.0;

const BEAM_H = 4.6, BEAM_GAP = 2.0;
const HEAD_DX = 4.4;

// HH — на верхнем стане (штиль вверх, одна вязка), SN и BD — на нижнем
const VOICES = [
  { key: "HH", y: TOP1 - 0.5 * S, up: true,  xhead: true,  restY: TOP1 - 2.2 * S,  restDx: 0.0, singleBeam: true },
  { key: "SN", y: TOP2 + 1.5 * S, up: true,  xhead: false, restY: TOP2 + 0.55 * S, restDx: 3.5, singleBeam: true },
  { key: "BD", y: TOP2 + 3.5 * S, up: false, xhead: false, restY: TOP2 + 5.5 * S,  restDx: 0.0 },
];

const parts = [];
const add = s => parts.push(s);
const f = n => n.toFixed(2);

function line(x1, y1, x2, y2, w = 1.0, cap = "butt") {
  add(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="#000" stroke-width="${w}" stroke-linecap="${cap}"/>`);
}

function rect(x, y, w, h) {
  add(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="#000"/>`);
}

function text(x, y, s, size = 12, fill = "#000", anchor = "middle", bold = false, family = "Georgia, serif") {
  s = s.replace(/&/g, "&amp;");
  const b = bold ? ' font-weight="bold"' : "";
  add(`<text x="${f(x)}" y="${f(y)}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-family="${family}"${b}>${s}</text>`);
}

function head(cx, cy, xhead) {
  if (xhead) {  // крестик для хэта
    line(cx - 4.3, cy - 4.3, cx + 4.3, cy + 4.3, 2.3, "round");
    line(cx - 4.3, cy + 4.3, cx + 4.3, cy - 4.3, 2.3, "round");
  } else {
    add(`<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="5.4" ry="3.9" transform="rotate(-16 ${f(cx)} ${f(cy)})"/>`);
  }
}

function rest16(cx, cy) {  // стилизованная шестнадцатая пауза
  line(cx + 3.2, cy - 7.5, cx - 3.2, cy + 8.5, 1.7);
  for (const [dx, dy] of [[-1.6, -2.6], [-2.6, 3.4]]) {
    add(`<ellipse cx="${f(cx + dx)}" cy="${f(cy + dy)}" rx="2.4" ry="1.8" transform="rotate(-18 ${f(cx + dx)} ${f(cy + dy)})"/>`);
  }
}

function rest4(cx, cy) {  // стилизованная четвертная пауза
  add(`<path d="M ${f(cx + 1.5)} ${f(cy - 10)} q 5 2 -1 6 q 6 2 1 7 q -6 1 -4 6 l 4 6" fill="none" stroke="#000" stroke-width="1.8" stroke-linecap="round"/>`);
}

function flag16(x, y, up) {  // двойной флажок для одинокой шестнадцатой
  const sgn = up ? 1 : -1;
  for (const k of [0, 7]) {
    const y0 = y + k * sgn;
    add(`<path d="M ${f(x)} ${f(y0)} q 9 ${2 * sgn} 8 ${9 * sgn}" fill="none" stroke="#000" stroke-width="2.0" stroke-linecap="round"/>`);
  }
}

function renderVoice(v) {
  const pat = PAT[v.key];
  const y = v.y, up = v.up;
  const tip = up ? y - STEM : y + STEM;
  const sx = i => X0 + i * DX + (up ? HEAD_DX : -HEAD_DX);

  for (let beat = 0; beat < N / 4; beat++) {
    const idx = [];
    for (let i = beat * 4; i < beat * 4 + 4; i++) if (pat[i]) idx.push(i);

    if (idx.length === 0) {  // пустая доля -> четвертная пауза
      if (SHOW_RESTS) rest4(X0 + (beat * 4 + 1.5) * DX, v.restY);
      continue;
    }

    for (const i of idx) {  // головки + штили
      head(X0 + i * DX, y, v.xhead);
      line(sx(i), y + (up ? -3 : 3), sx(i), tip, 1.5);
    }

    if (idx.length === 1) {
      flag16(sx(idx[0]), tip, up);
    } else {
      // основная (восьмая) вязка через всю долю
      let sy2;
      if (up) {
        rect(sx(idx[0]), tip, sx(idx[idx.length - 1]) - sx(idx[0]), BEAM_H);
        sy2 = tip + BEAM_H + BEAM_GAP;
      } else {
        rect(sx(idx[0]), tip - BEAM_H, sx(idx[idx.length - 1]) - sx(idx[0]), BEAM_H);
        sy2 = tip - 2 * BEAM_H - BEAM_GAP;
      }
      // вторая (шестнадцатая) вязка: сегменты между соседними нотами, отростки к паузам
      if (!v.singleBeam) {
        for (let k = 0; k < idx.length; k++) {
          const i = idx[k];
          const leftC = k > 0 && idx[k - 1] === i - 1;
          const rightC = k < idx.length - 1 && idx[k + 1] === i + 1;
          if (rightC) rect(sx(i), sy2, sx(idx[k + 1]) - sx(i), BEAM_H);
          if (!leftC && !rightC) {
            if (k < idx.length - 1) rect(sx(i), sy2, 0.62 * DX, BEAM_H);
            else rect(sx(i) - 0.62 * DX, sy2, 0.62 * DX, BEAM_H);
          }
        }
      }
    }

    // шестнадцатые паузы на пустых позициях доли
    if (SHOW_RESTS) for (let i = beat * 4; i < beat * 4 + 4; i++) {
      if (!pat[i]) rest16(X0 + i * DX + v.restDx, v.restY);
    }
  }
}

// ---------- сборка ----------
add(`<rect width="${W}" height="${H}" fill="#fff"/>`);
text(W / 2, 34, "Ритм третьего куплета — барабаны, 4/4", 16, "#000", "middle", true);

const subLabels = ["", "e", "&", "a"];
for (let i = 0; i < N; i++) {
  const lab = i % 4 === 0 ? String(i / 4 + 1) : subLabels[i % 4];
  text(X0 + i * DX, 72, lab, 10.5, "#555", "middle", i % 4 === 0, "Arial, sans-serif");
}

for (const top of STAVES) {                          // два стана
  for (let i = 0; i < 5; i++) line(25, top + i * S, X_END, top + i * S, 1.0);
  line(25, top, 25, top + 4 * S, 1.4);               // начальная тактовая черта
  line(X_END - 9, top, X_END - 9, top + 4 * S, 1.2); // финальная тонкая
  rect(X_END - 5, top, 5, 4 * S);                    // финальная толстая

  // нейтральный ключ ударных (две полосы)
  rect(38, top + 0.5 * S, 5, 3 * S);
  rect(47, top + 0.5 * S, 5, 3 * S);

  // размер 4/4
  text(64, top + 1.7 * S, "4", 23, "#000", "middle", true);
  text(64, top + 3.7 * S, "4", 23, "#000", "middle", true);
}

// подписи станов
text(25, TOP1 - 8, "Хай-хэт", 11.5, "#333", "start", true, "Arial, sans-serif");
text(25, TOP2 - 8, "Малый + бас", 11.5, "#333", "start", true, "Arial, sans-serif");

for (const v of VOICES) renderVoice(v);

text(25, H - 16, "× = хай-хэт    ● = малый барабан    ● = бас-барабан (внизу стана)",
     11, "#333", "start", false, "Arial, sans-serif");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${parts.join("\n")}\n</svg>\n`;
fs.writeFileSync(OUT, svg, "utf8");
console.log("written:", OUT);
