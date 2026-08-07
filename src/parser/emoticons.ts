/**
 * Иконки эмотиконов Jira в виде inline-SVG.
 *
 * Формы и цвета повторяют классический набор Atlassian (Jira Server/DC),
 * чтобы превью выглядело так же, как отрисованное описание в самой задаче.
 * SVG без фиксированных размеров — масштабируется под размер шрифта из CSS.
 */

const GREEN = '#14892c';
const RED = '#d04437';
const AMBER = '#f6c342';
const AMBER_DARK = '#e8a33d';
const BLUE = '#3572b0';
const GREY = '#c1c7d0';
const GREY_DARK = '#8993a4';
const FACE = '#ffd351';
const INK = '#4a3c00';

function icon(body: string): string {
  return `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** Круглый значок с белым глифом внутри — основа для (+), (/), (x), (i). */
function disc(color: string, glyph: string): string {
  return icon(`<circle cx="8" cy="8" r="7.4" fill="${color}"/>${glyph}`);
}

/** Жёлтый кружок-лицо: основа для :) :( :D ;) :P */
function face(features: string): string {
  return icon(
    `<circle cx="8" cy="8" r="7.2" fill="${FACE}" stroke="${AMBER_DARK}" stroke-width="1"/>` +
      features,
  );
}

const EYES =
  `<circle cx="5.6" cy="6.3" r="1.05" fill="${INK}"/>` +
  `<circle cx="10.4" cy="6.3" r="1.05" fill="${INK}"/>`;

const STAR_PATH = 'm8 1.7 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.5l-3.8 2 .7-4.3-3.1-3 4.3-.6z';

function star(color: string): string {
  return icon(`<path d="${STAR_PATH}" fill="${color}"/>`);
}

function flag(color: string): string {
  return icon(
    `<path d="M3.2 1.6h1.5v12.8H3.2z" fill="${GREY_DARK}"/>` +
      `<path d="M5.1 2.3h8.2l-1.9 2.7 1.9 2.7H5.1z" fill="${color}"/>`,
  );
}

function bulb(glass: string, stroke: string): string {
  return icon(
    `<path d="M8 1.4a4.3 4.3 0 0 0-2.6 7.7c.5.4.8 1 .8 1.6v.3h3.6v-.3c0-.6.3-1.2.8-1.6A4.3 4.3 0 0 0 8 1.4z" fill="${glass}" stroke="${stroke}" stroke-width=".8"/>` +
      `<rect x="6.2" y="11.8" width="3.6" height="1.3" rx=".65" fill="${GREY_DARK}"/>` +
      `<rect x="6.6" y="13.5" width="2.8" height="1.3" rx=".65" fill="${GREY_DARK}"/>`,
  );
}

function thumb(up: boolean): string {
  const body =
    `<path d="M2.6 6.6h2.6v6.6H2.6z" fill="${AMBER_DARK}"/>` +
    `<path d="M5.8 6.7c1.5-.7 2.3-2 2.4-3.7.05-.9 1.6-1 1.8.1.16.9 0 1.8-.45 2.8h2.6c1 0 1.5.9 1.2 1.7l-1.3 3.9c-.2.7-.8 1.1-1.5 1.1H5.8z" fill="${FACE}" stroke="${AMBER_DARK}" stroke-width=".8" stroke-linejoin="round"/>`;
  return icon(up ? body : `<g transform="translate(0,16) scale(1,-1)">${body}</g>`);
}

/** Соответствие текста эмотикона и его SVG. */
export const EMOTICON_ICONS: Record<string, string> = {
  // Кружки со знаками
  '(+)': disc(GREEN, '<path d="M6.9 3.9h2.2v3h3v2.2h-3v3H6.9v-3h-3V6.9h3z" fill="#fff"/>'),
  '(-)': icon(
    `<rect x=".6" y=".6" width="14.8" height="14.8" rx="3.4" fill="${RED}"/>` +
      '<rect x="3.6" y="6.9" width="8.8" height="2.2" rx="1.1" fill="#fff"/>',
  ),
  '(/)': disc(GREEN, '<path d="m6.9 11.6-3.3-3.3 1.5-1.6 1.8 1.8 3.9-4 1.6 1.5z" fill="#fff"/>'),
  '(x)': disc(
    RED,
    '<path d="m8 6.4 2.4-2.4 1.6 1.6L9.6 8l2.4 2.4-1.6 1.6L8 9.6l-2.4 2.4-1.6-1.6L6.4 8 4 5.6l1.6-1.6z" fill="#fff"/>',
  ),
  '(i)': disc(
    BLUE,
    '<circle cx="8" cy="4.4" r="1.25" fill="#fff"/>' +
      '<rect x="6.85" y="6.5" width="2.3" height="5.4" rx="1.15" fill="#fff"/>',
  ),
  '(?)': disc(
    BLUE,
    '<path d="M8 2.9c-1.9 0-3.2 1-3.4 2.7l2 .3c.1-.8.6-1.2 1.3-1.2.7 0 1.2.4 1.2 1 0 .5-.2.8-.9 1.3-.9.6-1.3 1.2-1.3 2.2v.5h2v-.4c0-.5.2-.8.9-1.3.9-.6 1.4-1.3 1.4-2.4 0-1.6-1.3-2.7-3.2-2.7z" fill="#fff"/>' +
      '<circle cx="8" cy="11.9" r="1.3" fill="#fff"/>',
  ),

  // Треугольник-предупреждение
  '(!)': icon(
    `<path d="M8.9 1.6a1 1 0 0 0-1.8 0L.7 13.2a1 1 0 0 0 .9 1.5h12.8a1 1 0 0 0 .9-1.5z" fill="${AMBER}" stroke="${AMBER_DARK}" stroke-width=".8" stroke-linejoin="round"/>` +
      `<rect x="7" y="5.3" width="2" height="5" rx="1" fill="${INK}"/>` +
      `<circle cx="8" cy="12.2" r="1.2" fill="${INK}"/>`,
  ),

  // Лица
  ':)': face(`${EYES}<path d="M4.9 9.2Q8 12.3 11.1 9.2" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>`),
  ':(': face(`${EYES}<path d="M4.9 11.4Q8 8.3 11.1 11.4" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>`),
  ':D': face(`${EYES}<path d="M4.4 8.8Q8 13.4 11.6 8.8Z" fill="${INK}"/>`),
  ';)': face(
    `<circle cx="5.6" cy="6.3" r="1.05" fill="${INK}"/>` +
      `<path d="M9.3 6.3h2.2" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>` +
      `<path d="M4.9 9.2Q8 12.3 11.1 9.2" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>`,
  ),
  ':P': face(
    `${EYES}<path d="M4.9 9.1Q8 11.7 11.1 9.1" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>` +
      `<ellipse cx="9.5" cy="11.1" rx="1.5" ry="1.3" fill="${RED}"/>`,
  ),

  // Большой палец
  '(y)': thumb(true),
  '(n)': thumb(false),

  // Лампочка
  '(on)': bulb(FACE, AMBER_DARK),
  '(off)': bulb(GREY, GREY_DARK),

  // Звёзды
  '(*)': star(AMBER),
  '(*y)': star(AMBER),
  '(*r)': star(RED),
  '(*g)': star(GREEN),
  '(*b)': star(BLUE),

  // Флаги
  '(flag)': flag(RED),
  '(flagoff)': flag(GREY),
};
