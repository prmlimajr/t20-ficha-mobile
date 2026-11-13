/**
 * T20 — Ficha Mobile
 *
 * Transforma o celular/tablet do jogador num controle da própria ficha de Tormenta20:
 *
 * - Nada além da ficha e do chat: o canvas (mapa, tokens, luzes, WebGL) é desligado neste
 *   aparelho, o áudio é zerado e toda a interface do Foundry fica escondida.
 * - A ficha de personagem abre em tela cheia, montada em uma única coluna (template próprio que
 *   reaproveita as partes da ficha do sistema; dados, rolagens e menus são os do T20).
 * - Uma barra no rodapé alterna entre Ficha e Chat.
 *
 * Tudo é decidido por aparelho (configurações "client"). O mestre e a TV não são afetados.
 */
const MODULE_ID = "t20-ficha-mobile";
const TEMPLATE = `modules/${MODULE_ID}/templates/ficha-mobile.hbs`;

/** Chaves de localStorage usadas para desfazer o que o módulo alterou no aparelho. */
const MARCA_CANVAS = `${MODULE_ID}.forcouNoCanvas`;
const MARCA_AUDIO = `${MODULE_ID}.volumesOriginais`;
const CHAVES_VOLUME = ["core.globalPlaylistVolume", "core.globalAmbientVolume", "core.globalInterfaceVolume"];

/** Documentos cujas janelas não abrem no celular (diários, cenas, imagens mostradas pelo mestre...). */
const DOCUMENTOS_BLOQUEADOS = ["JournalEntry", "JournalEntryPage", "Scene", "Playlist", "PlaylistSound", "Macro", "RollTable", "Cards"];
const JANELAS_BLOQUEADAS = ["ImagePopout", "JournalSheet", "JournalEntrySheet", "JournalPageSheet", "JournalEntryPageSheet"];

let ATIVO = false;

const cfg = (chave) => game.settings.get(MODULE_ID, chave);
const loc = (chave) => game.i18n.localize(`T20FM.${chave}`);
const msoAtivo = () => Boolean(game.modules.get("mobile-sheet-only")?.active);

/* -------------------------------------------- */
/*  Configurações                               */
/* -------------------------------------------- */

