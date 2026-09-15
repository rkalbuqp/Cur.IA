const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DOCX1 = path.join(__dirname, "Transcrição Registros de Casamento 1965 - Paróquia de João Alfredo.docx");
const DOCX2 = path.join(__dirname, "Transcrição do Livro de Registros de Casamento - 1966 (Paróquia de João Alfredo).docx");
const DOCX_PATH = fs.existsSync(DOCX2) ? DOCX2 : (fs.existsSync(DOCX1) ? DOCX1 : null);
const WIDGET_PATH = path.join(__dirname, "extension", "content", "widget.js");

if (!DOCX_PATH) {
  console.log("Nenhum docx encontrado na raiz. Testando com TEXTO EXEMPLO do usuário:");
  const EXEMPLO = `Transcrição do Livro de Registros de Casamento - 1966 (Paróquia de João Alfredo)
Termo N. 1
Ano: 1966
Data do casamento: Aos quatro dias do mês de janeiro do ano de mil novecentos e sessenta e seis, pelas 8 horas, na matriz desta Paróquia de João Alfredo, da Diocese de Nazaré (Pernambuco-Brasil) após o preenchimento das exigências canônicas, perante o Redmo. Pe. Jonas Menezes, presentes as testemunhas Adauto Messias do Nascimento e Manoel Batista da Silva, receberam-se em matrimônio, na forma do Ritual Romano:
O Nubente: Raimundo Cardoso da Silva, com 26 anos de idade, solteiro, agricultor, filho de Manoel Carlos da Silva e Maria José da Conceição, natural da Paróquia de João Alfredo, residente e domiciliado em Salobro.
A Nubente: Severina Maria da Conceição, com 24 anos de idade, solteira, doméstica, filha de Cassemiro Alves da Silva e Joana Maria da Conceição, natural da Paróquia de Surubim, residente e domiciliada em Salobro.
Observações: Extraído para documento 11-12-78.
Termo N. 2
Ano: 1966
Data do casamento: Aos quatro dias do mês de janeiro do ano de mil novecentos e sessenta e seis, pelas 8 horas, na matriz desta Paróquia de João Alfredo, da Diocese de Nazaré (Pernambuco-Brasil) após o preenchimento das exigências canônicas, perante o Redmo. Pe. Jonas Menezes, presentes as testemunhas Severino Ferreira da Silva e Benjamim Alves Cordeiro, receberam-se em matrimônio, na forma do Ritual Romano:
O Nubente: Antônio José de Arruda, com 27 anos de idade, solteiro, agricultor, filho de Pedro José de Arruda e Severina Maria da Conceição, natural da Paróquia de Surubim, residente e domiciliado em Olho d'Água Cercado.
A Nubente: Severina Alves Cordeiro, com 19 anos de idade, solteira, doméstica, filha de Manoel Salustiano Alves e Maria Alves Cordeiro, natural da Paróquia de João Alfredo, residente e domiciliada em Jamandua.
Observações: (Nenhuma)`;
  const src = fs.readFileSync(WIDGET_PATH, "utf-8");
  const ini = src.indexOf("const MESES_WORD");
  const fim = src.indexOf("const processarUploadWord");
  const parserJS = src.substring(ini, fim);
  const codigo = parserJS + `
const linhas = \`${EXEMPLO}\`.split(/\\n/).map(l=>l.replace(/\\r/g,"").trim()).filter(l=>l);
const regs = extrairTodosOsRegistrosWord(linhas);
return regs;
`;
  const F = new Function(codigo);
  const regs = F();
  console.log("Total regs (deveria ser 2):", regs.length);
  for (const r of regs) {
    console.log("\n====== Termo N.", r.numero, "======");
    console.log("L/F/N:", r.livro, "/", r.folha, "/", r.numero);
    console.log("Ano texto:", r.ano_texto);
    console.log("Data:", r.data_celebacao, "| Hora:", r.hora_celebacao);
    console.log("Local:", r.local_celebacao);
    console.log("Padre (T.Qualificada): JSON =", JSON.stringify(r.testemunha_qualificada));
    console.log("Testemunhas:", JSON.stringify(r.testemunha_noivo), "/", JSON.stringify(r.testemunha_noiva));
    console.log("Noivo:", JSON.stringify(r.noivo, null, 1));
    console.log("Noiva:", JSON.stringify(r.noiva, null, 1));
  }
  console.log("\n====== VALIDAÇÕES ======");
  const r1 = regs[0];
  let okPadre = r1.testemunha_qualificada && r1.testemunha_qualificada.toUpperCase().indexOf("JONAS") >= 0;
  console.log("Padre contém Pe. Jonas Menezes?", okPadre ? "✅ SIM [" + r1.testemunha_qualificada + "]" : "❌ NÃO [" + r1.testemunha_qualificada + "]");
  let okPaiNoivo = !!(r1.noivo && r1.noivo.pai && r1.noivo.pai.indexOf("Manoel Carlos") >= 0);
  let okMaeNoivo = !!(r1.noivo && r1.noivo.mae && r1.noivo.mae.indexOf("Maria José") >= 0);
  let okProfNoivo = !!(r1.noivo && r1.noivo.profissao && r1.noivo.profissao.toUpperCase().indexOf("AGRICULT") >= 0);
  console.log("Noivo.pai = Manoel Carlos da Silva?", okPaiNoivo ? "✅ SIM [" + r1.noivo.pai + "]" : "❌ NÃO [" + (r1.noivo?.pai||"VAZIO") + "]");
  console.log("Noivo.mae = Maria José da Conceição?", okMaeNoivo ? "✅ SIM [" + r1.noivo.mae + "]" : "❌ NÃO [" + (r1.noivo?.mae||"VAZIO") + "]");
  console.log("Noivo.profissao = agricultor?", okProfNoivo ? "✅ SIM [" + r1.noivo.profissao + "]" : "❌ NÃO [" + (r1.noivo?.profissao||"VAZIO") + "]");
  let okPaiNoiva = !!(r1.noiva && r1.noiva.pai && r1.noiva.pai.indexOf("Cassemiro") >= 0);
  let okMaeNoiva = !!(r1.noiva && r1.noiva.mae && r1.noiva.mae.indexOf("Joana Maria") >= 0);
  let okProfNoiva = !!(r1.noiva && r1.noiva.profissao && r1.noiva.profissao.toUpperCase().indexOf("DOMESTIC") >= 0);
  console.log("Noiva.pai = Cassemiro Alves da Silva?", okPaiNoiva ? "✅ SIM [" + r1.noiva.pai + "]" : "❌ NÃO [" + (r1.noiva?.pai||"VAZIO") + "]");
  console.log("Noiva.mae = Joana Maria da Conceição?", okMaeNoiva ? "✅ SIM [" + r1.noiva.mae + "]" : "❌ NÃO [" + (r1.noiva?.mae||"VAZIO") + "]");
  console.log("Noiva.profissao = doméstica?", okProfNoiva ? "✅ SIM [" + r1.noiva.profissao + "]" : "❌ NÃO [" + (r1.noiva?.profissao||"VAZIO") + "]");
  const tudo = okPadre && okPaiNoivo && okMaeNoivo && okProfNoivo && okPaiNoiva && okMaeNoiva && okProfNoiva;
  console.log("\nResultado geral:", tudo ? "🎉 TODAS AS VALIDAÇÕES PASSARAM!" : "⚠️  Alguma falhou - ver acima.");
  process.exit(tudo ? 0 : 2);
}

