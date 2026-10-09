// Decodificacao de arquivos de texto das evidencias.
//
// Os arquivos do TestComplete misturam codificacoes na mesma linha: o prefixo
// ("Referência: 01/2017; ...") sai em ANSI (windows-1252) e o XML do eSocial
// dentro dele sai em UTF-8 ("ÚNICO"). Decodificar o arquivo inteiro de um jeito
// so estraga uma das partes ("ÃŠNICO" ou "Refer�ncia"). Aqui cada trecho e lido
// como UTF-8 quando forma uma sequencia UTF-8 valida e como windows-1252 quando nao.

// windows-1252 difere do Latin-1 so na faixa 0x80-0x9F.
const CP1252_80_9F = [
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8d, 0x017d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178,
];

function cp1252(byte: number): number {
  return byte >= 0x80 && byte <= 0x9f ? CP1252_80_9F[byte - 0x80] : byte;
}

/** Tamanho da sequencia UTF-8 valida que comeca em i (0 = nao e UTF-8). */
function utf8SequenceLength(bytes: Uint8Array, i: number): number {
  const b = bytes[i];
  const len = b >= 0xc2 && b <= 0xdf ? 2 : b >= 0xe0 && b <= 0xef ? 3 : b >= 0xf0 && b <= 0xf4 ? 4 : 0;
  if (!len || i + len > bytes.length) return 0;
  for (let k = 1; k < len; k++) if ((bytes[i + k] & 0xc0) !== 0x80) return 0;
  // Rejeita formas longas demais e surrogates (nao sao UTF-8 de verdade).
  if (len === 3 && b === 0xe0 && bytes[i + 1] < 0xa0) return 0;
  if (len === 3 && b === 0xed && bytes[i + 1] >= 0xa0) return 0;
  if (len === 4 && b === 0xf0 && bytes[i + 1] < 0x90) return 0;
  if (len === 4 && b === 0xf4 && bytes[i + 1] >= 0x90) return 0;
  return len;
}

function decodeMixed(bytes: Uint8Array): string {
  const out: string[] = [];
  let codes: number[] = [];
  const flush = () => {
    if (codes.length) { out.push(String.fromCodePoint(...codes)); codes = []; }
  };
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    if (b < 0x80) { codes.push(b); i++; }
    else {
      const len = utf8SequenceLength(bytes, i);
      if (len === 2) codes.push(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      else if (len === 3) codes.push(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
      else if (len === 4) codes.push(((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f));
      else codes.push(cp1252(b));
      i += len || 1;
    }
    if (codes.length >= 8192) flush();
  }
  flush();
  return out.join("");
}

/** Texto de um arquivo de evidencia: UTF-8 quando valido; senao, leitura mista UTF-8/windows-1252. */
export function decodeEvidenceText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = decodeMixed(bytes);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
