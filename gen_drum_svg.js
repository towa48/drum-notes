// gen_drum_svg.js — рендер барабанного ритма из input.md в SVG нотный стан.
// Запуск: node gen_drum_svg.js  ->  output.svg
//
// Формат input.md: первая непустая строка файла — подпись картинки;
// ритм в блоке ``` ... ```, строки вида:
// HH | X . x . | X . X . | X . X . | X . X . |
// SN | . . . . | X . . X | . . . . | X . . . |
// BD | X . . . | . . . . | . . X . | . . . . |
// (любой символ кроме "." = удар; 16 шестнадцатых = такт 4/4)
// Несколько блоков ``` = несколько станов друг под другом (4/4 только на первом).

const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "output.svg");
const INPUT = path.join(__dirname, "input.md");

// ---------- ввод: читаем ритм из блоков ``` ... ``` в input.md ----------
function loadInput(file) {
  const md = fs.readFileSync(file, "utf8");
  const re = /```[a-z]*\s*\n([\s\S]*?)```/g;
  const pats = [];
  let m;
  while ((m = re.exec(md))) {  // каждый блок ``` — отдельный стан
    const pat = {};
    for (const raw of m[1].split("\n")) {
      const lm = raw.trim().match(/^([A-Za-z]{2})\s*\|(.+)$/);
      if (!lm) continue;
      const key = lm[1].toUpperCase();
      const cells = lm[2].split("|").join(" ").trim().split(/\s+/).filter(Boolean);
      pat[key] = cells.map(c => (c === "." ? 0 : 1));
    }
    if (Object.keys(pat).length) pats.push(pat);
  }
  if (!pats.length) throw new Error("в input.md не найден блок ``` ... ``` с ритмом");
  for (const pat of pats) for (const key of ["HH", "SN", "BD"]) {
    if (!pat[key]) {
      console.warn("предупреждение: строка " + key + " не найдена, взята тишина");
      pat[key] = new Array(16).fill(0);
    }
  }
  // подпись картинки — первая непустая строка вне блоков ``` ... ```
  const outside = md.replace(/```[a-z]*\s*\n[\s\S]*?```/g, "\n");
  const title = outside.split("\n").map(s => s.trim().replace(/^#+\s*/, "")).find(Boolean) || "";
  return { pats, title };
}

const { pats: PATS, title: TITLE } = loadInput(INPUT);  // элементы PATS: 1 = удар, 0 = пауза
const N = Math.max(...PATS.map(p => p.HH.length));    // число шагов (16 = такт 4/4 шестнадцатыми)

// ---------- геометрия ----------
const S = 11.0;                    // расстояние между линейками стана
const TOP1 = 150.0;                // верх первого стана
const STEM = 3.5 * S;              // длина штиля (октава)

const SHOW_RESTS = false;          // рисовать паузы (true/false)
const BEAMS16 = false;             // true = шестнадцатые с вязками, false = четвертые

const X0 = 100.0, DX = 34.0;       // x первой шестнадцатой и шаг сетки
const X_END = X0 + (N - 1) * DX + 42;
const SYS_DY = 140.0;              // расстояние между станами (чтобы штили не пересекались)
const W = X_END + 24, H = TOP1 + (PATS.length - 1) * SYS_DY + 90.0;

const BEAM_H = 4.6, BEAM_GAP = 2.0;
const HEAD_DX = 4.4;

// HH и SN — штили вверх (при совпадении общие), BD — штили вниз; смещения от верха стана
const VOICE_DEFS = [
  { key: "HH", dy: -0.5 * S, up: true,  xhead: true,  beams: true, restDy: -2.2 * S,  restDx: 0.0, singleBeam: true },
  { key: "SN", dy: +1.5 * S, up: true,  xhead: false, restDy: +0.55 * S, restDx: 3.5, singleBeam: true },
  { key: "BD", dy: +3.5 * S, up: false, xhead: false, hollow: true, beamMulti: true, restDy: +5.5 * S, restDx: 0.0, singleBeam: true },
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

function head(cx, cy, xhead, hollow) {
  if (xhead) {  // крестик для хэта
    line(cx - 4.3, cy - 4.3, cx + 4.3, cy + 4.3, 2.3, "round");
    line(cx - 4.3, cy + 4.3, cx + 4.3, cy - 4.3, 2.3, "round");
  } else if (hollow) {  // половинная нота: незакрашенная головка
    add(`<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="5.4" ry="3.9" transform="rotate(-16 ${f(cx)} ${f(cy)})" fill="#fff" stroke="#000" stroke-width="1.8"/>`);
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

function renderGroup(vs, pat) {  // голоса с общим направлением штилей; совпадающие ноты делят штиль
  const up = vs[0].up;
  const beamsAlways = vs.some(v => v.beams ?? BEAMS16);  // вязки всегда
  const beamsMulti = vs.some(v => v.beamMulti);          // вязки, только если в доле > 1 ноты
  const singleBeam = vs.every(v => v.singleBeam);
  const topY = Math.min(...vs.map(v => v.y));   // самая высокая головка группы
  const tip = up ? topY - STEM : topY + STEM;   // общий конец штилей
  const sx = i => X0 + i * DX + (up ? HEAD_DX : -HEAD_DX);

  for (let beat = 0; beat < N / 4; beat++) {
    const idx = [];
    for (let i = beat * 4; i < beat * 4 + 4; i++) if (vs.some(v => pat[v.key][i])) idx.push(i);

    if (idx.length === 0) {  // пустая доля -> четвертная пауза
      if (SHOW_RESTS) rest4(X0 + (beat * 4 + 1.5) * DX, vs[0].restY);
      continue;
    }

    for (const i of idx) {  // головки + общий штиль
      const ys = [];
      for (const v of vs) if (pat[v.key][i]) {
        head(X0 + i * DX, v.y, v.xhead, v.hollow);
        ys.push(v.y);
      }
      const y0 = up ? Math.max(...ys) - 3 : Math.min(...ys) + 3;
      line(sx(i), y0, sx(i), tip, 1.5);
    }

    const beams = beamsAlways || (beamsMulti && idx.length > 1);
    if (beams) {  // вязки/флажки (при singleBeam — одна вязка на долю); false = четвертые
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
        // вторая (шестнадцатая) вязка: соседние ноты доли всегда связываются сегментами;
        // отростки к паузам — только при !singleBeam
        for (let k = 0; k < idx.length; k++) {
          const i = idx[k];
          const leftC = k > 0 && idx[k - 1] === i - 1;
          const rightC = k < idx.length - 1 && idx[k + 1] === i + 1;
          if (rightC) rect(sx(i), sy2, sx(idx[k + 1]) - sx(i), BEAM_H);
          if (!singleBeam && !leftC && !rightC) {
            if (k < idx.length - 1) rect(sx(i), sy2, 0.62 * DX, BEAM_H);
            else rect(sx(i) - 0.62 * DX, sy2, 0.62 * DX, BEAM_H);
          }
        }
      }
    }

    // шестнадцатые паузы на пустых позициях доли
    if (SHOW_RESTS) for (let i = beat * 4; i < beat * 4 + 4; i++) {
      if (!vs.some(v => pat[v.key][i])) rest16(X0 + i * DX + vs[0].restDx, vs[0].restY);
    }
  }
}

// один стан: линейки, ключ, размер (только у первого), голоса
function renderSystem(pat, top, timeSig) {
  for (let i = 0; i < 5; i++) line(25, top + i * S, X_END, top + i * S, 1.0);
  line(25, top, 25, top + 4 * S, 1.4);               // начальная тактовая черта
  line(X_END - 9, top, X_END - 9, top + 4 * S, 1.2); // финальная тонкая
  rect(X_END - 5, top, 5, 4 * S);                    // финальная толстая

  // нейтральный ключ ударных (две полосы)
  rect(38, top + 0.5 * S, 5, 3 * S);
  rect(47, top + 0.5 * S, 5, 3 * S);

  if (timeSig) {  // размер 4/4 — только на первом стане
    text(64, top + 1.7 * S, "4", 23, "#000", "middle", true);
    text(64, top + 3.7 * S, "4", 23, "#000", "middle", true);
  }

  const vs = VOICE_DEFS.map(v => ({ ...v, y: top + v.dy, restY: top + v.restDy }));
  renderGroup([vs[0], vs[1]], pat);  // HH + SN: общие штили при совпадении
  renderGroup([vs[2]], pat);         // BD: штили вниз
}

// ---------- сборка ----------
add(`<rect width="${W}" height="${H}" fill="#fff"/>`);
if (TITLE) text(W / 2, 34, TITLE, 16, "#000", "middle", true);

const subLabels = ["", "e", "&", "a"];
for (let i = 0; i < N; i++) {
  const lab = i % 4 === 0 ? String(i / 4 + 1) : subLabels[i % 4];
  text(X0 + i * DX, 72, lab, 10.5, "#555", "middle", i % 4 === 0, "Arial, sans-serif");
}

// каждый блок ``` — отдельный стан; 4/4 только на первом
PATS.forEach((pat, k) => renderSystem(pat, TOP1 + k * SYS_DY, k === 0));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${parts.join("\n")}\n</svg>\n`;
fs.writeFileSync(OUT, svg, "utf8");
console.log("written:", OUT);
