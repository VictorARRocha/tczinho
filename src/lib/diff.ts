// Diff de linhas simples baseado em LCS.
export type DiffOp = "equal" | "add" | "del";
export interface DiffLine {
  op: DiffOp;
  baseLine?: number;
  atualLine?: number;
  text: string;
}

export function diffLines(a: string, b: string): DiffLine[] {
  const A = a.split(/\r?\n/);
  const B = b.split(/\r?\n/);
  const m = A.length;
  const n = B.length;
  // tabela LCS (limite p/ proteger memória)
  const MAX = 4000;
  if (m > MAX || n > MAX) {
    // fallback: comparação linha-a-linha simples
    const out: DiffLine[] = [];
    const len = Math.max(m, n);
    for (let i = 0; i < len; i++) {
      if (A[i] === B[i]) out.push({ op: "equal", baseLine: i + 1, atualLine: i + 1, text: A[i] ?? "" });
      else {
        if (A[i] !== undefined) out.push({ op: "del", baseLine: i + 1, text: A[i] });
        if (B[i] !== undefined) out.push({ op: "add", atualLine: i + 1, text: B[i] });
      }
    }
    return out;
  }
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (A[i] === B[j]) { out.push({ op: "equal", baseLine: i + 1, atualLine: j + 1, text: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ op: "del", baseLine: i + 1, text: A[i] }); i++; }
    else { out.push({ op: "add", atualLine: j + 1, text: B[j] }); j++; }
  }
  while (i < m) { out.push({ op: "del", baseLine: i + 1, text: A[i] }); i++; }
  while (j < n) { out.push({ op: "add", atualLine: j + 1, text: B[j] }); j++; }
  return out;
}
