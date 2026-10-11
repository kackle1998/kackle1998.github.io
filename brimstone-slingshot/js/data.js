'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — data: palette, pixel sprites, icons, cards, decks
   Sprites are 8x16 "half" images, mirrored to 16x16.
   Legend: '.' clear  '#' ink  '+' mid  '-' light  'w' white
   ============================================================ */

const PAL = { '#': '#1f2418', '+': '#6e7a52', '-': '#a9b47e', 'w': '#eef1d6' };

const SPRITES = {
  /* ---------- BEAST ---------- */
  stoat: [
    '........', '........', '..##....', '.#-+#...', '.#++####', '..#+++++', '..#+#w++', '..#+##++',
    '..#+++++', '...#+ww-', '...#www#', '....#www', '.....###', '....#+++', '...#++++', '...#++++',
  ],
  hare: [
    '...##...', '..#-+#..', '..#-+#..', '..#-+#..', '..#-+#..', '...#+###', '..#+++++', '.#++++++',
    '.#+#w+++', '.#+##+++', '.#++++++', '..#+++ww', '..#++ww#', '...#+www', '....####', '........',
  ],
  wolf: [
    '........', '.#......', '.##.....', '.#+#....', '.#++####', '.#++++++', '#+++++++', '#++#w+++',
    '#++##+++', '.#++++++', '.#+++++-', '..#++---', '...#+-##', '....#---', '.....###', '........',
  ],
  boar: [
    '........', '#.......', '##......', '#+#.....', '#++#####', '.#++++++', '.#+#w+++', '#++##+++',
    '#+++++++', '#+++####', '.#+#----', '.w#-#---', '.w#-----', '..w#####', '...#++++', '....####',
  ],
  elk: [
    '#.#.#...', '#.#.#...', '.###....', '..#.....', '..##....', '...#.###', '....#+++', '...#++++',
    '...#+#w+', '...#+##+', '....#+++', '....#+++', '.....#++', '.....#-#', '......##', '........',
  ],
  grizzly: [
    '........', '.##.....', '#++#....', '#+-+####', '#++#++++', '.#++++++', '#+++++++', '#++#w+++',
    '#++##+++', '#+++++--', '#++++-##', '.#++--##', '.#++----', '..#++-#-', '...#+---', '....####',
  ],
  mooseking: [
    '....#..#', '....#++#', '#.#.####', '#.#.#...', '#####...', '.#..####', '....#+++', '...#++++',
    '...#+#w+', '...#+##+', '...#++++', '....#+++', '....#+++', '....#-#-', '....#---', '.....###',
  ],

  /* ---------- BONE ---------- */
  rat: [
    '........', '........', '........', '.##.....', '#-+#....', '#--+#...', '.#++####', '..#+++++',
    '..#+#w++', '..#+##++', '...#++++', '....#+++', '....#+++', '.....#++', '......##', '........',
  ],
  bat: [
    '........', '........', '........', '........', '......#.', '#.....##', '##...#++', '#+#..#w#',
    '#++#.#++', '#+++#+++', '#++++#++', '#++++#+w', '#+#+#..#', '##.#....', '#.......', '........',
  ],
  draugr: [
    '........', '#.......', '##...###', '.##.#+++', '..##++++', '...#++++', '...#####', '...#wwww',
    '...#w##w', '...#w##w', '...#wwww', '....#ww#', '....#w#w', '....#www', '.....###', '........',
  ],
  skeleton: [
    '........', '........', '....####', '...#wwww', '..#wwwww', '..#wwwww', '..#w##ww', '..#w###w',
    '..#ww##w', '..#wwww#', '...#wwww', '....#w#w', '....#w#w', '.....###', '........', '........',
  ],
  ghoul: [
    '........', '....####', '...#++++', '..#+-+++', '.#++++++', '.#+##+++', '.#+#w#++', '.#+##+++',
    '..#+++++', '..#++++#', '..######', '..#w#w#w', '...#####', '....#+++', '...#+..+', '...#....',
  ],
  crow: [
    '........', '......##', '.....#++', '....#+++', '....#w#+', '....#++#', '.....#--', '......#-',
    '#....#++', '##..#+++', '#+##++++', '#+++++++', '.#++#+++', '..##.#++', '......##', '......#.',
  ],
  revenant: [
    '......##', '.....#++', '....#+++', '...#++##', '...#+###', '..#+####', '..#+#w##', '..#+####',
    '..#++###', '.#+++#++', '.#++++++', '#+++#+++', '#++#++++', '#+#+++++', '##++++++', '########',
  ],
  bonelord: [
    '.#..#..#', '.##.##.#', '.#######', '.#-+-+-+', '..######', '..#wwwww', '.#wwwwww', '.#w###ww',
    '.#w#+#ww', '.#w###ww', '.#wwwww#', '..#wwwww', '...#w#w#', '...#w#w#', '....####', '........',
  ],

  /* ---------- GEM ---------- */
  shard: [
    '........', '.......#', '......#w', '.....#w-', '....#w--', '...#w---', '..#w----', '.#######',
    '..#++++#', '...#+++-', '....#++-', '.....#+-', '......#+', '.......#', '........', '........',
  ],
  golem: [
    '........', '..######', '.#++++++', '.#+-++-+', '.#++++++', '.#+###++', '.#+#w#++', '.#+###++',
    '.#++++++', '##+-++++', '#++#####', '#+++++++', '#++#++#+', '#+++++++', '.#######', '........',
  ],
  moth: [
    '........', '....#...', '.....#..', '##....#.', '#w#...##', '#-w#.#++', '#--w##w#', '#---#+++',
    '.#--#+++', '..##-#++', '.#--#+++', '#--#.#++', '#-#...#+', '##.....#', '........', '........',
  ],
  geode: [
    '........', '........', '...#####', '..#+++++', '.#++####', '.#+#www#', '#++#www#', '#+#w####',
    '#+#w####', '#+#wwww#', '#++#www#', '.#+#www#', '.#++####', '..#+++++', '...#####', '........',
  ],
  sentinel: [
    '......##', '.....#w-', '....####', '...#++++', '..#+-+++', '..#+++++', '..#+####', '..#+#www',
    '..#+####', '..#+++#+', '..#++#++', '..#+++#+', '.##+++++', '#++#####', '#+++++++', '########',
  ],
  shardblade: [
    '.......#', '......#w', '......#w', '......#w', '......#w', '......#w', '......#w', '......#w',
    '......#w', '..######', '..#++#w-', '..######', '......#+', '......#+', '.....#--', '......##',
  ],
  drake: [
    '........', '#.......', '##......', '.##..###', '..##++++', '...#++++', '..#+#w++', '..#+##++',
    '..#+++++', '..#+-+-+', '...#++++', '...#++##', '...#+#ww', '....#+++', '.....###', '........',
  ],
  colossus: [
    '....####', '...#++++', '...#+#w+', '...#++++', '.###++++', '#+++####', '#++#++++', '#++#+##w',
    '#++#+#w-', '#++#+##-', '#++#++++', '####++++', '...#++#+', '...#++#.', '..#+++#.', '..#####.',
  ],

  /* ---------- ARCANE ---------- */
  apprentice: [
    '.......#', '......#+', '......#+', '.....#++', '.....#+-', '....#+++', '.#######', '...#wwww',
    '...#w#ww', '...#wwww', '....#www', '.....###', '...#++++', '..#+++++', '..#+++++', '..######',
  ],
  wisp: [
    '......#.', '.....#w#', '....#ww-', '...#w---', '..#w----', '..#w----', '.#w--#--', '.#w-##--',
    '.#w-----', '.#w-----', '.#w---##', '..#w----', '..#ww---', '...#ww--', '....####', '........',
  ],
  adept: [
    '.......#', '......#w', '.......#', '....####', '...#++++', '..#+++++', '..#+####', '.#+#wwww',
    '.#+#w#ww', '.#+#wwww', '.#++#www', '#++++###', '#+++++++', '#+++#+++', '#++#++++', '########',
  ],
  owl: [
    '........', '.#......', '.##.....', '.#+#####', '.#++++++', '#+####++', '#+#ww#++', '#+#w##++',
    '#+####+#', '#+++++##', '#+-+-+-+', '#++-+-+-', '.#+-+-+-', '.#++++++', '..##.#..', '........',
  ],
  battlemage: [
    '.......#', '......#+', '.....#++', '....#+-+', '...#++++', '########', '..#+++++', '..#+####',
    '..#+#www', '..#+####', '..#+++++', '..#++#++', '.##+++++', '#+######', '#+++++++', '########',
  ],
  archmage: [
    '......##', '.....#++', '.....#+w', '....#+++', '....#w++', '...#++++', '########', '..#wwwww',
    '..#w##ww', '..#wwwww', '.#------', '.#------', '..#-----', '...#----', '....#---', '.....###',
  ],
  wyrm: [
    '#.......', '##......', '#+#.....', '#++#.###', '#+++#+++', '#++++#++', '.#+++#w#', '.#++#+##',
    '..#+#+++', '..##.#++', '.....#++', '.....#+#', '.....#+w', '......#w', '......##', '........',
  ],

  /* Land art is generated from each colour's energy icon (see below COLORS). */

  /* ---------- MISC ---------- */
  hero: [
    '........', '....####', '...#wwww', '..#wwwww', '..#wwwww', '.#wwwwww', '.#ww#www', '.#ww#www',
    '.#wwwwww', '..#wwwww', '..#www##', '...#wwww', '....####', '..##++++', '.#++++++', '.#++++++',
  ],
  dealer: [
    '......##', '....##++', '...#++++', '..#+++++', '.#++####', '.#+#####', '#+######', '#+##ww##',
    '#+##ww##', '#+######', '#++#####', '#+++####', '#++++###', '#+++++##', '#+++++++', '########',
  ],
  bell: [
    '........', '.......#', '......##', '....####', '...#wwww', '..#w----', '..#w----', '..#w----',
    '..#w----', '.#w-----', '.#w-----', '#w------', '########', '......##', '......##', '........',
  ],
};

