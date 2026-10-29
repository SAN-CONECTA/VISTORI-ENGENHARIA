# Dependência vendorizada — jsPDF

- Arquivo: `jspdf.umd.min.js`
- Versão: 2.5.1 (build de 2022-01-28)
- Origem: https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
- SHA-256: `98ccf17aa10c20bb1301762618fcc9b6ab3a4e7f26b6071d64d0b41154df3875`
- Licença: MIT (o cabeçalho de licença está preservado no próprio arquivo)

A biblioteca é servida como arquivo estático, sem npm/package.json, e entra no
precache do `sw.js`. Foi escolhida para gerar o PDF no navegador, funcionar no
GitHub Pages e continuar disponível offline depois da primeira carga.

Não altere este arquivo manualmente. Para atualizar, baixe a versão desejada,
confira a licença, atualize o hash acima e o `CACHE`/`SHELL` do service worker.
