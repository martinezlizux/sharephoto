# 🎨 Spruce Spirit Design System & Theme Guide

Este documento sirve como manual técnico y guía de diseño para reutilizar este proyecto como una plantilla (template) para futuros photobooths de IA.

## 1. 🌈 Paleta de Colores (Design Tokens)
Todos los colores están centralizados en `:root` dentro de `style.css`. Cambiando estos valores, cambias toda la identidad del sitio.

| Variable | Valor Actual | Uso |
| :--- | :--- | :--- |
| `--navy` | `#1835AB` | Color principal (Hero, botones primarios) |
| `--gold` | `#FFB800` | Color de acento (Botón Upload, Highlight) |
| `--blue-gradient` | `linear-gradient(...)` | Fondo dinámico del Hero |
| `--white` | `#FFFFFF` | Fondos de secciones y tarjetas |
| `--gray-light` | `#F8FAFC` | Fondos secundarios y estados hover |

**Para cambiar el tema:** Simplemente actualiza estos valores hexadecimales.

## 2. 🔠 Tipografía
- **Fuente Principal:** `Inter` (Google Fonts).
- **Pesos:** 400 (regular), 500 (medium), 700 (bold), 800 (extra-bold).
- **Uso:** El peso 800 se reserva para los botones principales y el titular del Hero para dar un aspecto "premium" y fuerte.

## 3. 🔘 Componentes de Interfaz

### Botones (Action Buttons)
- **Primary (`.btn-primary` / `.btn-upload`):** Gran tamaño, bordes muy redondeados (32px), sombra sólida inferior (efecto 3D).
- **Action Icons (`.gallery-icon-btn`):** Estilo *Glassmorphism* (fondo translúcido con desenfoque de fondo) para overlays sobre imágenes.
- **Filter Cards (`.filter-card`):** Pequeñas tarjetas interactivas con estados `.active` que usan bordes de color de marca.

### Modal (Photobooth Interface)
- **Estructura:** Fondo blanco con radio de 40px (desktop) y 24px (móvil).
- **Flujo:** Usa estados de visibilidad (`.hidden`) para guiar al usuario desde la captura hasta la descarga.

## 4. 🚀 Cómo crear un nuevo tema (Theming)

Si quieres usar esta plantilla para un nuevo proyecto (ej. "Space Photobooth"):

1. **Visuales (CSS):**
   - Cambia `--navy` por un color oscuro espacial.
   - Cambia el gradiente del Hero en `.hero`.
   - Reemplaza `dragon_mascot.png` y `school_shield.png` en la carpeta `/public`.

2. **IA (Prompts):**
   - Ve a `server.js`.
   - Modifica los `promptTemplates`. Cambia "Pixar dragon" por "Astronaut Pixar style" o el tema deseado.
   - Ajusta los backgrounds en las descripciones de los prompts.

3. **Textos (HTML):**
   - Actualiza los `<span>` de los filtros en `index.html`.
   - Cambia los títulos y el eslogan en la sección Hero.

## 5. 📱 Responsividad
- El sistema utiliza **CSS Grid** de 4 columnas para la galería.
- En móviles (`max-width: 768px`), el layout del Hero pasa a `column` y utiliza `display: contents` para reordenar elementos visualmente sin romper el HTML.

---
*Este sistema de diseño asegura que cualquier modificación mantenga la armonía y la calidad visual del Spruce original.*