/* 7x7 one-colour icons */
const ICONS = {
  paw:       ['.#.#.#.', '.#.#.#.', '.......', '..###..', '.#####.', '.#####.', '..#.#..'],
  bone:      ['.#####.', '#######', '#..#..#', '#######', '.##.##.', '.#####.', '.#.#.#.'],
  gem:       ['..###..', '.#####.', '#######', '.#####.', '..###..', '...#...', '.......'],
  hat:       ['...#...', '...##..', '..###..', '..####.', '.#####.', '#######', '.......'],
  atk:       ['......#', '.....#.', '#...#..', '.#.#...', '..#....', '.#.#...', '#......'],
  hp:        ['.......', '.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
  airborne:  ['#......', '##.....', '###....', '####...', '#####..', '.#####.', '..#####'],
  guardian:  ['#######', '#.....#', '#.###.#', '#.###.#', '.#.#.#.', '..#.#..', '...#...'],
  haste:     ['#..#...', '.#..#..', '..#..#.', '...#..#', '..#..#.', '.#..#..', '#..#...'],
  deathtouch:['.#####.', '#.###.#', '#######', '##.#.##', '.#####.', '..#.#..', '.......'],
  leech:     ['...#...', '..###..', '.#####.', '####.##', '###.###', '.#####.', '..###..'],
  trample:   ['...#...', '..###..', '.#.#.#.', '...#...', '..###..', '.#.#.#.', '...#...'],
  quick:     ['...###.', '..###..', '.###...', '#######', '...###.', '..###..', '.##....'],
  bonespawn: ['##...##', '###.###', '.#####.', '..###..', '.#####.', '###.###', '##...##'],
  regen:     ['..###..', '..###..', '#######', '#######', '#######', '..###..', '..###..'],
  scholar:   ['##...##', '#.#.#.#', '#..#..#', '#..#..#', '#..#..#', '#######', '.......'],
  snipe:     ['..###..', '.#...#.', '#..#..#', '#.###.#', '#..#..#', '.#...#.', '..###..'],
  mend:      ['.##.##.', '#..#..#', '#.###.#', '#..#..#', '.#...#.', '..#.#..', '...#...'],
  rally:     ['#####..', '######.', '#####..', '#......', '#......', '#......', '#......'],
  /* spell & trap art */
  firebolt:  ['....##.', '...##..', '..####.', '.####..', '...##..', '..##...', '.##....'],
  insight:   ['.......', '..###..', '.#...#.', '#..#..#', '.#...#.', '..###..', '.......'],
  meteor:    ['#......', '.#.....', '..#.##.', '...####', '..#####', '...###.', '.......'],
  might:     ['...#...', '..###..', '.#####.', '...#...', '...#...', '.#####.', '.......'],
  howl:      ['..###..', '.##....', '##.....', '##..#..', '##.....', '.##....', '..###..'],
  massacre:  ['.####..', '#....#.', '......#', '.....#.', '....#..', '...#...', '..#....'],
  drain:     ['...#...', '...#...', '..###..', '.#####.', '.##.##.', '.#####.', '..###..'],
  raise:     ['.#.#.#.', '.#.#.#.', '.#####.', '.#####.', '..###..', '#######', '#.#.#.#'],
  restore:   ['...#...', '..###..', '#######', '..###..', '...#...', '.#...#.', '#.....#'],
  shatter:   ['..###..', '.##.##.', '###.###', '.#.#.#.', '..#.#..', '...#...', '.......'],
  beartrap:  ['#.#.#.#', '#######', '.......', '...#...', '.......', '#######', '#.#.#.#'],
  opengrave: ['..###..', '.#####.', '.##.##.', '.#...#.', '.##.##.', '.#####.', '#######'],
  mirrorward:['#######', '#.....#', '#.#...#', '#..#..#', '.#...#.', '..#.#..', '...#...'],
  counter:   ['..###..', '.#...#.', '#.#.#.#', '#..#..#', '#.#.#.#', '.#...#.', '..###..'],
  stasisrune:['#######', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#######'],
  spell:     ['...#...', '..#.#..', '.#...#.', '#..#..#', '.#...#.', '..#.#..', '...#...'],
  trap:      ['#.....#', '##...##', '#.#.#.#', '#..#..#', '#.#.#.#', '##...##', '#.....#'],
};

const COLOR_KEYS = ['paw', 'bone', 'gem', 'hat'];
const COLORS = {
  paw:  { name: 'Beast',  icon: 'paw',  land: 'Jungle' },
  bone: { name: 'Bone',   icon: 'bone', land: 'Tomb' },
  gem:  { name: 'Gem',    icon: 'gem',  land: 'Mines' },
  hat:  { name: 'Arcane', icon: 'hat',  land: 'Spire' },
};

/* Land art = the energy symbol it produces, drawn 2x with a soft drop shadow. */
function iconSprite(name) {
  const px = Array.from({ length: 16 }, () => Array(16).fill('.'));
  const icon = ICONS[name];
  const each = (fn) => icon.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === '#') for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) fn(1 + x * 2 + dx, 1 + y * 2 + dy);
  }));
  each((x, y) => { if (x + 1 < 16 && y + 1 < 16) px[y + 1][x + 1] = '-'; });
  each((x, y) => { px[y][x] = '#'; });
  return px.map((r) => r.join(''));
}
for (const k of COLOR_KEYS) SPRITES['land_' + k] = iconSprite(COLORS[k].icon);

