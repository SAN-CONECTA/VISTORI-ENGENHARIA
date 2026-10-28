// Ponto único de navegação/atualização da tela.
//
// Existe para que as views possam redesenhar a página sem importar o roteador:
// importar `router.js` de dentro de uma view criaria dependência circular
// (router -> views -> router). Aqui a seta aponta só para cá.

let renderizar = () => {};

/** Registrado pelo roteador no carregamento do módulo. */
export const setRenderer = fn => { renderizar = fn; };

/** Redesenha a rota atual (equivale ao antigo `render()`). */
export const refresh = () => renderizar();
