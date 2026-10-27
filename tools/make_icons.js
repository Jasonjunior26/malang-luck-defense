// 아이콘 생성: node tools/make_icons.js  (필요: npm i @napi-rs/canvas, NODE_PATH 로 위치 지정 가능)
// 하나의 SVG(마스코트 젤리)를 PNG 로 렌더한다.
const fs = require('fs'), path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const OUT = path.join(__dirname, '..', 'assets', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// scale: 마스코트 크기 배율 (maskable 은 안전영역 80% 안에 들어가도록 축소), rounded: 배경 라운드 여부
function svg({ scale = 1, rounded = false }) {
  const bg = rounded ? '<rect width="512" height="512" rx="112" fill="url(#bg)"/>' : '<rect width="512" height="512" fill="url(#bg)"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset="0.55" stop-color="#ffc98a"/><stop offset="1" stop-color="#ff9fc0"/></linearGradient>
<radialGradient id="body" cx="0.38" cy="0.3" r="0.9"><stop offset="0" stop-color="#ffd0e0"/><stop offset="0.6" stop-color="#ff7fa8"/><stop offset="1" stop-color="#e0558a"/></radialGradient>
</defs>
${bg}
<g transform="translate(256 262) scale(${scale}) translate(-256 -256)">
<ellipse cx="256" cy="440" rx="150" ry="22" fill="#5b3a1e" opacity="0.18"/>
<circle cx="150" cy="160" r="46" fill="#e0558a"/><circle cx="150" cy="160" r="26" fill="#ffd0e0"/>
<circle cx="362" cy="160" r="46" fill="#e0558a"/><circle cx="362" cy="160" r="26" fill="#ffd0e0"/>
<path d="M256 120 C380 120 440 215 440 305 C440 390 370 430 256 430 C142 430 72 390 72 305 C72 215 132 120 256 120Z" fill="url(#body)" stroke="#fff" stroke-width="12"/>
<ellipse cx="190" cy="198" rx="42" ry="26" fill="#fff" opacity="0.5" transform="rotate(-25 190 198)"/>
<ellipse cx="195" cy="285" rx="24" ry="32" fill="#5b3a1e"/><ellipse cx="317" cy="285" rx="24" ry="32" fill="#5b3a1e"/>
<circle cx="203" cy="273" r="9" fill="#fff"/><circle cx="325" cy="273" r="9" fill="#fff"/>
<ellipse cx="150" cy="335" rx="26" ry="16" fill="#ff5d8f" opacity="0.55"/><ellipse cx="362" cy="335" rx="26" ry="16" fill="#ff5d8f" opacity="0.55"/>
<path d="M226 335 Q256 372 286 335" fill="none" stroke="#5b3a1e" stroke-width="12" stroke-linecap="round"/>
<path d="M256 96 l14 30 33 4 -25 22 7 33 -29 -17 -29 17 7 -33 -25 -22 33 -4z" fill="#ffb703" stroke="#fff" stroke-width="7" stroke-linejoin="round" transform="translate(0 -22)"/>
</g></svg>`;
}

async function png(name, size, opt) {
  const img = await loadImage(Buffer.from(svg(opt)));
  const c = createCanvas(size, size), g = c.getContext('2d');
  g.drawImage(img, 0, 0, size, size);
  fs.writeFileSync(path.join(OUT, name), c.toBuffer('image/png'));
  console.log(name, size);
}

(async () => {
  fs.writeFileSync(path.join(OUT, 'icon.svg'), svg({ scale: 0.92, rounded: true }));
  await png('icon-192.png', 192, { scale: 0.92 });
  await png('icon-512.png', 512, { scale: 0.92 });
  await png('icon-maskable-512.png', 512, { scale: 0.62 }); // 안전영역(중앙 80%) 안
  await png('apple-touch-icon-180.png', 180, { scale: 0.92 }); // iOS 가 직접 라운딩
  await png('favicon-32.png', 32, { scale: 0.98, rounded: true });
})();
