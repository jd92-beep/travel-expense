import type { ReactNode } from 'react';
import type { StyleThemeKey, TabId } from '../../lib/types';
import type { VisualIconId } from '../../lib/iconManifest';

/*
 * Tab icons drawn for the style themes. One 24px geometry per tab (body = the closed silhouette,
 * detail = interior strokes, face = where a kawaii face sits), then each kit renders it in its
 * own hand: double pencil line, puffy blob, crayon fill, sticker face, HUD brackets, 12px sprite,
 * family crest, dancheong tile.
 */
type Glyph = { body: string; detail?: string; face: [number, number] };

const GLYPHS: Record<TabId, Glyph> = {
  dashboard: { body: 'M4 11.2 12 4.5l8 6.7V20h-5.4v-5.3h-5.2V20H4z', face: [12, 12.2] },
  history: { body: 'M6 3.5h12V21l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z', detail: 'M9 8h6M9 11.5h6M9 15h3.5', face: [12, 11] },
  timeline: { body: 'M4 6.5h16V20H4z', detail: 'M4 10.5h16M8.5 3.8v4.6M15.5 3.8v4.6', face: [12, 15] },
  scan: { body: 'M7.5 7.5h9v9h-9z', detail: 'M4 8.5V4h4.5M15.5 4H20v4.5M20 15.5V20h-4.5M8.5 20H4v-4.5', face: [12, 12] },
  weather: { body: 'M7.5 19h9.5a3.6 3.6 0 0 0 .4-7.2 5.2 5.2 0 0 0-9.9 1.3A3 3 0 0 0 7.5 19z', detail: 'M17 3.6v1.7M21.2 7.8h-1.7M20 4.8l-1.2 1.2', face: [12, 15.6] },
  stats: { body: 'M4.5 13h3.6v7H4.5zM10.2 8h3.6v12h-3.6zM15.9 11h3.6v9h-3.6z', detail: 'M3 20.6h18', face: [12, 12.5] },
  settings: { body: 'M12 7.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8z', detail: 'M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8', face: [12, 12] },
};

/* 12×12 sprites for the pixel kit. '#' ink, '+' highlight, '.' empty. */
const SPRITES: Record<TabId, string[]> = {
  dashboard: [
    '............',
    '.....##.....',
    '....#++#....',
    '...#++++#...',
    '..#++++++#..',
    '.##########.',
    '..#++++++#..',
    '..#+##++##..',
    '..#+##++##..',
    '..#+##+++#..',
    '..########..',
    '............',
  ],
  history: [
    '............',
    '..########..',
    '..#++++++#..',
    '..#+####+#..',
    '..#++++++#..',
    '..#+####+#..',
    '..#++++++#..',
    '..#+###++#..',
    '..#++++++#..',
    '..#+#+#+##..',
    '..#.#.#.#...',
    '............',
  ],
  timeline: [
    '...#....#...',
    '.##########.',
    '.#++++++++#.',
    '.##########.',
    '.#+#++#++#+.',
    '.#++++++++#.',
    '.#+#++#++#+.',
    '.#++++++++#.',
    '.#+#++####+.',
    '.#++++####+.',
    '.##########.',
    '............',
  ],
  scan: [
    '............',
    '.###....###.',
    '.#........#.',
    '.#..####..#.',
    '...#++++#...',
    '.##########.',
    '...#++++#...',
    '.#..####..#.',
    '.#........#.',
    '.###....###.',
    '............',
    '............',
  ],
  weather: [
    '.......+....',
    '.....+.+.+..',
    '......+++...',
    '....++++++..',
    '.....####...',
    '...##++++##.',
    '..#++++++++#',
    '.#+++++++++#',
    '.#+++++++++#',
    '..#########.',
    '............',
    '............',
  ],
  stats: [
    '............',
    '........##..',
    '........##..',
    '.....++.##..',
    '.....++.##..',
    '..##.++.##..',
    '..##.++.##..',
    '..##.++.##..',
    '..##.++.##..',
    '.##########.',
    '............',
    '............',
  ],
  settings: [
    '............',
    '.....##.....',
    '..#.####.#..',
    '...######...',
    '..###++###..',
    '.###+..+###.',
    '.###+..+###.',
    '..###++###..',
    '...######...',
    '..#.####.#..',
    '.....##.....',
    '............',
  ],
};