const SIGILS = {
  airborne:   { name: 'Airborne',   icon: 'airborne',   text: () => 'May attack the enemy directly, even while they control creatures, unless they control an Airborne creature.' },
  guardian:   { name: 'Guardian',   icon: 'guardian',   text: () => 'While this is on the board, enemies must attack a Guardian.' },
  haste:      { name: 'Haste',      icon: 'haste',      text: () => 'Can attack the turn it is summoned.' },
  deathtouch: { name: 'Touch of Death', icon: 'deathtouch', text: () => 'Any creature damaged by this perishes.' },
  leech:      { name: 'Leech',      icon: 'leech',      text: () => 'Damage this deals in combat also heals its owner.' },
  trample:    { name: 'Piercing',   icon: 'trample',    text: () => 'When this kills a creature in an attack, excess damage hits the enemy.' },
  quick:      { name: 'Quick',      icon: 'quick',      text: () => 'Strikes first in combat. If the foe perishes, it takes no damage.' },
  bonespawn:  { name: 'Bone Spawn', icon: 'bonespawn',  text: () => 'When this perishes, a 1/1 Skeleton rises in its place.' },
  regen:      { name: 'Regenerate', icon: 'regen',      text: () => 'Heals fully at the start of your turn.' },
  scholar:    { name: 'Scholar',    icon: 'scholar',    text: () => 'When summoned, draw a card.' },
  snipe:      { name: 'Snipe',      icon: 'snipe',      text: (c) => `When summoned, deal ${c.snipe} damage to the strongest enemy creature.` },
  mend:       { name: 'Mend',       icon: 'mend',       text: (c) => `When summoned, gain ${c.mend} life.` },
  rally:      { name: 'Rally',      icon: 'rally',      text: () => 'Your other creatures get +1 attack.' },
};

