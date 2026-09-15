const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DOCX_PATH = path.join(__dirname, "Transcrição Registros de Casamento 1965 - Paróquia de João Alfredo.docx");
const WIDGET_PATH = path.join(__dirname, "extension", "content", "widget.js");

const src = fs.readFileSync(WIDGET_PATH, "utf-8");
const iniMESES = src.indexOf("const MESES_WORD");
const fimParser = src.indexOf("const processarUploadWord");
if (iniMESES < 0 || fimParser < 0) throw new Error("Não achou parser no widget.js");
const parserCode = src.substring(iniMESES, fimParser);
const codigoCompleto = `
"use strict";
${parserCode}
return { extrairTodosOsRegistrosWord, extrairNomePessoaLinhaWord, extrairDataLinhaWord, extrairHoraLinhaWord, extrairLocalLinhaWord, extrairPadreLinhaWord, extrairTestemunhasLinhaWord };
`;
const factory = new Function(codigoCompleto);
const P = factory();

function lerUInt32LE(view, offset) { return view.getUint32(offset, true); }
function lerUInt16LE(view, offset) { return view.getUint16(offset, true); }

function procurarArquivoNoZip(buf, nomeArquivo) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tam = buf.length;
  const ASSINATURA_EOCD = 0x06054b50;
  let offEocd = -1;
  for (let i = tam - 22; i >= Math.max(0, tam - 65557); i--) {
    if (lerUInt32LE(view, i) === ASSINATURA_EOCD) { offEocd = i; break; }
  }
  if (offEocd === -1) throw new Error("EOCD não encontrado.");
  const offCentralDir = lerUInt32LE(view, offEocd + 16);
  let off = offCentralDir;
  while (off < tam) {
    if (lerUInt32LE(view, off) !== 0x02014b50) break;
    const tamNome = lerUInt16LE(view, off + 28);
    const tamExtra = lerUInt16LE(view, off + 30);
    const tamComentario = lerUInt16LE(view, off + 32);
    const compressao = lerUInt16LE(view, off + 10);
    const tamComprimido = lerUInt32LE(view, off + 20);
    const offLocal = lerUInt32LE(view, off + 42);
    const nomeBytes = buf.slice(off + 46, off + 46 + tamNome);
    const nome = nomeBytes.toString("utf-8");
    if (nome === nomeArquivo) {
      const offLocalHeader = offLocal;
      const tamNomeLocal = lerUInt16LE(view, offLocalHeader + 26);
      const tamExtraLocal = lerUInt16LE(view, offLocalHeader + 28);
      const inicioDados = offLocalHeader + 30 + tamNomeLocal + tamExtraLocal;
      const dadosComprimidos = buf.slice(inicioDados, inicioDados + tamComprimido);
      if (compressao === 0) return dadosComprimidos;
      else if (compressao === 8) return zlib.inflateRawSync(dadosComprimidos);
    }
    off += 46 + tamNome + tamExtra + tamComentario;
  }
  throw new Error("Arquivo não encontrado no ZIP.");
}

function extrairTextoDocx(buf) {
  const xmlBytes = procurarArquivoNoZip(buf, "word/document.xml");
  const xml = xmlBytes.toString("utf-8");
  const linhas = [];
  const reP = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  let m;
  while ((m = reP.exec(xml)) !== null) {
    const conteudoP = m[1];
    const subPartes = conteudoP.split(/<w:br\b[^>]*\/?>/i);
    for (const subP of subPartes) {
      const reT = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
      let partes = [], mt;
      while ((mt = reT.exec(subP)) !== null) partes.push(mt[1]);
      const txt = partes.join("").replace(/\s+/g," ").trim();
      if (txt.length > 0) linhas.push(txt);
    }
  }
  return linhas;
}