function registrarConfiguracoes() {
  game.settings.register(MODULE_ID, "modo", {
    name: "T20FM.Config.modo.Nome",
    hint: "T20FM.Config.modo.Dica",
    scope: "client",
    config: true,
    type: String,
    choices: {
      auto: "T20FM.Config.modo.Auto",
      sempre: "T20FM.Config.modo.Sempre",
      nunca: "T20FM.Config.modo.Nunca"
    },
    default: "auto",
    requiresReload: true
  });

  game.settings.register(MODULE_ID, "zoom", {
    name: "T20FM.Config.zoom.Nome",
    hint: "T20FM.Config.zoom.Dica",
    scope: "client",
    config: true,
    type: Number,
    range: { min: 60, max: 150, step: 5 },
    default: 100,
    onChange: aplicarZoom
  });

  game.settings.register(MODULE_ID, "tempoAviso", {
    name: "T20FM.Config.tempoAviso.Nome",
    hint: "T20FM.Config.tempoAviso.Dica",
    scope: "client",
    config: true,
    type: Number,
    range: { min: 0, max: 15, step: 1 },
    default: 4
  });

  game.settings.register(MODULE_ID, "dados3d", {
    name: "T20FM.Config.dados3d.Nome",
    hint: "T20FM.Config.dados3d.Dica",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  game.settings.register(MODULE_ID, "manterTelaLigada", {
    name: "T20FM.Config.manterTelaLigada.Nome",
    hint: "T20FM.Config.manterTelaLigada.Dica",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  // Personagem escolhido neste aparelho (quando o jogador possui mais de um).
  game.settings.register(MODULE_ID, "personagem", {
    scope: "client",
    config: false,
    type: String,
    default: ""
  });
}

/* -------------------------------------------- */
/*  Detecção                                    */
/* -------------------------------------------- */

function usuarioEhMestre() {
  if (game.user) return game.user.isGM;
  const u = game.data?.users?.find((x) => x._id === game.userId);
  return (u?.role ?? 0) >= CONST.USER_ROLES.ASSISTANT;
}

function aparelhoMovel() {
  const ua = navigator.userAgent;
  // Smart TVs e dongles costumam se identificar como Android: nunca tratar como celular.
  if (/SmartTV|Smart-TV|GoogleTV|Android TV|AFT\w|BRAVIA|Tizen|Web0S|webOS|CrKey|HbbTV/i.test(ua)) return false;
  const uaMovel = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua);
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const soToque = matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches;
  return uaMovel || iPadOS || soToque;
}

/** Permite forçar o modo pela URL: /game?t20fm=1 (sempre), ?t20fm=0 (nunca), ?t20fm=auto. */
function lerParametroUrl() {
  const p = new URLSearchParams(window.location.search).get("t20fm");
  const mapa = { 1: "sempre", sempre: "sempre", 0: "nunca", nunca: "nunca", auto: "auto" };
  const modo = mapa[p] ?? null;
  if (modo && modo !== cfg("modo")) game.settings.set(MODULE_ID, "modo", modo).catch(() => {});
  return modo;
}

function decidirModo(forcado) {
  const modo = forcado ?? cfg("modo");
  if (modo === "nunca") return false;
  // O "Mobile Sheet Only" já cuida do aparelho; aqui fica só a ficha em coluna.
  if (msoAtivo()) return false;
  if (modo === "sempre") return true;
  return !usuarioEhMestre() && aparelhoMovel();
}

/* -------------------------------------------- */
/*  Canvas e áudio (gravados direto no          */
/*  localStorage, onde o Foundry guarda as      */
/*  configurações "client", antes de o canvas   */
/*  ser criado)                                 */
/* -------------------------------------------- */

/** Dice So Nice ativo no mundo e permitido neste aparelho? */
function usarDados3d() {
  return Boolean(game.modules.get("dice-so-nice")?.active) && cfg("dados3d");
}

/**
 * Sem Dice So Nice: canvas desligado de vez (core.noCanvas).
 * Com Dice So Nice: o canvas precisa existir (o DSN se desliga em modo "sem canvas" e usa o
 * relógio de animação do canvas), então ele fica ligado, mas sempre vazio: ver canvasEmBranco().
 */
function prepararAparelho(ativo) {
  try {
    if (ativo) {
      if (!usarDados3d()) {
        if (localStorage.getItem("core.noCanvas") !== "true") {
          localStorage.setItem("core.noCanvas", "true");
          localStorage.setItem(MARCA_CANVAS, "1");
        }
      } else if (localStorage.getItem(MARCA_CANVAS) === "1") {
        localStorage.setItem("core.noCanvas", "false");
        localStorage.removeItem(MARCA_CANVAS);
      }
      if (localStorage.getItem(MARCA_AUDIO) === null) {
        const originais = Object.fromEntries(CHAVES_VOLUME.map((k) => [k, localStorage.getItem(k)]));
        localStorage.setItem(MARCA_AUDIO, JSON.stringify(originais));
      }
      for (const k of CHAVES_VOLUME) localStorage.setItem(k, "0");
      return;
    }
    // Modo desligado: desfaz só o que o próprio módulo alterou.
    if (localStorage.getItem(MARCA_CANVAS) === "1") {
      localStorage.setItem("core.noCanvas", "false");
      localStorage.removeItem(MARCA_CANVAS);
    }
    const salvo = localStorage.getItem(MARCA_AUDIO);
    if (salvo !== null) {
      for (const [k, v] of Object.entries(JSON.parse(salvo))) {
        if (v === null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      }
      localStorage.removeItem(MARCA_AUDIO);
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | não foi possível ajustar canvas/áudio`, err);
  }
}

/* -------------------------------------------- */
/*  Ficha em coluna única                       */
/* -------------------------------------------- */

const ROTULOS = ["T20.CharacterSheet", "T20.CharacterSheetTabbed"];
const CLASSES = [];

/** Ficha de Personagem e Ficha de Personagem - Abas. */
function encontrarClasses() {
  const apps = globalThis.tormenta20?.applications ?? {};
  const achadas = [apps.ActorSheetT20Character, apps.ActorSheetT20CharacterTabbed].filter(Boolean);
  // Reserva: procura pelas fichas registradas para "character" pelo rótulo.
  for (const s of Object.values(CONFIG.Actor?.sheetClasses?.character ?? {})) {
    if (ROTULOS.includes(s.label) && s.cls && !achadas.includes(s.cls)) achadas.push(s.cls);
  }
  return achadas;
}

function getterDe(proto, nome) {
  for (let p = proto; p; p = Object.getPrototypeOf(p)) {
    const d = Object.getOwnPropertyDescriptor(p, nome);
    if (d?.get) return d.get;
  }
  return null;
}

/** Usa a coluna única? (modo jogador deste módulo ou modo celular do "Mobile Sheet Only"). */
function ehMobile(app) {
  return app.actor?.type === "character" && (ATIVO || document.body.classList.contains("mso-ativo"));
}

/**
 * Troca o template (e o "layout", que o sistema usa para preparar os dados) da ficha de
 * personagem. A ficha com abas também passa a usar "character-base", cujos dados incluem o
 * inventário geral que a coluna mostra. A ficha limitada (sem permissão) continua a do sistema.
 */
function adaptarClasses() {
  if (CLASSES.length) return;
  for (const Cls of encontrarClasses()) {
    const proto = Cls.prototype;
    const templateOriginal = getterDe(proto, "template");
    const layoutOriginal = getterDe(proto, "layout");
    if (!templateOriginal || !layoutOriginal) continue;

    Object.defineProperty(proto, "template", {
      configurable: true,
      get() {
        const t = templateOriginal.call(this);
        if (String(t).includes("limited-sheet")) return t;
        return ehMobile(this) ? TEMPLATE : t;
      }
    });
    Object.defineProperty(proto, "layout", {
      configurable: true,
      get() {
        return ehMobile(this) ? "character-base" : layoutOriginal.call(this);
      }
    });
    CLASSES.push(Cls);
  }
  if (!CLASSES.length) console.warn(`${MODULE_ID} | não consegui adaptar as fichas do Tormenta20`);
}

/**
 * A barra de atalhos fica fixa no topo enquanto a ficha rola, então precisa de fundo opaco.
 * O fundo da ficha vem do Foundry (muda com a versão e com o tema claro/escuro), então copiamos
 * o fundo real do primeiro elemento acima dela que tenha cor ou textura.
 */
function copiarFundo(alvo, limite) {
  const transparente = (c) => !c || c === "transparent" || /rgba\(.*,\s*0\)$/.test(c);
  for (let p = alvo.parentElement; p; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (!transparente(s.backgroundColor) || s.backgroundImage !== "none") {
      alvo.style.backgroundColor = transparente(s.backgroundColor) ? "" : s.backgroundColor;
      alvo.style.backgroundImage = s.backgroundImage;
      alvo.style.backgroundSize = s.backgroundSize;
      alvo.style.backgroundRepeat = s.backgroundRepeat;
      return;
    }
    if (p === limite) return;
  }
}

/** Marca a janela da coluna (o CSS tira a largura mínima de 720 px) e liga os atalhos. */
/**
 * No celular, deslizar o dedo sobre um item "arrastável" pode virar arrastar e soltar (Chrome no
 * Android, Safari no iPad), e a ficha entende como mover/reordenar o item. Ninguém arrasta itens
 * no celular, então o arrasto é desligado: o dedo só rola a ficha.
 */
function desligarArrasto(e) {
  for (const d of e.querySelectorAll('[draggable="true"]')) d.draggable = false;
}

const ARRASTO_BLOQUEADO = ".t20fm-app, .t20fm-tela";

/** Reserva: barra qualquer arrasto que comece ou termine numa ficha em coluna (ou janela do modo jogador). */
function bloquearArrastoGlobal() {
  const barrar = (ev) => {
    const alvo = ev.target instanceof Element ? ev.target : ev.target?.parentElement;
    if (!alvo?.closest(ARRASTO_BLOQUEADO)) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "none";
  };
  for (const tipo of ["dragstart", "dragover", "drop"]) document.addEventListener(tipo, barrar, true);
}

function aoRenderizarFicha(app, html) {
  const e = elementoDe(app, html);
  if (!e) return;
  const coluna = Boolean(e.querySelector("form.t20fm"));
  e.classList.toggle("t20fm-app", coluna);
  if (!coluna) return;
  desligarArrasto(e);
  const atalhos = e.querySelector(".t20fm-atalhos");
  if (atalhos) copiarFundo(atalhos, e);
  for (const a of e.querySelectorAll("[data-t20fm-ir]")) {
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      e.querySelector(`[data-t20fm-secao="${a.dataset.t20fmIr}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

/* -------------------------------------------- */
/*  Viewport, zoom e tela                       */
/* -------------------------------------------- */

/**
 * Faz o canvas desenhar sempre uma "cena em branco" (como quando não há cena ativa):
 * sem mapa, tokens, luzes ou texturas, mas com o motor de animação rodando para o Dice So Nice.
 */
function canvasEmBranco() {
  const C = foundry.canvas?.Canvas ?? globalThis.Canvas;
  const original = C?.prototype?.draw;
  if (typeof original !== "function") return;
  C.prototype.draw = function (_cena) {
    return original.call(this, null);
  };
}

function ajustarViewport() {
  let meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "viewport";
    document.head.append(meta);
  }
  // maximum-scale=1 evita o zoom automático do iOS ao tocar em campos de texto.
  meta.content = "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover";
}

function aplicarZoom() {
  document.body.style.setProperty("--t20fm-zoom", String((Number(cfg("zoom")) || 100) / 100));
}

let travaTela = null;
async function manterTelaLigada() {
  if (!cfg("manterTelaLigada") || !("wakeLock" in navigator)) return;
  if (travaTela && !travaTela.released) return;
  try {
    travaTela = await navigator.wakeLock.request("screen");
  } catch {
    // Exige HTTPS e a página visível; tenta de novo no próximo toque.
  }
}

function alternarTelaCheia() {
  if (document.fullscreenElement) return document.exitFullscreen?.();
  return document.documentElement.requestFullscreen?.().catch(() => {});
}

/* -------------------------------------------- */
/*  Personagem                                  */
/* -------------------------------------------- */

function personagensDisponiveis() {
  return game.actors.filter((a) => a.isOwner && a.type === "character").sort((a, b) => a.name.localeCompare(b.name));
}

/** Quando true, o fundo mostra a lista de personagens mesmo havendo um atribuído. */
let escolhendo = false;

function personagemAtual() {
  if (escolhendo) return null;
  const salvo = game.actors.get(cfg("personagem"));
  if (salvo?.isOwner) return salvo;
  const atribuido = game.user.character;
  if (atribuido?.isOwner) return atribuido;
  const lista = personagensDisponiveis();
  return lista.length === 1 ? lista[0] : null;
}

function trocarPersonagem() {
  escolhendo = true;
  for (const app of janelasEmTelaCheia()) if (!ehChatPopout(app)) app.close();
  mostrarAba("ficha");
  atualizarFundo();
}

async function escolherPersonagem(actor) {
  escolhendo = false;
  await game.settings.set(MODULE_ID, "personagem", actor.id);
  atualizarFundo();
  abrirFicha();
}

function trazerParaFrente(app) {
  if (typeof app.bringToFront === "function") app.bringToFront();
  else app.bringToTop?.();
  if (app.minimized) app.maximize?.();
}

function abrirFicha() {
  mostrarAba("ficha");
  const actor = personagemAtual();
  if (!actor) return atualizarFundo();
  const sheet = actor.sheet;
  if (!sheet) return;
  if (sheet.rendered) trazerParaFrente(sheet);
  else sheet.render(true);
}

function popoutDoChat() {
  return ui.chat?.popout ?? ui.chat?._popout ?? null;
}

async function abrirChat() {
  mostrarAba("chat");
  UI.badge?.classList.remove("visivel");
  esconderAviso();
  const chat = ui.chat;
  if (!chat) return;
  try {
    const aberto = popoutDoChat();
    if (aberto?.rendered) trazerParaFrente(aberto);
    else if (typeof chat.renderPopout === "function") await chat.renderPopout(true);
    else await chat.createPopout?.().render(true);
    setTimeout(() => popoutDoChat()?.scrollBottom?.(), 100);
  } catch (err) {
    console.warn(`${MODULE_ID} | não foi possível abrir o chat`, err);
  }
}

async function sairDoModo() {
  await game.settings.set(MODULE_ID, "modo", "nunca");
  window.location.reload();
}

/* -------------------------------------------- */
/*  Interface própria (fundo, barra, menu)      */
/* -------------------------------------------- */

const UI = { fundo: null, barra: null, menu: null, badge: null, aviso: null, timerAviso: null };

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function botao(icone, texto, acao, classe = "t20fm-botao") {
  const b = el("button", classe);
  b.type = "button";
  b.innerHTML = `<i class="${icone}"></i>`;
  b.append(el("span", "", texto));
  b.addEventListener("click", (ev) => {
    ev.preventDefault();
    fecharMenu();
    acao();
  });
  return b;
}

function montarInterface() {
  document.body.classList.add("t20fm-ativo");
  aplicarZoom();

  UI.fundo = el("div");
  UI.fundo.id = "t20fm-fundo";

  // Barra do rodapé: Ficha | Chat | Mais
  UI.barra = el("nav");
  UI.barra.id = "t20fm-barra";
  const bFicha = botao("fa-solid fa-id-card", loc("Barra.Ficha"), abrirFicha, "t20fm-aba");
  bFicha.dataset.aba = "ficha";
  const bChat = botao("fa-solid fa-comments", loc("Barra.Chat"), abrirChat, "t20fm-aba");
  bChat.dataset.aba = "chat";
  UI.badge = el("span", "t20fm-badge");
  bChat.append(UI.badge);
  const bMais = el("button", "t20fm-aba");
  bMais.type = "button";
  bMais.innerHTML = `<i class="fa-solid fa-ellipsis-vertical"></i>`;
  bMais.append(el("span", "", loc("Barra.Mais")));
  bMais.addEventListener("click", (ev) => {
    ev.preventDefault();
    UI.menu.classList.contains("aberto") ? fecharMenu() : abrirMenu();
  });
  UI.barra.append(bFicha, bChat, bMais);

  UI.menu = el("div");
  UI.menu.id = "t20fm-menu";

  // Aviso de novidade no chat (um só elemento: um aviso por vez).
  UI.aviso = el("div");
  UI.aviso.id = "t20fm-aviso";
  UI.aviso.setAttribute("role", "status");
  UI.aviso.addEventListener("click", () => {
    esconderAviso();
    abrirChat();
  });

  document.body.append(UI.fundo, UI.aviso, UI.menu, UI.barra);
  document.addEventListener("pointerdown", (ev) => {
    if (!ev.target.closest?.("#t20fm-menu, #t20fm-barra")) fecharMenu();
    manterTelaLigada();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") manterTelaLigada();
  });

  mostrarAba("ficha");
  atualizarFundo();
}

function mostrarAba(aba) {
  document.body.dataset.t20fmAba = aba;
}

function abrirMenu() {
  const m = UI.menu;
  m.replaceChildren();
  if (personagensDisponiveis().length > 1) m.append(botao("fa-solid fa-users", loc("Menu.Trocar"), trocarPersonagem));
  if (document.documentElement.requestFullscreen) m.append(botao("fa-solid fa-expand", loc("Menu.TelaCheia"), alternarTelaCheia));
  if (game.modules.get("dice-so-nice")?.active) {
    const ligados = Boolean(cfg("dados3d"));
    m.append(
      botao("fa-solid fa-dice-d20", loc(ligados ? "Menu.Dados3dDesligar" : "Menu.Dados3dLigar"), async () => {
        await game.settings.set(MODULE_ID, "dados3d", !ligados);
        window.location.reload(); // o canvas só liga ou desliga ao carregar a página
      })
    );
  }
  m.append(botao("fa-solid fa-rotate", loc("Menu.Recarregar"), () => window.location.reload()));
  m.append(botao("fa-solid fa-desktop", loc("Menu.Sair"), sairDoModo, "t20fm-botao t20fm-sair"));
  m.classList.add("aberto");
}

function fecharMenu() {
  UI.menu?.classList.remove("aberto");
}

/**
 * Imagem do token do personagem. Tokens "curinga" (caminho com * ou ?, sorteado ao colocar o
 * token na cena) não têm uma imagem só; nesse caso, e se não houver token, usa a do ator.
 */
function imagemDoToken(actor) {
  const src = actor.prototypeToken?.texture?.src ?? actor.prototypeToken?.img;
  const curinga = actor.prototypeToken?.randomImg || /[*?]/.test(src ?? "");
  return src && !curinga ? src : actor.img;
}

/** Tela atrás da ficha: retrato + botão, ou a lista para escolher personagem. */
function atualizarFundo() {
  const f = UI.fundo;
  if (!f) return;
  f.replaceChildren();
  const cartao = el("div", "t20fm-cartao");
  f.append(cartao);

  const actor = personagemAtual();
  if (actor) {
    const img = el("img", "t20fm-retrato");
    img.src = imagemDoToken(actor);
    img.alt = "";
    img.addEventListener("error", () => (img.src = actor.img), { once: true });
    cartao.append(img, el("h1", "t20fm-nome", actor.name));
    cartao.append(botao("fa-solid fa-id-card", loc("Barra.Ficha"), abrirFicha, "t20fm-botao t20fm-principal"));
    return;
  }

  const lista = personagensDisponiveis();
  if (!lista.length) {
    cartao.append(el("h1", "t20fm-nome", game.user.name));
    cartao.append(el("p", "t20fm-texto", loc("Fundo.SemPersonagem")));
    cartao.append(botao("fa-solid fa-rotate", loc("Menu.Recarregar"), () => window.location.reload()));
    return;
  }

  cartao.append(el("h1", "t20fm-nome", loc("Fundo.Escolha")));
  const ul = el("div", "t20fm-lista");
  for (const a of lista) {
    const item = el("button", "t20fm-item");
    item.type = "button";
    const moldura = el("span", "t20fm-token");
    const img = el("img");
    img.src = imagemDoToken(a);
    img.alt = "";
    img.addEventListener("error", () => (img.src = a.img), { once: true });
    moldura.append(img);
    item.append(moldura, el("span", "t20fm-item-nome", a.name));
    item.addEventListener("click", () => escolherPersonagem(a));
    ul.append(item);
  }
  cartao.append(ul);
}

/* -------------------------------------------- */
/*  Janelas                                     */
/* -------------------------------------------- */

function elementoDe(app, html) {
  let e = app?.element;
  if (e && !(e instanceof HTMLElement)) e = e[0];
  if (!(e instanceof HTMLElement)) e = html instanceof HTMLElement ? html : html?.[0];
  return e instanceof HTMLElement ? e : null;
}

function ehChatPopout(app) {
  const ChatLog = ui.chat?.constructor;
  return Boolean(ChatLog && app instanceof ChatLog && app !== ui.chat);
}

function ehFichaDeDocumento(app) {
  const doc = app.document ?? app.object;
  return ["Actor", "Item"].includes(doc?.documentName);
}

function ehBloqueada(app) {
  const doc = app.document ?? app.object;
  if (DOCUMENTOS_BLOQUEADOS.includes(doc?.documentName)) return true;
  for (let c = app.constructor; c?.name; c = Object.getPrototypeOf(c)) {
    if (JANELAS_BLOQUEADAS.includes(c.name)) return true;
  }
  return false;
}

function janelasEmTelaCheia() {
  const v1 = Object.values(ui.windows ?? {});
  const v2 = Array.from(foundry.applications?.instances?.values?.() ?? []);
  return [...v1, ...v2].filter((app) => app.rendered && elementoDe(app)?.classList.contains("t20fm-tela"));
}

function aoRenderizar(app, html) {
  if (!ATIVO) return;
  const janela = app.popOut ?? app.hasFrame ?? false;
  if (!janela) return;
  const e = elementoDe(app, html);
  if (!e) return;

  // Diários, cenas, imagens mostradas pelo mestre etc.: não abrem no celular.
  if (ehBloqueada(app)) {
    e.style.display = "none";
    app.close();
    return;
  }

  e.classList.add("t20fm-janela");
  if (ehChatPopout(app)) {
    e.classList.add("t20fm-tela", "t20fm-chat");
    return;
  }
  if (ehFichaDeDocumento(app)) {
    e.classList.add("t20fm-tela");
    // Uma ficha (ou item aberto a partir dela) sempre aparece na aba Ficha.
    mostrarAba("ficha");
    return;
  }
  // Diálogos (rolagens, confirmações): sempre cabem na tela.
  requestAnimationFrame(() => {
    const r = e.getBoundingClientRect();
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (r.left < 0 || r.right > W) e.style.left = `${Math.max(4, (W - Math.min(r.width, W - 8)) / 2)}px`;
    if (r.top < 0 || r.bottom > H) e.style.top = `${Math.max(4, (H - Math.min(r.height, H - 8)) / 2)}px`;
  });
}

function aoFechar(app) {
  if (!ATIVO) return;
  if (ehChatPopout(app)) mostrarAba("ficha");
}

/** Impede que dois toques no cabeçalho minimizem a ficha. */
function bloquearMinimizar() {
  document.addEventListener(
    "dblclick",
    (ev) => {
      if (ev.target.closest?.(".t20fm-tela .window-header")) ev.stopPropagation();
    },
    true
  );
}

/**
 * iOS não dispara "contextmenu" ao segurar o dedo, e a ficha do T20 usa o botão direito nos
 * itens (editar, excluir, equipar). O toque longo vira um clique direito. No Android já é nativo.
 */
function toqueLongoNoIOS() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!ios) return;
  let timer = null;
  let inicio = null;
  let engolirClique = false;
  const cancelar = () => {
    clearTimeout(timer);
    timer = null;
  };
  document.addEventListener(
    "touchstart",
    (ev) => {
      if (ev.touches.length !== 1) return cancelar();
      const t = ev.touches[0];
      const alvo = ev.target;
      if (!alvo.closest?.(".t20fm-janela") || alvo.closest("input, textarea, select, [contenteditable]")) return;
      inicio = { x: t.clientX, y: t.clientY };
      timer = setTimeout(() => {
        timer = null;
        engolirClique = true;
        alvo.dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: inicio.x, clientY: inicio.y, button: 2, buttons: 2 })
        );
      }, 550);
    },
    { passive: true }
  );
  document.addEventListener(
    "touchmove",
    (ev) => {
      if (!timer || !inicio) return;
      const t = ev.touches[0];
      if (Math.hypot(t.clientX - inicio.x, t.clientY - inicio.y) > 10) cancelar();
    },
    { passive: true }
  );
  document.addEventListener("touchend", cancelar, { passive: true });
  document.addEventListener("touchcancel", cancelar, { passive: true });
  document.addEventListener(
    "click",
    (ev) => {
      if (!engolirClique) return;
      engolirClique = false;
      ev.preventDefault();
      ev.stopPropagation();
    },
    true
  );
}

/** Some com o aviso "resolução mínima de 1024x700", que não faz sentido aqui. */
function removerAvisoResolucao() {
  const modelo = game.i18n.localize("ERROR.LowResolution");
  if (!modelo || modelo === "ERROR.LowResolution") return;
  const prefixo = modelo.split("{")[0].trim().slice(0, 40);
  if (!prefixo) return;
  for (const n of document.querySelectorAll("#notifications .notification")) {
    if (n.textContent.trim().startsWith(prefixo)) n.remove();
  }
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

Hooks.once("init", () => {
  registrarConfiguracoes();
  if (game.system?.id !== "tormenta20") return;

  const forcado = lerParametroUrl();
  ATIVO = decidirModo(forcado);
  console.log(`${MODULE_ID} | modo jogador ${ATIVO ? "ATIVO" : "desligado"}`, {
    configuracao: forcado ?? cfg("modo"),
    mestre: usuarioEhMestre(),
    aparelhoMovel: aparelhoMovel(),
    mobileSheetOnly: msoAtivo()
  });
  prepararAparelho(ATIVO);

  // Ficha em coluna: no modo jogador deste módulo ou no modo celular do "Mobile Sheet Only".
  const carregar = foundry.applications?.handlebars?.loadTemplates ?? globalThis.loadTemplates;
  carregar?.([TEMPLATE]);
  adaptarClasses();
  Hooks.on("renderActorSheet", aoRenderizarFicha);
  bloquearArrastoGlobal();

  if (!ATIVO) return;
  if (usarDados3d()) canvasEmBranco();
  ajustarViewport();
  bloquearMinimizar();
  toqueLongoNoIOS();
  Hooks.on("renderApplication", aoRenderizar);
  Hooks.on("renderApplicationV2", aoRenderizar);
  Hooks.on("closeApplication", aoFechar);
  Hooks.on("closeApplicationV2", aoFechar);
});

Hooks.once("setup", () => {
  if (game.system?.id !== "tormenta20") return;
  adaptarClasses(); // reserva, caso as fichas ainda não estivessem registradas no init
  if (!ATIVO || usarDados3d()) return;
  // Reforço: garante o canvas desligado mesmo que o Foundry mantenha um cache das configurações.
  try {
    if (!game.settings.get("core", "noCanvas")) game.settings.set("core", "noCanvas", true);
  } catch {}
});

Hooks.once("ready", () => {
  if (!ATIVO) return;
  montarInterface();
  manterTelaLigada();
  setTimeout(removerAvisoResolucao, 500);
  setTimeout(removerAvisoResolucao, 2000);
  setTimeout(abrirFicha, 300);

  Hooks.on("updateUser", (user, mudancas) => {
    if (user.id === game.user.id && "character" in mudancas) atualizarFundo();
  });
  Hooks.on("updateActor", (actor, mudancas) => {
    if ("ownership" in mudancas || (actor.id === personagemAtual()?.id && ("name" in mudancas || "img" in mudancas || "prototypeToken" in mudancas))) {
      atualizarFundo();
    }
  });
  Hooks.on("createActor", () => atualizarFundo());
  Hooks.on("deleteActor", () => atualizarFundo());

  // Novidade no chat enquanto o jogador está na ficha: marca o botão do chat e mostra o aviso.
  // Rolagem com dados 3D: o aviso só aparece depois que os dados param, para não entregar o resultado.
  Hooks.on("createChatMessage", (msg) => depoisDosDados(msg, () => avisarChat(msg, false)));
  Hooks.on("updateChatMessage", (msg, mudancas) => {
    if ("content" in mudancas || "rolls" in mudancas) avisarChat(msg, true);
  });
});

/* -------------------------------------------- */
/*  Aviso de novidade no chat                   */
/* -------------------------------------------- */

function textoPuro(html, limite = 90) {
  if (!html) return "";
  // DOMParser não executa scripts nem handlers do conteúdo.
  const t = new DOMParser().parseFromString(String(html), "text/html").body.textContent ?? "";
  const limpo = t.replace(/\s+/g, " ").trim();
  return limpo.length > limite ? `${limpo.slice(0, limite - 1)}…` : limpo;
}

function avisarChat(msg, atualizada) {
  if (document.body.dataset.t20fmAba === "chat") return; // já está vendo o chat
  if (msg.visible === false) return; // sussurro para outra pessoa
  UI.badge?.classList.add("visivel");

  const segundos = Number(cfg("tempoAviso")) || 0;
  if (segundos <= 0 || !UI.aviso) return;

  const autor = msg.speaker?.alias || (msg.author ?? msg.user)?.name || loc("Aviso.Chat");
  let texto;
  let valor = "";
  if (msg.rolls?.length) {
    const visivel = msg.isContentVisible !== false;
    texto = textoPuro(msg.flavor, 60) || loc("Aviso.Rolagem");
    valor = visivel ? msg.rolls.map((r) => r.total).join(" / ") : "?";
  } else {
    texto = textoPuro(msg.content) || loc("Aviso.Mensagem");
  }
  if (atualizada) texto = `${loc("Aviso.Atualizada")}: ${texto}`;
  mostrarAviso(autor, texto, valor, segundos);
}

/**
 * Com o Dice So Nice rodando, espera os dados pararem antes de avisar
 * (com um limite, caso a rolagem não seja animada).
 */
function depoisDosDados(msg, fn) {
  if (!game.dice3d || !msg.rolls?.length) return fn();
  let feito = false;
  const executar = () => {
    if (feito) return;
    feito = true;
    Hooks.off("diceSoNiceRollComplete", hook);
    clearTimeout(limite);
    fn();
  };
  const hook = Hooks.on("diceSoNiceRollComplete", (id) => {
    if (id === msg.id) executar();
  });
  const limite = setTimeout(executar, 10000);
}

/** Um aviso por vez: um novo substitui o atual e reinicia o tempo. */
function mostrarAviso(autor, texto, valor, segundos) {
  const a = UI.aviso;
  const corpo = el("div", "t20fm-aviso-corpo");
  corpo.append(el("strong", "t20fm-aviso-autor", autor), el("span", "t20fm-aviso-texto", texto));
  a.replaceChildren(el("i", "fa-solid fa-comment-dots"), corpo);
  if (valor) a.append(el("strong", "t20fm-aviso-valor", valor));

  clearTimeout(UI.timerAviso);
  if (a.classList.contains("visivel")) {
    // Já visível: volta para baixo sem animação e sobe de novo, para mostrar que o conteúdo mudou.
    a.style.transition = "none";
    a.classList.remove("visivel");
    void a.offsetWidth;
    a.style.transition = "";
  }
  a.classList.add("visivel");
  UI.timerAviso = setTimeout(esconderAviso, segundos * 1000);
}

function esconderAviso() {
  clearTimeout(UI.timerAviso);
  UI.aviso?.classList.remove("visivel");
}