/* Sigils with an amount show it in their name: 'Snipe 2', 'Mend 3'. */
function sigilName(k, c) {
  const n = c && c[k];
  return typeof n === 'number' ? `${SIGILS[k].name} ${n}` : SIGILS[k].name;
}

/* '2PP' -> {g:2, paw:2}.  P=paw K=bone G=gem H=hat */
function parseCost(s) {
  const c = { g: 0, paw: 0, bone: 0, gem: 0, hat: 0 };
  const m = s.match(/^\d+/);
  if (m) c.g = +m[0];
  for (const ch of s.replace(/^\d+/, '')) c[{ P: 'paw', K: 'bone', G: 'gem', H: 'hat' }[ch]]++;
  return c;
}
function costTotal(c) { return (c.g || 0) + COLOR_KEYS.reduce((n, k) => n + (c[k] || 0), 0); }

const CARDS = {};
function creature(id, name, color, cost, atk, hp, sigils = [], extra = {}) {
  CARDS[id] = { id, name, type: 'creature', color, cost: parseCost(cost), atk, hp, sigils, sprite: id, ...extra };
}

// Beast
creature('stoat',     'Stoat',      'paw', 'P',    1, 2, [], { flavor: 'Small, quick, and very rude.' });
creature('hare',      'Hare',       'paw', 'P',    1, 1, ['haste'], { flavor: 'Gone before you blink.' });
creature('wolf',      'Wolf',       'paw', '1P',   3, 2, [], { flavor: 'It hunts where the moss grows thick.' });
creature('boar',      'Raging Boar','paw', '1PP',  3, 3, ['haste']);
creature('elk',       'Elk',        'paw', '2P',   3, 4, ['trample']);
creature('grizzly',   'Grizzly',    'paw', '2PP',  5, 5, ['trample'], { flavor: 'The forest goes quiet when it wakes.' });
creature('mooseking', 'Moose King', 'paw', '3PP',  6, 6, ['trample', 'rally'], { flavor: 'Crowned by the antlers of a hundred rivals.' });
// Bone
creature('rat',       'Grave Rat',  'bone', 'K',   1, 1, ['bonespawn']);
creature('bat',       'Vampire Bat','bone', '1K',  1, 2, ['airborne', 'leech']);
creature('draugr',    'Draugr',     'bone', '1K',  1, 3, ['bonespawn'], { flavor: 'Something still stirs inside the armour.' });
creature('ghoul',     'Ghoul',      'bone', '2K',  2, 3, ['deathtouch']);
creature('crow',      'Plague Crow','bone', '2K',  2, 2, ['airborne', 'deathtouch']);
creature('revenant',  'Revenant',   'bone', '2KK', 4, 4, ['leech']);
creature('bonelord',  'Bone Lord',  'bone', '3KK', 4, 5, ['rally', 'bonespawn'], { flavor: 'All bones answer to the crown.' });
CARDS.skeleton = { id: 'skeleton', name: 'Skeleton', type: 'creature', color: 'bone', cost: parseCost('0'), atk: 1, hp: 1, sigils: [], sprite: 'skeleton', token: true };
// Gem
creature('shard',     'Mox Shard',  'gem', 'G',    0, 4, ['guardian'], { flavor: 'It hums when struck.' });
creature('golem',     'Stone Golem','gem', '1G',   2, 3, ['regen']);
creature('moth',      'Crystal Moth','gem','1G',   1, 2, ['airborne', 'regen']);
creature('geode',     'Heal Geode', 'gem', '1G',   1, 3, ['mend'], { mend: 3 });
creature('sentinel',  'Gem Sentinel','gem','2G',   2, 5, ['guardian']);
creature('shardblade','Shardblade', 'gem', '1GG',  3, 3, ['quick']);
creature('drake',     'Prism Drake','gem', '2GG',  3, 4, ['airborne']);
creature('colossus',  'Gem Colossus','gem','3GG',  5, 7, ['guardian', 'regen'], { flavor: 'A mountain that learned to walk.' });
// Arcane
creature('apprentice','Apprentice', 'hat', 'H',    1, 1, ['scholar']);
creature('wisp',      'Wisp',       'hat', '1H',   2, 1, ['airborne']);
creature('adept',     'Fire Adept', 'hat', '1H',   1, 2, ['snipe'], { snipe: 1 });
creature('owl',       'Owl Familiar','hat','2H',   2, 2, ['airborne', 'scholar']);
creature('battlemage','Battlemage', 'hat', '2H',   3, 2, ['quick']);
creature('archmage',  'Archmage',   'hat', '3HH',  3, 4, ['snipe', 'scholar'], { snipe: 3, flavor: 'Old enough to remember the first card.' });
creature('wyrm',      'Storm Wyrm', 'hat', '3HH',  5, 4, ['airborne'], { flavor: 'Thunder follows it like a dog.' });

