import { searchArtworks, getArtwork, imageUrl } from './api.js';

const $ = (selector) => document.querySelector(selector);
const STORAGE_KEY = 'musa:favorites:v1';
const PLACEHOLDER = 'assets/placeholder.svg';
const TYPE_LABELS = { Painting: 'Pintura', Print: 'Grabado', Drawing: 'Dibujo', Sculpture: 'Escultura' };
const state = {
  query: '', type: '', page: 1, mode: 'explore', items: [],
  pagination: { total: 0, currentPage: 1, totalPages: 0 },
};
let searchController;
let detailController;
let searchVersion = 0;
let dialogVersion = 0;
let dialogItem;
let detailTrigger;
let favorites = readFavorites();

function text(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value ?? '';
  return element;
}

function artworkImage(item) {
  return imageUrl(item.image_url) || PLACEHOLDER;
}

function prepareImage(img, item) {
  img.src = artworkImage(item);
  img.alt = item.thumbnail?.alt_text || item.title || 'Obra de la colección';
  img.addEventListener('error', () => {
    img.src = PLACEHOLDER;
    img.alt = `Reproducción no disponible: ${item.title || 'obra de la colección'}`;
    img.classList.add('image-unavailable');
  }, { once: true });
}

function readFavorites() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter((entry) => entry?.item && Number.isSafeInteger(entry.item.id)
      && typeof entry.item.title === 'string').slice(0, 300);
  } catch {
    showStorageNotice();
    return [];
  }
}

function showStorageNotice() {
  const notice = $('#storage-notice');
  notice.textContent = 'El almacenamiento local no está disponible. Tus favoritas se conservarán solo mientras esta página esté abierta.';
  notice.hidden = false;
}

function isSaved(id) {
  return favorites.some((entry) => entry.item.id === id);
}

function updateFavoritesCount() {
  $('#favorites-count').textContent = favorites.length;
}

function toggleFavorite(item) {
  const focusedIndex = [...document.querySelectorAll('#art-grid .save-button')].indexOf(document.activeElement);
  if (isSaved(item.id)) {
    favorites = favorites.filter((entry) => entry.item.id !== item.id);
  } else {
    if (favorites.length >= 300) {
      $('#storage-notice').textContent = 'Puedes guardar hasta 300 obras. Retira una favorita para añadir otra.';
      $('#storage-notice').hidden = false;
      return;
    }
    favorites.push({ item });
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites)); }
  catch { showStorageNotice(); }
  updateFavoritesCount();
  document.querySelectorAll('[data-save-id]').forEach((button) => {
    const saved = isSaved(Number(button.dataset.saveId));
    button.setAttribute('aria-pressed', String(saved));
    const title = button.dataset.title;
    button.setAttribute('aria-label', `${saved ? 'Quitar de' : 'Guardar en'} favoritas: ${title}`);
    if (button.classList.contains('detail-save')) button.textContent = saved ? 'Quitar de favoritas' : 'Guardar en favoritas';
  });
  if (state.mode === 'favorites') {
    renderFavorites();
    if (focusedIndex >= 0 && !$('#art-dialog').open) {
      const buttons = [...document.querySelectorAll('#art-grid .save-button')];
      (buttons[Math.min(focusedIndex, buttons.length - 1)] || $('#feedback-action')).focus();
    }
  }
}

function saveButton(item, detail = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = detail ? 'button outline detail-save' : 'save-button';
  button.dataset.saveId = item.id;
  button.dataset.title = item.title;
  const saved = isSaved(item.id);
  button.setAttribute('aria-label', `${saved ? 'Quitar de' : 'Guardar en'} favoritas: ${item.title}`);
  button.setAttribute('aria-pressed', String(saved));
  if (detail) {
    button.textContent = saved ? 'Quitar de favoritas' : 'Guardar en favoritas';
  } else {
    // Icono estático; los datos externos se insertan siempre como texto.
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-8-4.7-8-10.1A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.9C20 15.3 12 20 12 20Z"/></svg>';
  }
  button.addEventListener('click', () => toggleFavorite(item));
  return button;
}

function renderCards(entries) {
  const grid = $('#art-grid');
  const fragment = document.createDocumentFragment();
  entries.forEach(({ item }) => {
    const article = text('article', 'art-card');
    const open = text('button', 'art-open');
    open.type = 'button';
    open.setAttribute('aria-label', `Ver ficha: ${item.title}`);
    const imageWrap = text('div', 'image-wrap');
    const img = document.createElement('img');
    img.width = 600;
    img.height = 500;
    img.loading = 'lazy';
    prepareImage(img, item);
    imageWrap.append(img);
    open.append(imageWrap,
      text('p', 'card-type', TYPE_LABELS[item.artwork_type_title] || item.artwork_type_title || 'Obra de arte'),
      text('h3', '', item.title),
      text('p', 'card-artist', item.artist_title || 'Autor no identificado'),
      text('p', 'card-date', item.date_display || 'Fecha no disponible'));
    open.addEventListener('click', () => openDetail(item.id));
    article.append(open, saveButton(item));
    fragment.append(article);
  });
  grid.replaceChildren(fragment);
  grid.setAttribute('aria-busy', 'false');
}

