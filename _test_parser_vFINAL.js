const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DOCX_PATH = path.join(__dirname, "Transcrição Registros de Casamento 1965 - Paróquia de João Alfredo.docx");
const WIDGET_PATH = path.join(__dirname, "extension", "content", "widget.js");

const src = fs.readFileSync(WIDGET_PATH, "utf-8");
const ini = src.indexOf("const MESES_WORD");
const fim = src.indexOf("const processarUploadWord");
if (ini < 0 || fim < 0) throw new Error("Parser não encontrado no widget.js");
const parserCode = src.substring(ini, fim);
const factory = new Function(parserCode + `
return {
  MESES_WORD, normWord, numextWord,
  extrairDataLinhaWord, extrairHoraLinhaWord, extrairLocalLinhaWord,
  extrairPadreLinhaWord, extrairTestemunhasLinhaWord, extrairNomePessoaLinhaWord,
  extrairTodosOsRegistrosWord
};`);
const P = factory();

function lerUInt32LE(view, offset) { return view.getUint32(offset, true); }
function lerUInt16LE(view, offset) { return view.getUint16(offset, true); }

function procurarNoZip(buf, nomeArq) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tam = buf.length;
  let offEocd = -1;
  for (let i = tam - 22; i >= Math.max(0, tam - 65557); i--) {
    if (lerUInt32LE(view, i) === 0x06054b50) { offEocd = i; break; }
  }
  if (offEocd < 0) throw new Error("EOCD não encontrado");
  const offCentralDir = lerUInt32LE(view, offEocd + 16);
  let off = offCentralDir;
  while (off < tam) {
    if (lerUInt32LE(view, off) !== 0x02014b50) break;
    const tamNome = lerUInt16LE(view, off + 28);
    const tamExtra = lerUInt16LE(view, off + 30);
    const tamComent = lerUInt16LE(view, off + 32);
    const compressao = lerUInt16LE(view, off + 10);
    const tamComprimido = lerUInt32LE(view, off + 20);
    const offLocal = lerUInt32LE(view, off + 42);
    const nome = buf.slice(off + 46, off + 46 + tamNome).toString("utf-8");
    if (nome === nomeArq) {
      const offLH = offLocal;
      const tamNomeL = lerUInt16LE(view, offLH + 26);
      const tamExtraL = lerUInt16LE(view, offLH + 28);
      const inicioDados = offLH + 30 + tamNomeL + tamExtraL;
      const dados = buf.slice(inicioDados, inicioDados + tamComprimido);
      if (compressao === 0) return dados;
      if (compressao === 8) return zlib.inflateRawSync(dados);
    }
    off += 46 + tamNome + tamExtra + tamComent;
  }
  throw new Error("Arquivo não achado: " + nomeArq);
}

function extrairLinhas(buf) {
  const xmlBytes = procurarNoZip(buf, "word/document.xml");
  const xml = xmlBytes.toString("utf-8");
  const linhas = [];
  const reP = /<w:p\b(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/gi;
  let m;
  while ((m = reP.exec(xml)) !== null) {
    const conteudoP = m[1];
    const subBlocos = conteudoP.split(/<w:br\b[^>]*\/?>/gi);
    for (const sub of subBlocos) {
      const reT = /<w:t\b(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gi;
      const partes = [];
      let mt;
      while ((mt = reT.exec(sub)) !== null) partes.push(mt[1]);
      const txt = partes.join("").replace(/\s+/g, " ").trim();
      if (txt.length > 0) linhas.push(txt);
    }
  }
  return linhas;
}

const buf = fs.readFileSync(DOCX_PATH);
const linhas = extrairLinhas(Buffer.from(buf));
console.log("========== PRIMEIRAS 50 LINHAS ==========");
for (let i = 0; i < Math.min(50, linhas.length); i++) {
  const l = linhas[i];
  const marcs = [];
  if (/^\s*Ano\s*[:\.]/i.test(l)) marcs.push("ANO");
  if (/^\s*Data\s+do\s+casamento/i.test(l)) marcs.push("DATA");
  if (/^\s*O\s+Nubente/i.test(l)) marcs.push("NOIVO");
  if (/^\s*A\s+Nubente/i.test(l)) marcs.push("NOIVA");
  if (/Folha\s*\d+/i.test(l)) marcs.push("FOLHA");
  if (/Termo\s*N\.?\s*\d+/i.test(l)) marcs.push("TERMO");
  console.log("L" + (i+1) + ": [" + (marcs.join(",")||" ") + "] " + l.slice(0, 180));
}
console.log("\n========== EXTRAÇÃO DE REGISTROS ==========");
const regs = P.extrairTodosOsRegistrosWord(linhas);
console.log("TOTAL:", regs.length);
console.log("Faixa FOLHA:", regs[0]?.folha, "→", regs[regs.length-1]?.folha);
console.log("Faixa NÚMERO:", regs[0]?.numero, "→", regs[regs.length-1]?.numero);
const comData = regs.filter(r => r.data_celebacao && /\/1965$/.test(r.data_celebacao)).length;
const comDB = regs.filter(r => r.data_celebacao).length;
const comH = regs.filter(r => r.hora_celebacao).length;
const comL = regs.filter(r => r.local_celebacao).length;
const comP = regs.filter(r => r.testemunha_qualificada).length;
const comNv = regs.filter(r => r.noivo?.nome).length;
const comNa = regs.filter(r => r.noiva?.nome).length;
const comT1 = regs.filter(r => r.testemunha_noivo).length;
const comT2 = regs.filter(r => r.testemunha_noiva).length;
console.log("");
console.log("Datas (ano 1965):", comData, "/", regs.length);
console.log("Datas (qualquer):", comDB);
console.log("Horas:", comH);
console.log("Locais:", comL);
console.log("Padres (TQ):", comP);
console.log("Nomes Noivo:", comNv);
console.log("Nomes Noiva:", comNa);
console.log("Testemunha Noivo:", comT1);
console.log("Testemunha Noiva:", comT2);
const regsAnoRuim = regs.filter(r => r.data_celebacao && !/\/1965$/.test(r.data_celebacao));
if (regsAnoRuim.length) console.log("\n⚠️  Datas SEM 1965:", regsAnoRuim.map(r => ({n:r.numero, f:r.folha, d:r.data_celebacao, a:r.ano_texto})).slice(0,5));
else console.log("\n✅ TODAS as datas com ano 1965!");
const regsSemNome = regs.filter(r => !r.noivo?.nome || !r.noiva?.nome);
if (regsSemNome.length) console.log("\n⚠️  Sem noivo/noiva:", regsSemNome.slice(0,5).map(r=>({n:r.numero,f:r.folha, nv:r.noivo?.nome||"VAZIO", na:r.noiva?.nome||"VAZIO"})));
else console.log("\n✅ TODOS os registros com nomes de noivo E noiva!");
console.log("\n========== REGISTRO 0 ==========");
console.log(JSON.stringify(regs[0], null, 2));
console.log("\n========== REGISTRO 60 (MEIO) ==========");
console.log(JSON.stringify(regs[60], null, 2));
fs.writeFileSync(path.join(__dirname, "registros_1965_PARSER_JS_V3.json"), JSON.stringify(regs, null, 2), "utf-8");
console.log("\n✅ JSON salvo: registros_1965_PARSER_JS_V3.json");