for (const k of COLOR_KEYS) {
  CARDS['land_' + k] = { id: 'land_' + k, name: COLORS[k].land, type: 'land', color: k, cost: parseCost('0'), sigils: [], sprite: 'land_' + k };
}

/* ---------- spells (sorcery speed: cast on your own turn only, then to the grave) ----------
   fx: what it does. n: how much. target: 'enemy' | 'ally' creature, or none. Art = its icon. */
function spell(id, name, color, cost, fx, n, target, short, text) {
  CARDS[id] = { id, name, type: 'spell', color, cost: parseCost(cost), fx, n, target, short, text, sigils: [], sprite: id };
  SPRITES[id] = iconSprite(id);
}
spell('might',    'Feral Might', 'paw',  '1P',  'buff',    2, 'ally',  'Ally gets +2/+2',      'Your target creature gets +2 attack and +2 health for good.');
spell('howl',     'Pack Howl',   'paw',  '2PP', 'howl',    1, null,    'All allies +1/+1',     'Every creature you control gets +1 attack and +1 health for good.');
spell('drain',    'Soul Drain',  'bone', '1K',  'drain',   2, null,    'Enemy -2, you +2',     'Deal 2 damage to the enemy and gain 2 life.');
spell('massacre', 'Massacre',    'bone', '3KK', 'massacre', 2, null,  'Foes -2/-2, drain 2',  'Every enemy creature gets -2/-2 until end of turn. If any perish, the enemy loses 2 life and you gain 2.');
spell('raise',    'Raise Dead',  'bone', '2K',  'raise',   1, null,    'Grave creature to hand', 'Return a random creature from your grave to your hand.');
spell('restore',  'Crystal Mend','gem',  '1G',  'restore', 2, 'ally',  'Heal ally, +2 life',   'Fully heal your target creature and gain 2 life.');
spell('shatter',  'Shatter',     'gem',  '2GG', 'shatter', 3, 'enemy', 'Kill foe, 3 atk or less', 'Destroy target enemy creature with 3 or less attack.');
spell('firebolt', 'Firebolt',    'hat',  '1H',  'bolt',    3, 'enemy', '3 damage to a foe',    'Deal 3 damage to target enemy creature.');
spell('insight',  'Insight',     'hat',  '2H',  'draw',    2, null,    'Draw 2 cards',         'Draw 2 cards.');
spell('meteor',   'Meteor',      'hat',  '3HH', 'quake',   2, null,    '2 damage to all foes', 'Deal 2 damage to every enemy creature.');