function showSkeletons() {
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < 6; index++) {
    const card = text('div', 'skeleton');
    card.setAttribute('aria-hidden', 'true');
    card.append(text('div', 'image-wrap'), text('div', 'skeleton-line'), text('div', 'skeleton-line short'));
    fragment.append(card);
  }
  $('#art-grid').replaceChildren(fragment);
  $('#art-grid').setAttribute('aria-busy', 'true');
}

function feedback(label, title, message, action, actionLabel) {
  $('#feedback-label').textContent = label;
  $('#feedback-title').textContent = title;
  $('#feedback-text').textContent = message;
  const button = $('#feedback-action');
  button.textContent = actionLabel;
  button.onclick = action;
  $('#feedback').hidden = false;
}

function setNavigation(mode) {
  state.mode = mode;
  for (const [id, active] of [['#explore-link', mode === 'explore'], ['#favorites-link', mode === 'favorites']]) {
    if (active) $(id).setAttribute('aria-current', 'page');
    else $(id).removeAttribute('aria-current');
  }
  $('#view-label').textContent = mode === 'favorites' ? 'MI COLECCIÓN / FAVORITAS' : 'EXPLORAR / COLECCIÓN';
}

function updateSearchUrl() {
  const url = new URL(location.href);
  for (const [key, value] of [['q', state.query], ['type', state.type], ['page', state.page > 1 ? state.page : '']]) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  history.replaceState(null, '', url);
}

async function loadCollection({ scroll = false } = {}) {
  searchController?.abort();
  searchController = new AbortController();
  const version = ++searchVersion;
  setNavigation('explore');
  $('#feedback').hidden = true;
  $('#pagination').hidden = true;
  $('#results-summary').textContent = 'Consultando la colección…';
  showSkeletons();
  updateSearchUrl();
  if (scroll) $('#coleccion').scrollIntoView({ behavior: 'instant' });
  try {
    const result = await searchArtworks({ query: state.query, type: state.type, page: state.page, signal: searchController.signal });
    if (version !== searchVersion) return;
    if (result.pagination.total > 0 && state.page > result.pagination.totalPages) {
      state.page = result.pagination.totalPages;
      return loadCollection();
    }
    state.items = result.items;
    state.pagination = result.pagination;
    const number = new Intl.NumberFormat('es').format(result.pagination.total);
    $('#results-summary').textContent = `${number} obras${state.query ? ` para “${state.query}”` : ' por descubrir'}${state.type ? ` · ${TYPE_LABELS[state.type]}` : ''}`;
    renderCards(result.items.map((item) => ({ item })));
    if (!result.items.length) {
      feedback('OTRA FORMA DE MIRAR', 'No encontramos obras', 'Prueba otro nombre o cambia el tipo de obra. También puedes volver a explorar la colección completa.', resetSearch, 'Explorar toda la colección');
    } else {
      $('#page-label').textContent = `Página ${result.pagination.currentPage} de ${result.pagination.totalPages}`;
      $('#previous-page').disabled = state.page <= 1;
      $('#next-page').disabled = state.page >= result.pagination.totalPages;
      $('#pagination').hidden = result.pagination.totalPages <= 1;
    }
  } catch (error) {
    if (version !== searchVersion || error.name === 'AbortError') return;
    console.error('No se pudo cargar la colección:', error);
    $('#art-grid').replaceChildren();
    $('#art-grid').setAttribute('aria-busy', 'false');
    $('#results-summary').textContent = 'No fue posible cargar la colección';
    feedback('PAUSA EN LA VISITA', 'No pudimos conectar con el museo', error.name === 'TimeoutError'
      ? 'El museo está tardando más de lo esperado. Puedes volver a intentarlo.'
      : 'Revisa tu conexión e inténtalo de nuevo. Tus favoritas siguen disponibles en este navegador.', () => loadCollection(), 'Reintentar');
  }
}

function renderFavorites() {
  searchController?.abort();
  searchVersion++;
  setNavigation('favorites');
  $('#feedback').hidden = true;
  $('#pagination').hidden = true;
  $('#results-summary').textContent = `${favorites.length} ${favorites.length === 1 ? 'obra guardada' : 'obras guardadas'} en tus favoritas`;
  renderCards(favorites);
  if (!favorites.length) {
    feedback('TU PROPIA MIRADA', 'Una colección por comenzar', 'Pulsa el corazón de cualquier obra para guardarla aquí y volver a encontrarla.', resetSearch, 'Descubrir obras');
  }
}

function resetSearch() {
  state.query = '';
  state.type = '';
  state.page = 1;
  $('#search-input').value = '';
  $('#type-select').value = '';
  loadCollection();
}

