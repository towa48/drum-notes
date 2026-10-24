// browser/script.js — общая логика генератора: парсинг текстовой барабанной
// нотации и генерация SVG нотного стана. Используется и браузерной версией
// (index.html, глобальный объект DrumSVG), и Node-скриптом gen_drum_svg.js.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;  // Node.js
  else root.DrumSVG = api;                                                  // браузер
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  // ---------- настройки отрисовки ----------
  const S = 11.0;                    // расстояние между линейками стана
  const TOP1 = 150.0;                // верх первого стана
  const STEM = 3.5 * S;              // длина штиля (октава)

  const SHOW_RESTS = false;          // рисовать паузы (true/false)
  const BEAMS16 = false;             // true = шестнадцатые с вязками, false = четвертые

  const X0 = 100.0, DX = 34.0;       // x первой шестнадцатой и шаг сетки
  const SYS_DY = 140.0;              // базовое расстояние между станами (чтобы штили не пересекались)
  const CAP_GAP = 50.0;              // дополнительный отступ под заголовок стана

  const BEAM_H = 4.6, BEAM_GAP = 2.0;
  const HEAD_DX = 4.4;

  // HH и SN — штили вверх (при совпадении общие), BD — штили вниз; смещения от верха стана
  const VOICE_DEFS = [
    { key: "HH", dy: -0.5 * S, up: true,  xhead: true,  beams: true, restDy: -2.2 * S,  restDx: 0.0, singleBeam: true },
    { key: "SN", dy: +1.5 * S, up: true,  xhead: false, restDy: +0.55 * S, restDx: 3.5, singleBeam: true },
    { key: "BD", dy: +3.5 * S, up: false, xhead: false, hollow: true, beamMulti: true, restDy: +5.5 * S, restDx: 0.0, singleBeam: true },
  ];

  // ---------- парсинг: блоки ``` ... ``` -> массив паттернов + заголовок ----------
  function parseInput(md) {
    const re = /```[a-z]*\s*\n([\s\S]*?)```/g;
    const pats = [];
    let m, last = 0;
    while ((m = re.exec(md))) {  // каждый блок ``` — отдельный стан
      // текст перед блоком — заголовок стана (у первого блока — заголовок картинки)
      const caption = md.slice(last, m.index).split("\n")
        .map(s => s.trim().replace(/^#+\s*/, "")).filter(Boolean).join(" ");
      last = m.index + m[0].length;
      const pat = {};
      let units = null;
      for (const raw of m[1].split("\n")) {
        const t = raw.trim();
        if (!t) continue;
        const lm = t.match(/^([A-Za-z]{2})\s*\|(.+)$/);
        if (lm) {
          const key = lm[1].toUpperCase();
          const cells = lm[2].split("|").join(" ").trim().split(/\s+/).filter(Boolean);
          pat[key] = cells.map(c => (c === "." ? 0 : 1));
          continue;
        }
        if (!t.includes("|")) continue;
        // строка-сетка "| 1 e & a | 1 la le 2 la le | ...": структура долей и триолей;
        // юнит: { start, len, num } — num: 0 обычная доля, 3 триоль, 6 две триоли в одной ячейке
        const cells = t.split("|").map(s => s.trim()).filter(Boolean);
        units = [];
        let start = 0;
        for (const cell of cells) {
          const beats = [];
          for (const tok of cell.split(/\s+/).filter(Boolean)) {
            if (/^\d+$/.test(tok)) beats.push(1);            // номер доли = новая доля
            else if (beats.length) beats[beats.length - 1]++;
          }
          const len = beats.reduce((a, b) => a + b, 0) || 4;
          const allTrip = beats.length > 0 && beats.every(b => b === 3);
          units.push({ start, len, num: allTrip ? 3 * beats.length : 0 });
          start += len;
        }
      }
      if (!Object.keys(pat).length) continue;
      for (const key of ["HH", "SN", "BD"]) {
        if (!pat[key]) {
          console.warn("предупреждение: строка " + key + " не найдена, взята тишина");
          pat[key] = new Array(16).fill(0);
        }
      }
      // если сетка не найдена или не сходится с числом шагов — обычные доли по 4 шестнадцатых
      if (!units || units.reduce((a, u) => a + u.len, 0) !== pat.HH.length) {
        units = [];
        for (let s = 0; s < pat.HH.length; s += 4) units.push({ start: s, len: 4, num: 0 });
      }
      pat._units = units;
      pat._caption = caption;
      pats.push(pat);
    }
    if (!pats.length) throw new Error("не найден блок ``` ... ``` с ритмом");
    // подпись картинки — заголовок первого блока
    return { pats, title: pats[0]._caption || "" };
  }

  // ---------- генерация SVG из текста нотации ----------
  function generateSVG(md) {
    const { pats, title } = parseInput(md);
    const N = Math.max(...pats.map(p => p.HH.length));  // число шагов (16 = такт 4/4)
    const X_END = X0 + (N - 1) * DX + 42;
    // верх каждого стана: если у стана есть заголовок, перед ним отступ больше
    const tops = [TOP1];
    for (let k = 1; k < pats.length; k++) tops.push(tops[k - 1] + SYS_DY + (pats[k]._caption ? CAP_GAP : 0));
    const W = X_END + 24, H = tops[tops.length - 1] + 90.0;

    const parts = [];
    const add = s => parts.push(s);
    const f = n => n.toFixed(2);

    function line(x1, y1, x2, y2, w = 1.0, cap = "butt") {
      add(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="#000" stroke-width="${w}" stroke-linecap="${cap}"/>`);
    }

    function rect(x, y, w, h) {
      add(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="#000"/>`);
    }

    function text(x, y, s, size = 12, fill = "#000", anchor = "middle", bold = false, family = "Georgia, serif", italic = false) {
      s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const b = bold ? ' font-weight="bold"' : "";
      const it = italic ? ' font-style="italic"' : "";
      add(`<text x="${f(x)}" y="${f(y)}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-family="${family}"${b}${it}>${s}</text>`);
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
      const beamsMulti = vs.some(v => v.beamMulti);          // вязки, только если в группе > 1 ноты
      const singleBeam = vs.every(v => v.singleBeam);
      const topY = Math.min(...vs.map(v => v.y));   // самая высокая головка группы
      const tip = up ? topY - STEM : topY + STEM;   // общий конец штилей
      const sx = i => X0 + i * DX + (up ? HEAD_DX : -HEAD_DX);

      for (const u of pat._units) {  // юнит: { start, len, num } — num: 0 доля, 3 триоль, 6 две триоли
        const idx = [];
        for (let i = u.start; i < u.start + u.len; i++) if (vs.some(v => pat[v.key][i])) idx.push(i);

        if (idx.length === 0) {  // пустая доля -> четвертная пауза
          if (SHOW_RESTS) rest4(X0 + (u.start + (u.len - 1) / 2) * DX, vs[0].restY);
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
        if (beams) {
          if (idx.length === 1) {
            flag16(sx(idx[0]), tip, up);
          } else {
            // основная вязка через всю группу
            let sy2;
            if (up) {
              rect(sx(idx[0]), tip, sx(idx[idx.length - 1]) - sx(idx[0]), BEAM_H);
              sy2 = tip + BEAM_H + BEAM_GAP;
            } else {
              rect(sx(idx[0]), tip - BEAM_H, sx(idx[idx.length - 1]) - sx(idx[0]), BEAM_H);
              sy2 = tip - 2 * BEAM_H - BEAM_GAP;
            }
            // вторая (шестнадцатая) вязка — обычная сетка, а также секстоль (num 6)
            // с занятыми всеми позициями (рисуется как шестнадцатые); у триоли одна вязка;
            // соседние ноты группы всегда связываются сегментами, отростки к паузам — при !singleBeam
            if (!u.num || (u.num === 6 && idx.length === u.len)) {
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
            // цифра триоли/секстоли: над вязкой (при штилях вниз — под вязкой)
            if (u.num) {
              const xc = (sx(idx[0]) + sx(idx[idx.length - 1])) / 2;
              text(xc, up ? tip - 6 : tip + 14, String(u.num), 12, "#000", "middle", false, "Georgia, serif", true);
            }
          }
        }

        // шестнадцатые паузы на пустых позициях группы
        if (SHOW_RESTS) for (let i = u.start; i < u.start + u.len; i++) {
          if (!vs.some(v => pat[v.key][i])) rest16(X0 + i * DX + vs[0].restDx, vs[0].restY);
        }
      }
    }

    // один стан: линейки, ключ, размер (только у первого), голоса
    function renderSystem(pat, top, timeSig) {
      // заголовок стана — текст перед его блоком; такой же стиль, как у заголовка картинки
      if (!timeSig && pat._caption) text(W / 2, top - 62, pat._caption, 16, "#000", "middle", true);
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
    if (title) text(W / 2, 34, title, 16, "#000", "middle", true);

    // подписи долей сверху — по сетке первого блока (1 e & a / 1 la le)
    const sub4 = ["", "e", "&", "a"], sub3 = ["", "la", "le"];
    let li = 0, beatNo = 1;
    for (const u of pats[0]._units) {
      const beatLen = u.num ? 3 : u.len;
      for (let s = 0; s < u.len; s++) {
        const pos = s % beatLen;
        const lab = pos === 0 ? String(beatNo++) : (beatLen === 3 ? sub3[pos] : sub4[pos]);
        text(X0 + (li + s) * DX, 72, lab, 10.5, "#555", "middle", pos === 0, "Arial, sans-serif");
      }
      li += u.len;
    }

    // каждый блок ``` — отдельный стан; 4/4 только на первом
    pats.forEach((pat, k) => renderSystem(pat, tops[k], k === 0));

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${parts.join("\n")}\n</svg>\n`;
  }

  return { parseInput, generateSVG };
});