const src = fs.readFileSync(WIDGET_PATH, "utf-8");
const ini = src.indexOf("const MESES_WORD");
const fim = src.indexOf("const processarUploadWord");
if (ini < 0 || fim < 0) throw new Error("Parser não encontrado no widget.js");
const parserJS = src.substring(ini, fim);
const factory = new Function(parserJS + `
return {
  extrairTodosOsRegistrosWord, extrairPadreLinhaWord, extrairDadosPessoaLinhaWord,
  extrairDataLinhaWord, extrairHoraLinhaWord, extrairLocalLinhaWord, extrairTestemunhasLinhaWord
};
`);
const P = factory();

function lerUI32(v,o){return v.getUint32(o,!0)}
function lerUI16(v,o){return v.getUint16(o,!0)}
function procurarNoZip(buf,nome){
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tam = buf.length;
  let oe = -1;
  for (let i = tam - 22; i >= Math.max(0,tam-65557); i--) if (lerUI32(v,i) === 0x06054b50) {oe=i;break;}
  if (oe < 0) throw new Error("EOCD");
  const offcd = lerUI32(v, oe + 16);
  let o = offcd;
  while (o < tam) {
    if (lerUI32(v,o) !== 0x02014b50) break;
    const tn = lerUI16(v,o+28), te = lerUI16(v,o+30), tc = lerUI16(v,o+32);
    const comp = lerUI16(v,o+10), tc_ = lerUI32(v,o+20), ol = lerUI32(v,o+42);
    const nome = buf.slice(o+46, o+46+tn).toString("utf-8");
    if (nome === nome) {
      const olh = ol, tnl = lerUI16(v,olh+26), tel = lerUI16(v,olh+28);
      const ini = olh + 30 + tnl + tel;
      const comprim = buf.slice(ini, ini + tc_);
      return comp === 0 ? comprim : zlib.inflateRawSync(comprim);
    }
    o += 46 + tn + te + tc;
  }
  throw new Error("Não achou arquivo: " + nome);
}
function linhasDocx(buf) {
  const xml = procurarNoZip(buf, "word/document.xml").toString("utf-8");
  const ls = [];
  const reP = /<w:p\b(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/gi;
  let m;
  while ((m = reP.exec(xml)) !== null) {
    const sub = m[1].split(/<w:br\b[^>]*\/?>/gi);
    for (const s of sub) {
      const reT = /<w:t\b(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gi;
      const pt = []; let mt;
      while ((mt = reT.exec(s)) !== null) pt.push(mt[1]);
      const t = pt.join("").replace(/\s+/g, " ").trim();
      if (t.length > 0) ls.push(t);
    }
  }
  return ls;
}
const buf = fs.readFileSync(DOCX_PATH);
const L = linhasDocx(Buffer.from(buf));
console.log("DOCX usado:", path.basename(DOCX_PATH), "| Total linhas:", L.length);
const R = P.extrairTodosOsRegistrosWord(L);
console.log("\n========== QUALIDADE (DOCX REAL) ==========");
console.log("Total registros:", R.length);
if (R.length) {
  console.log("Faixa Folha:", R[0].folha, "→", R[R.length-1].folha, "| Faixa Nº:", R[0].numero, "→", R[R.length-1].numero);
}
const temPadreBom = R.filter(r => r.testemunha_qualificada && r.testemunha_qualificada.length > 10 && !/^[A-Z][a-z]+$/.test(r.testemunha_qualificada.trim())).length;
const comData = R.filter(r => /\d{2}\/\d{2}\/19(?:65|66)/.test(r.data_celebacao || "")).length;
const comProfNoivo = R.filter(r => r.noivo?.profissao && r.noivo.profissao.trim() && r.noivo.profissao !== "—").length;
const comPaiNoivo = R.filter(r => r.noivo?.pai && r.noivo.pai.trim() && r.noivo.pai.length > 3 && r.noivo.pai !== "—").length;
const comMaeNoivo = R.filter(r => r.noivo?.mae && r.noivo.mae.trim() && r.noivo.mae.length > 3 && r.noivo.mae !== "—").length;
const comProfNoiva = R.filter(r => r.noiva?.profissao && r.noiva.profissao.trim() && r.noiva.profissao !== "—").length;
const comPaiNoiva = R.filter(r => r.noiva?.pai && r.noiva.pai.trim() && r.noiva.pai.length > 3 && r.noiva.pai !== "—").length;
const comMaeNoiva = R.filter(r => r.noiva?.mae && r.noiva.mae.trim() && r.noiva.mae.length > 3 && r.noiva.mae !== "—").length;
console.log("Datas (ano 1965/66):", comData, "/", R.length);
console.log("Padre COMPLETO (>10 chars):", temPadreBom, "/", R.length);
console.log("Noivo.Profissão:", comProfNoivo, "| Pai:", comPaiNoivo, "| Mãe:", comMaeNoivo);
console.log("Noiva.Profissão:", comProfNoiva, "| Pai:", comPaiNoiva, "| Mãe:", comMaeNoiva);
console.log("\n====== PRIMEIRO REGISTRO ======");
console.log(JSON.stringify(R[0], null, 2));
console.log("\n====== ÚLTIMO REGISTRO ======");
console.log(JSON.stringify(R[R.length-1], null, 2));
fs.writeFileSync(path.join(__dirname, "_tmp_parser_novo.json"), JSON.stringify(R, null, 2), "utf-8");
console.log("\nJSON salvo em _tmp_parser_novo.json");