const buf = fs.readFileSync(DOCX_PATH);
const linhas = extrairTextoDocx(Buffer.from(buf));
console.log("======= PRIMEIRAS 50 LINHAS EXTRAÍDAS =======");
for (let i = 0; i < Math.min(50, linhas.length); i++) {
  const l = linhas[i];
  const marcadores = [];
  if (/^Ano\b/i.test(l)) marcadores.push("ANO");
  if (/^Data\s+do\s+casamento/i.test(l)) marcadores.push("DATA");
  if (/^O\s+Nubente\b/i.test(l)) marcadores.push("NOIVO");
  if (/^A\s+Nubente\b/i.test(l)) marcadores.push("NOIVA");
  if (/Folha\s*\d+/i.test(l)) marcadores.push("FOLHA");
  if (/Termo\s*N\.?\s*\d+/i.test(l)) marcadores.push("TERMO");
  console.log(`L${i+1}: [${marcadores.join(",")||" "}] ${l.slice(0,150)}`);
}
console.log("\n====== TESTES INDIVIDUAIS DAS FUNÇÕES ======");
const linhasComData = linhas.filter(l => /Data\s+do\s+casamento/i.test(l));
console.log(`Linhas com "Data do casamento": ${linhasComData.length}`);
if (linhasComData.length > 0) {
  console.log("Primeira linha data:", linhasComData[0].slice(0, 300));
  const d = P.extrairDataLinhaWord(linhasComData[0], "1965");
  const h = P.extrairHoraLinhaWord(linhasComData[0]);
  const local = P.extrairLocalLinhaWord(linhasComData[0]);
  const padre = P.extrairPadreLinhaWord(linhasComData[0]);
  const [t1, t2] = P.extrairTestemunhasLinhaWord(linhasComData[0]);
  console.log("  extrairDataLinhaWord =>", d);
  console.log("  extrairHoraLinhaWord =>", h);
  console.log("  extrairLocalLinhaWord =>", local);
  console.log("  extrairPadreLinhaWord =>", padre);
  console.log("  extrairTestemunhas =>", t1, "/", t2);
}
const linhasAno = linhas.filter(l => /^Ano\b/i.test(l));
console.log(`\nLinhas que começam com "Ano": ${linhasAno.length}`);
console.log("Primeiras 5:", linhasAno.slice(0,5));
const linhasNoivo = linhas.filter(l => /^O\s+Nubente\b/i.test(l));
console.log(`\nLinhas "O Nubente": ${linhasNoivo.length}`);
if (linhasNoivo.length) {
  console.log("Primeira:", linhasNoivo[0].slice(0,200));
  console.log("Nome extraído:", P.extrairNomePessoaLinhaWord(linhasNoivo[0]));
}
const linhasNoiva = linhas.filter(l => /^A\s+Nubente\b/i.test(l));
console.log(`\nLinhas "A Nubente": ${linhasNoiva.length}`);
if (linhasNoiva.length) {
  console.log("Primeira:", linhasNoiva[0].slice(0,200));
  console.log("Nome extraído:", P.extrairNomePessoaLinhaWord(linhasNoiva[0]));
}
const reFolha = /FOLHA\s*[:\.]?\s*(\d+[A-Za-zºª]?)/i;
const reTermo = /Termo\s*N\.?\s*(\d+[ºª]?)/i;
console.log("\n====== RANGES ======");
const fs_ = linhas.map(l => l.match(reFolha)).filter(x => x).map(x => x[1]);
const ts_ = linhas.map(l => l.match(reTermo)).filter(x => x).map(x => x[1]);
console.log("Folhas matches:", fs_.length, "→", fs_[0], fs_[fs_.length-1]);
console.log("Termos matches:", ts_.length, "→", ts_[0], ts_[ts_.length-1]);
console.log("\n====== RODANDO extrairTodosOsRegistrosWord AGORA ======");
const regs = P.extrairTodosOsRegistrosWord(linhas);
console.log("Total:", regs.length);
const reg0 = regs[0];
console.log("Reg[0] dump:", JSON.stringify(reg0, null, 2));