/* ---------- traps (paid for and set face-down on your turn; spring on the enemy's) ----------
   trigger: the enemy action that springs it. Only one trap springs per action. */
function trap(id, name, color, cost, trigger, fx, n, short, text) {
  CARDS[id] = { id, name, type: 'trap', color, cost: parseCost(cost), trigger, fx, n, short, text, sigils: [], sprite: id };
  SPRITES[id] = iconSprite(id);
}
trap('beartrap',   'Bear Trap',   'paw',  '1P', 'attack', 'snare',   3, 'Attacker takes 3',      'When an enemy creature attacks, deal 3 damage to it. If it perishes, the attack is stopped.');
trap('opengrave',  'Open Grave',  'bone', '2K', 'summon', 'pit',     3, 'Kill summon, 3+ atk',   'When the enemy summons a creature with 3 or more attack, destroy it.');
trap('mirrorward', 'Mirror Ward', 'gem',  '1G', 'attack', 'reflect', 0, 'Reflect direct hit',    'When an enemy creature attacks you directly, stop the attack and deal its attack to itself.');
trap('counter',    'Counterspell','hat',  '1H', 'spell',  'counter', 0, 'Cancel a spell',        'When the enemy casts a spell, cancel it. Their energy is still spent.');
trap('stasisrune', 'Stasis Rune', 'hat',  '2H', 'attack', 'stasis',  0, 'Stop all attacks',      'When an enemy creature attacks, stop it. None of their creatures may attack again this turn.');

