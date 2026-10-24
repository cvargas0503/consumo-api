# MUSA

Galería de obras de dominio público del Art Institute of Chicago. Permite buscar por obra o artista, filtrar por técnica, consultar fichas y guardar favoritos en el navegador.

## Ejecutar

Requiere un navegador moderno, Python 3 y conexión a internet para consultar la colección y cargar las imágenes.

Desde la carpeta del proyecto:

```bash
python -m http.server 8000
```

Abre [http://localhost:8000](http://localhost:8000). Detén el servidor con `Ctrl+C`.

El sitio usa módulos de JavaScript y debe servirse mediante HTTP. No necesita instalación de paquetes, compilación ni claves de API.

## Estructura

```text
index.html
css/
└── styles.css
js/
├── api.js
└── app.js
assets/
└── placeholder.svg
```

- `index.html`: navegación, búsqueda, colección y diálogo de detalle.
- `css/styles.css`: estilos, estados de interacción y diseño adaptable.
- `js/api.js`: peticiones HTTP, búsqueda paginada, detalle de obras y URLs de imágenes.
- `js/app.js`: estado de la interfaz, renderizado, eventos y almacenamiento local de favoritos.
- `assets/placeholder.svg`: imagen alternativa cuando una reproducción no está disponible.

## Datos y comportamiento

Se consulta la [API del Art Institute of Chicago](https://api.artic.edu/docs/):

- `GET /api/v1/artworks/search`: búsqueda y filtros, con nueve resultados por página.
- `GET /api/v1/artworks/{id}`: ficha de una obra.
- Imágenes IIIF: se construyen a partir de `config.iiif_url` e `image_id`.

Las consultas de colección filtran `is_public_domain` y la existencia de una imagen. Los títulos y las fichas conservan el idioma del catálogo original.

La búsqueda utiliza `fetch` con `async/await`; la consulta individual utiliza una cadena de promesas. Se verifican los estados HTTP y se gestionan tiempos de espera, cancelación, respuestas inválidas y errores de conexión. Al cambiar de búsqueda se cancela la petición anterior.

Los favoritos se guardan en `localStorage` bajo la clave `musa:favorites:v1`. Son propios del navegador y no se sincronizan entre dispositivos. La interfaz sigue funcionando si el almacenamiento local no está disponible, aunque los favoritos no persisten después de recargar.

La disponibilidad de datos e imágenes depende del servicio externo. Cada ficha incluye un enlace al registro del museo.
