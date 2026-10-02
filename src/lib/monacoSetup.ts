// =====================================================================
// Monaco servido pelo proprio dashboard.
//
// Sem esta configuracao, @monaco-editor/react baixa o editor da CDN
// (cdn.jsdelivr.net) ao abrir o comparador: sem internet no navegador a
// comparacao fica parada em "Preparando Monaco Diff...".
//
// Usa os mesmos arquivos que a CDN servia (monaco-editor/min/vs, ja
// minificados), copiados para /monaco/vs pelo plugin "monaco-static" do
// vite.config.ts. Eles nao passam pelo bundle: minificar o Monaco no build
// estoura a memoria do Docker na D01.
// =====================================================================
import { loader } from "@monaco-editor/react";

loader.config({ paths: { vs: `${import.meta.env.BASE_URL}monaco/vs` } });
