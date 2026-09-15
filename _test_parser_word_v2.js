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
return {
  MESES_WORD, normWord, numextWord,
  extrairDataLinhaWord, extrairHoraLinhaWord, extrairLocalLinhaWord,
  extrairPadreLinhaWord, extrairTestemunhasLinhaWord, extrairNomePessoaLinhaWord,
  extrairTodosOsRegistrosWord
};
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
  throw new Error("Arquivo " + nomeArquivo + " não encontrado no ZIP.");
}

function extrairTextoDocx(buf) {
  const xmlBytes = procurarArquivoNoZip(buf, "word/document.xml");
  const xml = xmlBytes.toString("utf-8");
  const linhas = [];
  const reP = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  let m;
  while ((m = reP.exec(xml)) !== null) {
    const reT = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
    let partes = [], mt;
    while ((mt = reT.exec(m[1])) !== null) partes.push(mt[1]);
    const txt = partes.join(" ").replace(/\s+/g," ").trim();
    if (txt.length > 0) linhas.push(txt);
  }
  return linhas;
}

try {
  const buf = fs.readFileSync(DOCX_PATH);
  const linhas = extrairTextoDocx(Buffer.from(buf));
  console.log("[TESTE] Linhas extraídas:", linhas.length);
  const registros = P.extrairTodosOsRegistrosWord(linhas);
  console.log("[TESTE] Total de registros extraídos:", registros.length);
  if (registros.length > 0) {
    console.log("[TESTE] Faixa FOLHA:", registros[0].folha, "→", registros[registros.length-1].folha);
    console.log("[TESTE] Faixa NÚMERO:", registros[0].numero, "→", registros[registros.length-1].numero);
  }
  const comData = registros.filter(r => r.data_celebacao && /\d{2}\/\d{2}\/1965/.test(r.data_celebacao)).length;
  const comDataBruta = registros.filter(r => r.data_celebacao).length;
  const comHora = registros.filter(r => r.hora_celebacao).length;
  const comLocal = registros.filter(r => r.local_celebacao).length;
  const comPadre = registros.filter(r => r.testemunha_qualificada).length;
  const comNoivo = registros.filter(r => r.noivo && r.noivo.nome).length;
  const comNoiva = registros.filter(r => r.noiva && r.noiva.nome).length;
  const comTest1 = registros.filter(r => r.testemunha_noivo).length;
  const comTest2 = registros.filter(r => r.testemunha_noiva).length;
  console.log("\n[TESTE] ========== QUALIDADE DA EXTRAÇÃO ==========");
  console.log("[TESTE] Datas (com ano 1965):", comData, "/", registros.length);
  console.log("[TESTE] Datas (qualquer):", comDataBruta, "/", registros.length);
  console.log("[TESTE] Horas:", comHora, "/", registros.length);
  console.log("[TESTE] Locais:", comLocal, "/", registros.length);
  console.log("[TESTE] Padres (T.Qualificada):", comPadre, "/", registros.length);
  console.log("[TESTE] Nomes Noivo:", comNoivo, "/", registros.length);
  console.log("[TESTE] Nomes Noiva:", comNoiva, "/", registros.length);
  console.log("[TESTE] Testemunha Noivo:", comTest1, "/", registros.length);
  console.log("[TESTE] Testemunha Noiva:", comTest2, "/", registros.length);
  console.log("\n[TESTE] ========== PRIMEIRO REGISTRO ==========");
  console.log(JSON.stringify(registros[0], null, 2));
  const regMeio = registros[Math.floor(registros.length/2)];
  console.log("\n[TESTE] ========== REGISTRO DO MEIO (idx " + Math.floor(registros.length/2) + ") ==========");
  console.log(JSON.stringify(regMeio, null, 2));
  console.log("\n[TESTE] ========== ÚLTIMO REGISTRO ==========");
  console.log(JSON.stringify(registros[registros.length-1], null, 2));
  const regsAnoErrado = registros.filter(r => r.data_celebacao && !/1965$/.test(r.data_celebacao));
  if (regsAnoErrado.length > 0) {
    console.log("\n[TESTE] ⚠️  Registros com data SEM 1965:", JSON.stringify(regsAnoErrado.map(r=>({n:r.numero, f:r.folha, d:r.data_celebacao, ano_txt:r.ano_texto})), null, 2));
  } else {
    console.log("\n[TESTE] ✅ TODAS as datas com ano 1965!");
  }
  const regsSemNome = registros.filter(r => !r.noivo?.nome || !r.noiva?.nome);
  if (regsSemNome.length > 0) {
    console.log("[TESTE] ⚠️  Registros SEM nome de noivo ou noiva:", JSON.stringify(regsSemNome.map(r=>({n:r.numero, f:r.folha, noivo:r.noivo?.nome||"VAZIO", noiva:r.noiva?.nome||"VAZIO"})), null, 2));
  } else {
    console.log("[TESTE] ✅ TODOS os " + registros.length + " registros com nomes de noivo E noiva!");
  }
  fs.writeFileSync(path.join(__dirname, "registros_1965_PARSER_JS.json"), JSON.stringify(registros, null, 2), "utf-8");
  console.log("\n[TESTE] ✅ JSON salvo em registros_1965_PARSER_JS.json");
} catch (e) {
  console.error("[TESTE] ERRO:", e);
  process.exit(1);
}