/* Category glyphs (receipts, payments, states). Same grammar as the tab glyphs. */
const CAT_GLYPHS = {
  flight: { body: 'M2.5 12 6 10.6 5 7h1.6l2.6 3H14L10.8 3.5h2.4L18.6 10H20a2 2 0 0 1 0 4h-1.4l-5.4 6.5h-2.4L14 14H9.2l-2.6 3H5l1-3.6z', face: [15.5, 12] },
  transport: { body: 'M6 4h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', detail: 'M4 11h16M8 21l2-3M16 21l-2-3', face: [12, 7.6] },
  food: { body: 'M3.5 11h17a8.5 8.5 0 0 1-17 0z', detail: 'M9 3.5c-1 1.5 1 2.5 0 4.5M13 3.5c-1 1.5 1 2.5 0 4.5M7.5 21.5h9', face: [12, 14.5] },
  shopping: { body: 'M5 8h14l-1 13H6z', detail: 'M9 8V6a3 3 0 0 1 6 0v2', face: [12, 14] },
  lodging: { body: 'M3 12h14a4 4 0 0 1 4 4v3H3z', detail: 'M3 6.5V20.5M21 19v1.5M7 9.5h.5', face: [11, 15.6] },
  ticket: { body: 'M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z', detail: 'M15 7.5v2M15 11v2M15 14.5v2', face: [9, 12] },
  pin: { body: 'M12 21.5s-7-6.2-7-11.7a7 7 0 0 1 14 0c0 5.5-7 11.7-7 11.7z', detail: 'M12 7.3a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z', face: [12, 9.8] },
  medicine: { body: 'M8 7h8a5 5 0 0 1 0 10H8A5 5 0 0 1 8 7z', detail: 'M12 7v10', face: [8.2, 12] },
  box: { body: 'M4 8l8-4 8 4v9l-8 4-8-4z', detail: 'M4 8l8 4 8-4M12 12v9', face: [12, 15.5] },
  wallet: { body: 'M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4z', detail: 'M4.5 7 15 4v3M15 13.5h5', face: [9.5, 13.5] },
  credit: { body: 'M3 6h18v12H3z', detail: 'M3 10h18M6 14.5h4', face: [15, 14.3] },
  suica: { body: 'M4 5h16v14H4z', detail: 'M6 13c2-2 4 2 6 0s4 2 6 0', face: [12, 9] },
  pending: { body: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', detail: 'M12 7v5l3 2', face: [12, 15.5] },
  private: { body: 'M5 11h14v10H5z', detail: 'M8 11V8a4 4 0 0 1 8 0v3', face: [12, 16] },
  gift: { body: 'M4 9h16v4H4zM5 13h14v8H5z', detail: 'M12 9v12M12 9c-2-4-6-3-5-1s5 1 5 1c2-4 6-3 5-1s-5 1-5 1', face: [8.5, 17] },
  photo: { body: 'M3 8h4l2-3h6l2 3h4v12H3z', detail: 'M12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z', face: [12, 13.5] },
  prep: { body: 'M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z', face: [12, 12] },
} satisfies Record<string, Glyph>;

const CAT_SPRITES: Record<keyof typeof CAT_GLYPHS, string[]> = {
  flight: [
    '............',
    '......#.....',
    '......##....',
    '......###...',
    '#.....####..',
    '##########+#',
    '##########+#',
    '#.....####..',
    '......###...',
    '......##....',
    '......#.....',
    '............',
  ],
  transport: [
    '..########..',
    '.#++++++++#.',
    '.#+######+#.',
    '.#+#....#+#.',
    '.#+######+#.',
    '.#++++++++#.',
    '.#+##++##+#.',
    '.#++++++++#.',
    '..########..',
    '...#....#...',
    '..#......#..',
    '.#........#.',
  ],
  food: [
    '...#..#.....',
    '..#..#..#...',
    '...#..#.#...',
    '..#..#..#...',
    '............',
    '############',
    '.#++++++++#.',
    '.#++++++++#.',
    '..#++++++#..',
    '...######...',
    '....####....',
    '............',
  ],
  shopping: [
    '....####....',
    '...#....#...',
    '...#....#...',
    '.##########.',
    '.#++++++++#.',
    '.#++++++++#.',
    '.#+#++++#+#.',
    '.#++####++#.',
    '.#++++++++#.',
    '.#++++++++#.',
    '.##########.',
    '............',
  ],
  lodging: [
    '............',
    '#...........',
    '#.##........',
    '#.##........',
    '#.....#####.',
    '###########+',
    '#+++++++++++',
    '#+++++++++++',
    '############',
    '#..........#',
    '#..........#',
    '............',
  ],
  ticket: [
    '............',
    '............',
    '###########.',
    '#++++#+++++#',
    '.#+++.++++#.',
    '..#++#+++#..',
    '..#++.+++#..',
    '.#+++#++++#.',
    '#++++.+++++#',
    '###########.',
    '............',
    '............',
  ],
  pin: [
    '....####....',
    '...#++++#...',
    '..#++##++#..',
    '..#+#..#+#..',
    '..#+#..#+#..',
    '..#++##++#..',
    '...#++++#...',
    '...#++++#...',
    '....#++#....',
    '....#++#....',
    '.....##.....',
    '............',
  ],
  medicine: [
    '............',
    '............',
    '...######...',
    '..#+++#++#..',
    '.#++++#+++#.',
    '.#++++#+++#.',
    '.#++++#+++#.',
    '..#+++#++#..',
    '...######...',
    '............',
    '............',
    '............',
  ],
  box: [
    '.....##.....',
    '...##++##...',
    '.##++++++##.',
    '#+##++++##+#',
    '#+++####+++#',
    '#++++##++++#',
    '#++++##++++#',
    '#++++##++++#',
    '.##++##++##.',
    '...##+###...',
    '.....##.....',
    '............',
  ],
  wallet: [
    '............',
    '......###...',
    '...###++#...',
    '.##########.',
    '.#++++++++#.',
    '.#+++++####.',
    '.#+++++#+##.',
    '.#+++++####.',
    '.#++++++++#.',
    '.##########.',
    '............',
    '............',
  ],
  credit: [
    '............',
    '............',
    '############',
    '#++++++++++#',
    '############',
    '#++++++++++#',
    '#+###++++++#',
    '#++++++##++#',
    '############',
    '............',
    '............',
    '............',
  ],
  suica: [
    '############',
    '#++++++++++#',
    '#++++++++++#',
    '#+##+++##++#',
    '##++#+#++#+#',
    '#++++#++++##',
    '#++++++++++#',
    '#++++++++++#',
    '############',
    '............',
    '............',
    '............',
  ],
  pending: [
    '....####....',
    '..##++++##..',
    '.#++++#+++#.',
    '.#++++#+++#.',
    '#+++++#++++#',
    '#+++++##+++#',
    '#++++++##++#',
    '.#+++++++++#',
    '.#++++++++#.',
    '..##++++##..',
    '....####....',
    '............',
  ],
  private: [
    '....####....',
    '...#....#...',
    '..#......#..',
    '..#......#..',
    '.##########.',
    '.#++++++++#.',
    '.#++++++++#.',
    '.#+++##+++#.',
    '.#++++#+++#.',
    '.#++++++++#.',
    '.##########.',
    '............',
  ],
  gift: [
    '..##....##..',
    '...#....#...',
    '....#..#....',
    '############',
    '#++++##++++#',
    '############',
    '.#+++##+++#.',
    '.#+++##+++#.',
    '.#+++##+++#.',
    '.#+++##+++#.',
    '.##########.',
    '............',
  ],
  photo: [
    '............',
    '....####....',
    '############',
    '#++++++++++#',
    '#+++####+++#',
    '#++#++++#++#',
    '#++#++++#++#',
    '#++#++++#++#',
    '#+++####+++#',
    '#++++++++++#',
    '############',
    '............',
  ],
  prep: [
    '.....#......',
    '.....#......',
    '....#+#.....',
    '...#+++#..#.',
    '###+++++###.',
    '...#+++#..#.',
    '....#+#.....',
    '.....#...#..',
    '.....#..###.',
    '..........#.',
    '............',
    '............',
  ],
};

type CatKey = keyof typeof CAT_GLYPHS;
/* Every VisualIconId maps to a drawn glyph; shared shapes (wallet, pin, box) cover the aliases. */
const CATEGORY_GLYPH: Record<VisualIconId, CatKey | TabId> = {
  '': 'pending',
  flight: 'flight', transport: 'transport', food: 'food', shopping: 'shopping', lodging: 'lodging', ticket: 'ticket',
  localtour: 'pin', map: 'pin', medicine: 'medicine', other: 'box', post: 'box', cash: 'wallet', paypay: 'wallet',
  credit: 'credit', suica: 'suica', pending: 'pending', private: 'private', gift: 'gift', photo: 'photo', prep: 'prep',
  weather: 'weather', scan: 'scan', receipt: 'history',
};

function Sprite({ rows, size }: { rows: string[]; size: number }) {
  const cells: ReactNode[] = [];
  rows.forEach((row, y) => row.split('').forEach((ch, x) => {
    if (ch === '.') return;
    cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill={ch === '#' ? 'currentColor' : 'var(--kit-ico-hi, #FFD23F)'} />);
  }));
  return <svg viewBox="0 0 12 12" width={size} height={size} shapeRendering="crispEdges" aria-hidden="true" className="kit-ico kit-ico--pixel">{cells}</svg>;
}

