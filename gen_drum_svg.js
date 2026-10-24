// gen_drum_svg.js — рендер барабанного ритма из input.md в SVG нотный стан.
// Запуск: node gen_drum_svg.js  ->  output.svg
// Логика парсинга и отрисовки переиспользуется из browser/script.js (общая с браузерной версией).
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
const { generateSVG } = require("./browser/script.js");

const OUT = path.join(__dirname, "output.svg");
const INPUT = path.join(__dirname, "input.md");

const svg = generateSVG(fs.readFileSync(INPUT, "utf8"));
fs.writeFileSync(OUT, svg, "utf8");
console.log("written:", OUT);
