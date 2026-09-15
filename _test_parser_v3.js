const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DOCX_PATH = path.join(__dirname, "Transcrição Registros de Casamento 1965 - Paróquia de João Alfredo.docx");
const WIDGET_PATH = path.join(__dirname, "extension", "content", "widget.js");

const src = fs.readFileSync(WIDGET_PATH, "utf-8");
const startParser = src.indexOf("const MESES_WORD");
const fimParser = src.indexOf("const processarUploadWord");
if (startParser < 0 || fimParser < 0) throw new Error("Não achou parser no widget.js");

const parserCode = src.substring(startParser, fimParser);
const codigoCompleto = parserCode + `
return { extrairTodosOsRegistrosWord, extrairNomePessoaLinhaWord, extrairDadosPessoaLinhaWord, extrairPadreLinhaWord };
`;
console.log("Tamanho parser carregado:", codigoCompleto.length, "bytes");
const factory = new Function(codigoCompleto);
try {
  const P = factory();
  // --- Função standalone de extrair linhas DOCX (para Node.js, sem DOMParser) ---
  function lerUI32(v,o){return v.getUint32(o,true);}
  function lerUI16(v,o){return v.getUint16(o,true);}
  function procZip(buf, nome) {
    const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const tam = buf.length;
    let oe = -1;
    for (let i = tam - 22; i >= Math.max(0, tam-65557); i--) if (lerUI32(v,i) === 0x06054b50) {oe=i;break;}
    if (oe < 0) throw new Error("EOCD");
    const offcd = lerUI32(v, oe + 16);
    let o = offcd;
    while (o < tam) {
      if (lerUI32(v,o) !== 0x02014b50) break;
      const tn = lerUI16(v,o+28), te = lerUI16(v,o+30), tc = lerUI16(v,o+32);
      const comp = lerUI16(v,o+10), tcomp = lerUI32(v,o+20), ol = lerUI32(v,o+42);
      const nomeArq = buf.slice(o+46, o+46+tn).toString("utf-8");
      if (nomeArq === nome) {
        const olh = ol, tnl = lerUI16(v,olh+26), tel = lerUI16(v,olh+28);
        const ini = olh + 30 + tnl + tel;
        const comprim = buf.slice(ini, ini + tcomp);
        return comp === 0 ? comprim : zlib.inflateRawSync(comprim);
      }
      o += 46 + tn + te + tc;
    }
    throw new Error("Não achou arquivo: " + nome);
  }
  function extraiLinhasDocx(buf) {
    const xmlBytes = procZip(Buffer.from(buf), "word/document.xml");
    const xml = xmlBytes.toString("utf-8");
    const ls = [];
    const reP = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/gi;
    let m;
    while ((m = reP.exec(xml)) !== null) {
      const sub = m[1].split(/<w:br\b[^>]*\/?>/gi);
      for (const s of sub) {
        const reT = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi;
        const pt = []; let mt;
        while ((mt = reT.exec(s)) !== null) pt.push(mt[1]);
        const t = pt.join("").replace(/\s+/g, " ").trim();
        if (t.length > 0) ls.push(t);
      }
    }
    return ls;
  }
  const buf = fs.readFileSync(DOCX_PATH);
  const linhas = extraiLinhasDocx(buf);
  console.log("Total linhas extraídas:", linhas.length);
  console.log("==== PRIMEIRAS 40 LINHAS ====");
  for (let i = 0; i < Math.min(40, linhas.length); i++) {
    const l = linhas[i];
    const marcs = [];
    if (/^\s*Ano\b/i.test(l)) marcs.push("ANO");
    if (/^\s*Data\s+do\s+casamento/i.test(l)) marcs.push("DATA");
    if (/^\s*O\s+Nubente\b/i.test(l)) marcs.push("NOIVO");
    if (/^\s*A\s+Nubente\b/i.test(l)) marcs.push("NOIVA");
    if (/Folha\s*\d+/i.test(l)) marcs.push("FOLHA");
    if (/Termo\s*N\.?\s*\d+/i.test(l)) marcs.push("TERMO");
    console.log(`L${i+1}: [${marcs.join(",")||" "}] ${l.slice(0,180)}`);
  }
  const regs = P.extrairTodosOsRegistrosWord(linhas);
  console.log("\n\n====== RESULTADOS EXTRAÇÃO =====");
  console.log("TOTAL REGISTROS:", regs.length);
  const comData = regs.filter(r => r.data_celebacao && /1965$/.test(r.data_celebacao)).length;
  const comDataBruta = regs.filter(r => r.data_celebacao).length;
  const comHora = regs.filter(r => r.hora_celebacao).length;
  const comLocal = regs.filter(r => r.local_celebacao).length;
  const comPadre = regs.filter(r => r.testemunha_qualificada && r.testemunha_qualificada.length > 5).length;
  const comNoivo = regs.filter(r => r.noivo && r.noivo.nome).length;
  const comNoiva = regs.filter(r => r.noiva && r.noiva.nome).length;
  const comPaiNoivo = regs.filter(r => r.noivo && r.noivo.pai && r.noivo.pai !== "—").length;
  const comMaeNoivo = regs.filter(r => r.noivo && r.noivo.mae && r.noivo.mae !== "—").length;
  const comPaiNoiva = regs.filter(r => r.noiva && r.noiva.pai && r.noiva.pai !== "—").length;
  const comMaeNoiva = regs.filter(r => r.noiva && r.noiva.mae && r.noiva.mae !== "—").length;
  const comProfNoivo = regs.filter(r => r.noivo && r.noivo.profissao && r.noivo.profissao !== "—").length;
  const comProfNoiva = regs.filter(r => r.noiva && r.noiva.profissao && r.noiva.profissao !== "—").length;
  const comT1 = regs.filter(r => r.testemunha_noivo).length;
  const comT2 = regs.filter(r => r.testemunha_noiva).length;
  console.log(`Datas (ano 1965): ${comData} / ${regs.length}`);
  console.log(`Datas (qualquer): ${comDataBruta}`);
  console.log(`Horas: ${comHora}`);
  console.log(`Locais: ${comLocal}`);
  console.log(`Padres (T.Qualificada completa): ${comPadre}`);
  console.log(`Nomes Noivo: ${comNoivo} | Profissão: ${comProfNoivo} | Pai: ${comPaiNoivo} | Mãe: ${comMaeNoivo}`);
  console.log(`Nomes Noiva: ${comNoiva} | Profissão: ${comProfNoiva} | Pai: ${comPaiNoiva} | Mãe: ${comMaeNoiva}`);
  console.log(`Testemunha Noivo: ${comT1}`);
  console.log(`Testemunha Noiva: ${comT2}`);
  console.log("\n====== REGISTRO 0 ======");
  console.log(JSON.stringify(regs[0], null, 2));
  console.log("\n====== REGISTRO 60 (MEIO) ======");
  console.log(JSON.stringify(regs[60], null, 2));
} catch (e) {
  console.error("ERRO execução:", e);
}