const SVG = (props: { children: ReactNode; kit: string; size: number }) => (
  <svg viewBox="0 0 24 24" width={props.size} height={props.size} fill="none" aria-hidden="true" className={`kit-ico kit-ico--${props.kit}`}>{props.children}</svg>
);

/* Face for the kawaii kit: two eyes, a small smile, two blush marks. */
function Face({ at: [x, y] }: { at: [number, number] }) {
  return (
    <g className="kit-ico-face">
      <circle cx={x - 2.1} cy={y - .4} r=".95" fill="#5A2F52" />
      <circle cx={x + 2.1} cy={y - .4} r=".95" fill="#5A2F52" />
      <path d={`M${x - 1} ${y + .9}q1 1 2 0`} stroke="#5A2F52" strokeWidth=".9" strokeLinecap="round" />
      <ellipse cx={x - 3.4} cy={y + 1} rx="1.1" ry=".6" fill="#FF8FB8" opacity=".8" />
      <ellipse cx={x + 3.4} cy={y + 1} rx="1.1" ry=".6" fill="#FF8FB8" opacity=".8" />
    </g>
  );
}

const CREST_SCALE = 'translate(12 12) scale(.68) translate(-12 -12)';

/*
 * `badge` drops the kit's own container (crest disc, tile, blob) because the category badge
 * around it already provides one; the stroke hand stays the same.
 */
