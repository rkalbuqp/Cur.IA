const fs = require("fs");
const path = require("path");

try {
  const { createCanvas } = require("canvas");
} catch (e) {
  console.log(
    "[Curia IA] Pacote 'canvas' não instalado. Para gerar ícones PNG rode: npm install canvas"
  );
  process.exit(0);
}

const { createCanvas } = require("canvas");
const sizes = [16, 48, 128];
const outDir = path.join(__dirname, "icons");

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

sizes.forEach((size) => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "#1e3a8a");
  grad.addColorStop(1, "#3b82f6");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.floor(size * 0.6)}px "Segoe UI Emoji", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("⛪", size / 2, size / 2 + Math.floor(size * 0.05));

  const buffer = canvas.toBuffer("image/png");
  const file = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(file, buffer);
  console.log(`✅ Gerado: ${file}`);
});

console.log("Ícones gerados com sucesso!");
