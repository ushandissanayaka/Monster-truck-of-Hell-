// The three built-in background songs (played by MusicPlayer when no mp3 is supplied).
// Soft rock band with a classic touch: drums, bass, rhythm guitar, piano, strings and a lead guitar.
// Each song has a verse and a chorus progression (chord per bar as a scale degree: 0 = I, 3 = IV,
// 4 = V, 5 = vi ...) and a written melody for each.
// Patterns are 16 steps (one bar of 16th notes): x = hit, . = rest.
//   mute: palm-muted guitar chugs (verses), open: ringing power chords (choruses)
// Melodies: one string per bar, "degree:eighths" notes (degree in the song's scale, 7 = the octave
// up), "r:n" = rest. Each bar adds up to 8 eighths.

export const SONGS = [
  {
    name: 'Open Road',
    bpm: 124,
    root: 64, // E
    scale: 'major',
    verse: [0, 4, 5, 3],   // I V vi IV
    chorus: [3, 4, 0, 5],  // IV V I vi
    kick:  'x.....x.x.......',
    snare: '....x.......x...',
    hat:   'x.x.x.x.x.x.x.x.',
    bass:  'x.x.x.x.x.x.x.x.',
    mute:  'x.x.x.x.x.x.x.x.',
    open:  'x.......x..x....',
    verseTune: [
      '4:2 4:1 5:1 4:2 2:2', '1:3 2:1 1:2 r:2', '2:2 4:2 5:2 4:1 2:1', '0:4 r:2 4:1 5:1',
      '4:2 4:1 5:1 4:2 7:2', '6:3 4:1 3:2 1:2', '2:2 4:2 5:3 4:1', '5:6 r:2',
    ],
    chorusTune: [
      '7:2 7:2 5:2 7:2', '8:4 6:2 8:2', '9:3 8:1 7:4', '4:2 5:2 7:4',
      '7:2 7:2 5:2 7:2', '8:2 8:2 11:4', '11:2 9:2 7:4', '9:4 7:4',
    ],
  },
  {
    name: 'Thunder Lap',
    bpm: 132,
    root: 57, // A
    scale: 'minor',
    verse: [0, 6, 5, 6],   // i VII VI VII
    chorus: [5, 2, 6, 0],  // VI III VII i
    kick:  'x.x...x.x.x.....',
    snare: '....x.......x...',
    hat:   'x.x.x.x.x.x.x.x.',
    bass:  'x.xxx.x.x.xxx.x.',
    mute:  'x.xxx.x.x.xxx.x.',
    open:  'x.....x...x.....',
    verseTune: [
      '4:1 4:1 4:1 2:1 4:2 r:2', '3:1 3:1 3:1 1:1 3:2 r:2', '2:1 2:1 2:1 0:1 2:2 4:2', '3:4 1:2 r:2',
      '4:1 4:1 4:1 7:1 6:2 4:2', '6:2 5:1 3:1 1:2 3:2', '2:2 0:2 2:2 4:2', '3:6 r:2',
    ],
    chorusTune: [
      '7:2 9:2 9:2 7:2', '11:2 9:2 11:4', '10:2 8:2 6:4', '7:6 r:2',
      '7:2 9:2 12:2 11:2', '11:4 9:4', '10:2 11:2 10:2 8:2', '7:8',
    ],
  },
  {
    name: 'Golden Mile',
    bpm: 112,
    root: 62, // D
    scale: 'major',
    verse: [0, 5, 3, 4],   // I vi IV V
    chorus: [3, 0, 4, 5],  // IV I V vi
    kick:  'x......xx.......',
    snare: '....x.......x...',
    hat:   'x.x.x.x.x.x.x.x.',
    bass:  'x..x..x.x..x..x.',
    mute:  'x..x..x.x..x..x.',
    open:  'x.......x.......',
    verseTune: [
      '2:3 1:1 0:2 2:2', '5:3 4:1 2:4', '3:2 2:2 3:2 5:2', '4:6 r:2',
      '2:3 1:1 0:2 2:2', '5:3 7:1 9:4', '8:2 7:2 5:2 3:2', '6:6 r:2',
    ],
    chorusTune: [
      '7:2 7:2 5:2 7:2', '9:4 7:4', '8:2 8:2 6:2 8:2', '9:6 r:2',
      '10:2 9:2 7:2 5:2', '9:4 11:4', '11:2 10:2 8:2 6:2', '7:8',
    ],
  },
];

// Song structure, 8 bars per section (8 sections fill about 2 minutes).
//   drums: null | 'light' | 'rock'   guitar: null | 'mute' | 'open'   piano: null | 'arp'
//   tune: which melody, and lead: who plays it ('piano' | 'guitar')
export const SECTIONS = [
  { name: 'intro', drums: null, bass: false, guitar: null, piano: 'arp', strings: true },
  { name: 'verse', drums: 'rock', bass: true, guitar: 'mute', strings: false, tune: 'verse', lead: 'piano' },
  { name: 'chorus', chorus: true, drums: 'rock', bass: true, guitar: 'open', strings: true, tune: 'chorus', lead: 'guitar', crash: true },
  { name: 'verse', drums: 'rock', bass: true, guitar: 'mute', strings: false, tune: 'verse', lead: 'piano' },
  { name: 'chorus', chorus: true, drums: 'rock', bass: true, guitar: 'open', strings: true, tune: 'chorus', lead: 'guitar', crash: true },
  { name: 'bridge', chorus: true, drums: 'light', bass: true, guitar: null, piano: 'arp', strings: true, tune: 'chorus', lead: 'piano' },
  { name: 'chorus', chorus: true, drums: 'rock', bass: true, guitar: 'open', strings: true, tune: 'chorus', lead: 'guitar', crash: true },
  { name: 'outro', chorus: true, drums: 'rock', bass: true, guitar: 'open', strings: true, tune: 'chorus', lead: 'guitar', crash: true },
];
