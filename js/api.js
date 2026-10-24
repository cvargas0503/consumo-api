const API_URL = 'https://openaccess-api.clevelandart.org/api/artworks';
const PAGE_SIZE = 9;
const TIMEOUT_MS = 15000;
const ARTWORK_TYPES = new Set(['Painting', 'Print', 'Drawing', 'Sculpture']);
const FIELDS = [
  'id', 'title', 'creators', 'creation_date', 'date_text', 'type', 'culture',
  'technique', 'measurements', 'creditline', 'images', 'url', 'share_license_status',
].join(',');

// La cancelación externa y el tiempo límite también cubren la lectura del JSON.
function requestJson(url, { signal } = {}) {
  if (signal?.aborted) {
    return Promise.reject(signal.reason ?? new DOMException('Solicitud cancelada.', 'AbortError'));
  }

  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => {
    controller.abort(new DOMException('El museo tardó demasiado en responder. Inténtalo de nuevo.', 'TimeoutError'));
  }, TIMEOUT_MS);
  const startedAt = performance.now();

  return fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
    .then((response) => {
      if (!response.ok) {
        const error = new Error(`No fue posible consultar el museo (HTTP ${response.status}).`);
        error.status = response.status;
        throw error;
      }

      return response.json()
        .catch((error) => {
          if (error instanceof SyntaxError) {
            throw new Error('El museo devolvió una respuesta JSON inválida.', { cause: error });
          }
          throw error;
        })
        .then((raw) => ({
          raw,
          request: {
            url,
            status: response.status,
            durationMs: Math.round(performance.now() - startedAt),
          },
        }));
    })
    .finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    });
}

// La vista recibe un modelo uniforme; raw conserva la respuesta original.
function normalizeArtwork(item) {
  const artist = (item.creators ?? [])
    .map((creator) => creator.description?.replace(/\s*\([^()]*\)\s*$/, ''))
    .filter(Boolean)
    .join(', ');
  const image = imageUrl(item.images?.web?.url);

  return {
    id: item.id,
    title: item.title,
    artist_title: artist || null,
    date_display: item.creation_date ?? item.date_text ?? null,
    image_url: image,
    thumbnail: { alt_text: [item.title, artist].filter(Boolean).join(' — ') },
    is_public_domain: item.share_license_status === 'CC0',
    artwork_type_title: item.type ?? null,
    place_of_origin: Array.isArray(item.culture) ? item.culture.join('; ') : (item.culture ?? null),
    medium_display: item.technique ?? null,
    dimensions: item.measurements ?? null,
    credit_line: item.creditline ?? null,
    museum_url: item.url ?? '',
  };
}

export async function searchArtworks({ query = '', type = '', page = 1, signal } = {}) {
  if (type && !ARTWORK_TYPES.has(type)) {
    throw new Error('El tipo de obra seleccionado no es válido.');
  }

  const pageNumber = Math.trunc(Number(page));
  const currentPage = Number.isSafeInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  const url = new URL(`${API_URL}/`);
  const text = String(query).trim();
  if (text) url.searchParams.set('q', text);
  if (type) url.searchParams.set('type', type);
  url.searchParams.set('has_image', '1');
  url.searchParams.set('cc0', '1');
  url.searchParams.set('limit', PAGE_SIZE);
  url.searchParams.set('skip', (currentPage - 1) * PAGE_SIZE);
  url.searchParams.set('fields', FIELDS);
  url.searchParams.set('indent', '0');

  const { raw, request } = await requestJson(url.href, { signal });
  const total = Number(raw?.info?.total);
  if (!Array.isArray(raw?.data) || !Number.isFinite(total) || total < 0
    || !raw.data.every((item) => Number.isSafeInteger(item?.id) && item.id > 0)) {
    throw new Error('El museo devolvió una lista de obras inválida.');
  }

  return {
    items: raw.data.map(normalizeArtwork),
    pagination: {
      total,
      currentPage,
      totalPages: Math.ceil(total / PAGE_SIZE),
    },
    request,
    raw,
  };
}

export function getArtwork(id, { signal } = {}) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) {
    return Promise.reject(new Error('El identificador de la obra no es válido.'));
  }

  const url = new URL(`${API_URL}/${Number(id)}`);
  url.searchParams.set('fields', FIELDS);
  url.searchParams.set('indent', '0');

  return requestJson(url.href, { signal }).then(({ raw, request }) => {
    if (!raw?.data || Array.isArray(raw.data) || !Number.isSafeInteger(raw.data.id)) {
      throw new Error('El museo devolvió una ficha de obra inválida.');
    }
    return { item: normalizeArtwork(raw.data), request, raw };
  });
}

export function imageUrl(image) {
  if (typeof image !== 'string') return '';
  try {
    const url = new URL(image);
    if (url.protocol !== 'https:' || url.host !== 'openaccess-cdn.clevelandart.org'
      || url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}