const DECKS = [
  {
    name: 'Wild Hunt', colors: ['paw', 'bone'], feature: 'grizzly',
    desc: 'Fast beasts backed by bones that refuse to stay dead.',
    list: { land_paw: 6, land_bone: 6, stoat: 2, hare: 1, wolf: 2, bat: 2, boar: 2, ghoul: 1, elk: 2, grizzly: 1, revenant: 1, mooseking: 1, might: 1, drain: 1, beartrap: 1 },
  },
  {
    name: 'Crypt Arcana', colors: ['bone', 'hat'], feature: 'bonelord',
    desc: 'Deathtouch, card draw and spellfire from the grave.',
    list: { land_bone: 6, land_hat: 6, rat: 2, apprentice: 1, draugr: 1, bat: 1, adept: 2, crow: 2, owl: 1, battlemage: 1, bonelord: 1, archmage: 1, revenant: 1, firebolt: 1, raise: 1, opengrave: 1, counter: 1 },
  },
  {
    name: 'Crystal Wilds', colors: ['gem', 'paw'], feature: 'colossus',
    desc: 'Guardian walls hold the line while beasts trample through.',
    list: { land_gem: 6, land_paw: 6, shard: 2, stoat: 1, golem: 1, wolf: 2, geode: 1, sentinel: 2, boar: 1, shardblade: 1, elk: 1, grizzly: 1, colossus: 1, drake: 1, restore: 1, mirrorward: 1, howl: 1 },
  },
  {
    name: 'Prism Sorcery', colors: ['gem', 'hat'], feature: 'wyrm',
    desc: 'Flyers rule the skies above a wall of crystal.',
    list: { land_gem: 6, land_hat: 6, shard: 1, apprentice: 1, moth: 1, wisp: 2, adept: 1, owl: 2, shardblade: 1, battlemage: 1, drake: 1, archmage: 1, wyrm: 1, firebolt: 1, insight: 1, meteor: 1, shatter: 1, stasisrune: 1 },
  },
];