function KitGlyph({ kit, g, sprite, badge, size }: { kit: StyleThemeKey; g: Glyph; sprite: string[]; badge: boolean; size: number }) {
  const lines = <><path d={g.body} /><path d={g.detail || ''} /></>;
  switch (kit) {
    case 'sketch_notebook':
      return (
        <SVG kit="sketch" size={size}>
          {badge ? null : <ellipse className="kit-ico-hl" cx="12" cy="14" rx="10" ry="5.5" fill="rgba(255, 214, 64, .7)" transform="rotate(-8 12 14)" />}
          <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{lines}</g>
          <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" opacity=".45" transform="translate(.7 .5) rotate(1.6 12 12)">{lines}</g>
        </SVG>
      );
    case 'marshmallow_cloud':
      return (
        <SVG kit="marshmallow" size={size}>
          {badge ? null : <circle className="kit-ico-blob" cx="12" cy="12.5" r="11" />}
          <g stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <path d={g.body} fill="rgba(255, 255, 255, .85)" /><path d={g.detail || ''} />
          </g>
        </SVG>
      );
    case 'kids_blocks':
      return (
        <SVG kit="kids" size={size}>
          <g stroke="#1B2340" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={g.body} className="kit-ico-fill" /><path d={g.detail || ''} />
          </g>
        </SVG>
      );
    case 'kawaii_sticker':
      return (
        <SVG kit="kawaii" size={size}>
          <path d={g.body} className="kit-ico-fill" stroke="#5A2F52" strokeWidth="1.5" strokeLinejoin="round" />
          <Face at={g.face} />
        </SVG>
      );
    case 'cyberpunk_hud':
      return (
        <SVG kit="cyber" size={size}>
          {badge ? null : <path d="M1.5 6V1.5H6M18 1.5h4.5V6M22.5 18v4.5H18M6 22.5H1.5V18" stroke="currentColor" strokeWidth="1" opacity=".55" />}
          <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" strokeLinejoin="miter">
            <path d={g.body} strokeDasharray="15 2.5" /><path d={g.detail || ''} />
          </g>
        </SVG>
      );
    case 'pixel_quest':
      return <Sprite rows={sprite} size={size} />;
    case 'japan_ukiyoe':
      return badge ? (
        <SVG kit="japan" size={size}>
          <g transform="translate(12 12) scale(.86) translate(-12 -12)" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{lines}</g>
        </SVG>
      ) : (
        <SVG kit="japan" size={size}>
          <circle cx="12" cy="12" r="11.2" fill="currentColor" />
          <circle cx="12" cy="12" r="9.4" stroke="var(--kit-ico-paper, #FBF6EA)" strokeWidth=".7" />
          <g transform={CREST_SCALE} stroke="var(--kit-ico-paper, #FBF6EA)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">{lines}</g>
        </SVG>
      );
    case 'korea_dancheong':
      return badge ? (
        <SVG kit="korea" size={size}>
          <g transform="translate(12 12.6) scale(.84) translate(-12 -12)" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">{lines}</g>
        </SVG>
      ) : (
        <SVG kit="korea" size={size}>
          <rect x="1" y="1" width="22" height="22" rx="6" fill="currentColor" />
          <path d="M1 7V7a6 6 0 0 1 6-6h10a6 6 0 0 1 6 6z" className="kit-ico-band" />
          <g transform="translate(12 13.4) scale(.56) translate(-12 -12)" stroke="#FFFDF8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">{lines}</g>
        </SVG>
      );
    default:
      return null;
  }
}

export function KitTabIcon({ kit, tab }: { kit: StyleThemeKey; tab: TabId }) {
  return <KitGlyph kit={kit} g={GLYPHS[tab]} sprite={SPRITES[tab]} badge={false} size={22} />;
}

export function KitCategoryIcon({ kit, id, size }: { kit: StyleThemeKey; id: VisualIconId; size: number }) {
  const key = CATEGORY_GLYPH[id] || 'box';
  const g = key in CAT_GLYPHS ? CAT_GLYPHS[key as CatKey] : GLYPHS[key as TabId];
  const sprite = key in CAT_SPRITES ? CAT_SPRITES[key as CatKey] : SPRITES[key as TabId];
  return <KitGlyph kit={kit} g={g} sprite={sprite} badge size={size} />;
}