function detailLoading() {
  const box = text('div', 'detail-error');
  box.append(text('h2', '', 'Una mirada más cerca'), text('p', 'muted', 'Consultando la ficha de la obra…'));
  box.firstChild.id = 'dialog-title';
  $('#dialog-content').replaceChildren(box);
}

async function openDetail(id) {
  detailController?.abort();
  detailController = new AbortController();
  const version = ++dialogVersion;
  const dialog = $('#art-dialog');
  dialogItem = id;
  detailLoading();
  if (!dialog.open) {
    detailTrigger = document.activeElement;
    dialog.showModal();
  }
  try {
    const result = await getArtwork(id, { signal: detailController.signal });
    if (version !== dialogVersion || !dialog.open) return;
    const { item } = result;
    const layout = text('div', 'detail-layout');
    const img = document.createElement('img');
    img.className = 'detail-image';
    prepareImage(img, item);
    const copy = text('div', 'detail-copy');
    const title = text('h2', '', item.title);
    title.id = 'dialog-title';
    copy.append(text('p', 'eyebrow', 'COLECCIÓN ABIERTA · CC0'), title,
      text('p', '', item.artist_title || 'Autor no identificado'), text('p', 'muted', item.date_display || 'Fecha no disponible'));
    const metadata = document.createElement('dl');
    for (const [label, value] of [['Tipo', TYPE_LABELS[item.artwork_type_title] || item.artwork_type_title], ['Técnica', item.medium_display], ['Origen', item.place_of_origin], ['Dimensiones', item.dimensions], ['Crédito', item.credit_line]]) {
      if (value) metadata.append(text('dt', '', label), text('dd', '', value));
    }
    copy.append(metadata, saveButton(item, true));
    if (safeMuseumUrl(item.museum_url)) {
      const link = text('a', 'button dark', 'Ver en el museo ↗');
      link.href = safeMuseumUrl(item.museum_url);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      copy.append(link);
    }
    layout.append(img, copy);
    $('#dialog-content').replaceChildren(layout);
  } catch (error) {
    if (version !== dialogVersion || error.name === 'AbortError') return;
    const box = text('div', 'detail-error');
    const title = text('h2', '', 'La ficha no está disponible');
    title.id = 'dialog-title';
    const retry = text('button', 'button dark', 'Reintentar');
    retry.type = 'button';
    retry.addEventListener('click', () => openDetail(dialogItem));
    box.append(title, text('p', 'muted', 'No pudimos consultar la obra. Revisa tu conexión y vuelve a intentarlo.'), retry);
    $('#dialog-content').replaceChildren(box);
  }
}

function safeMuseumUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['clevelandart.org', 'www.clevelandart.org'].includes(url.hostname) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

async function loadFeatured() {
  try {
    const result = await searchArtworks({ query: 'Monet', type: 'Painting' });
    const item = result.items[0];
    if (!item) throw new Error('Sin obra destacada');
    prepareImage($('#featured-image'), item);
    $('#featured-title').textContent = item.title;
    $('#featured-artist').textContent = `${item.artist_title || 'Autor no identificado'} · ${item.date_display || ''}`;
  } catch (error) {
    console.error('No se pudo cargar la obra destacada:', error);
    $('#featured-title').textContent = 'Un espacio para descubrir';
    $('#featured-artist').textContent = 'La obra destacada no está disponible por el momento';
  }
}

$('#search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  state.query = $('#search-input').value.trim();
  state.type = $('#type-select').value;
  state.page = 1;
  loadCollection();
});
document.querySelectorAll('[data-query]').forEach((button) => button.addEventListener('click', () => {
  state.query = button.dataset.query;
  state.type = '';
  state.page = 1;
  $('#search-input').value = state.query;
  $('#type-select').value = '';
  loadCollection();
}));
$('#clear-search').addEventListener('click', resetSearch);
$('#explore-link').addEventListener('click', () => loadCollection());
$('#favorites-link').addEventListener('click', renderFavorites);
$('#previous-page').addEventListener('click', () => { if (state.page > 1) { state.page--; loadCollection({ scroll: true }); } });
$('#next-page').addEventListener('click', () => { if (state.page < state.pagination.totalPages) { state.page++; loadCollection({ scroll: true }); } });
$('#close-dialog').addEventListener('click', () => $('#art-dialog').close());
$('#art-dialog').addEventListener('close', () => {
  detailController?.abort();
  dialogVersion++;
  if (detailTrigger?.isConnected) detailTrigger.focus();
  else (state.mode === 'favorites' ? $('#favorites-link') : $('#explore-link')).focus();
});

const params = new URLSearchParams(location.search);
state.query = (params.get('q') || '').slice(0, 100);
state.type = Object.hasOwn(TYPE_LABELS, params.get('type')) ? params.get('type') : '';
const initialPage = Number(params.get('page'));
state.page = Number.isSafeInteger(initialPage) && initialPage > 0 ? initialPage : 1;
$('#search-input').value = state.query;
$('#type-select').value = state.type;
updateFavoritesCount();
loadCollection();
loadFeatured();
