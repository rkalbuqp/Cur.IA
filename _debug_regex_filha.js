const t1 = "com 24 anos de idade, solteira, doméstica, filha de Cassemiro Alves da Silva e Joana Maria da Conceição, natural da Paróquia de Surubim, residente e domiciliada em Salobro.";
const t2 = "com 26 anos de idade, solteiro, agricultor, filho de Manoel Carlos da Silva e Maria José da Conceição, natural da Paróquia de João Alfredo, residente e domiciliado em Salobro.";
const re = /filho(?:a)?\s+de\s+([^,;\.]+?)\s+e\s+([^,;\.]+?)(?:,|;|$|\.\s)/i;
console.log("Teste 1 (filha):", t1.match(re));
console.log("\nTeste 2 (filho):", t2.match(re));
const re2 = /filh[oa]\s+de\s+([^,;\.]+?)\s+e\s+([^,;\.]+?)(?:,|;|$|\.\s)/i;
console.log("\n\n== Outro regex ==");
console.log("T1:", t1.match(re2));
console.log("T2:", t2.match(re2));
// Sem negative lookahead, apenas sem trailing . no class
const re3 = /filh[oa]\s+de\s+([^,;.]+?)\s+e\s+([^,;.]+?)(?:\s*,|\s*;|\s*$|\.\s)/i;
console.log("\n== Regex 3 ==");
console.log("T1:", t1.match(re3));
console.log("T2:", t2.match(re3));
