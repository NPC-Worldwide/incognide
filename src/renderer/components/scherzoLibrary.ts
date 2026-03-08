// Built-in demo scores for Scherzo — all public domain
// Each score contains opening measures of recognizable works

export interface DemoScore {
    title: string;
    composer: string;
    region: string;
    year: string;
    key: string;
    clef: 'treble' | 'bass' | 'grand';
    timeSignature: [number, number];
    bpm: number;
    measures: number;
    category: 'classical' | 'folk' | 'guitar';
    notes: Array<{ note: number; start: number; duration: number; velocity: number }>;
}

// MIDI: C4=60, D4=62, E4=64, F4=65, G4=67, A4=69, B4=71, C5=72, etc.

export const demoScores: DemoScore[] = [
    // ===== CLASSICAL =====
    {
        title: 'Prelude in C Major, BWV 846',
        composer: 'J.S. Bach',
        region: 'Germany',
        year: '1722',
        key: 'C',
        clef: 'grand',
        timeSignature: [4, 4],
        bpm: 72,
        measures: 4,
        category: 'classical',
        notes: [
            // Measure 1: C major arpeggio pattern — C E G C E repeated as 16ths
            // LH bass
            { note: 48, start: 0, duration: 2, velocity: 0.5 },    // C3 half
            { note: 48, start: 2, duration: 2, velocity: 0.5 },    // C3 half
            // RH arpeggiated 16ths
            { note: 64, start: 0, duration: 0.25, velocity: 0.6 },   // E4
            { note: 67, start: 0.25, duration: 0.25, velocity: 0.6 }, // G4
            { note: 72, start: 0.5, duration: 0.25, velocity: 0.6 },  // C5
            { note: 76, start: 0.75, duration: 0.25, velocity: 0.7 }, // E5
            { note: 67, start: 1, duration: 0.25, velocity: 0.6 },
            { note: 72, start: 1.25, duration: 0.25, velocity: 0.6 },
            { note: 76, start: 1.5, duration: 0.25, velocity: 0.7 },
            { note: 67, start: 1.75, duration: 0.25, velocity: 0.6 },
            { note: 64, start: 2, duration: 0.25, velocity: 0.6 },
            { note: 67, start: 2.25, duration: 0.25, velocity: 0.6 },
            { note: 72, start: 2.5, duration: 0.25, velocity: 0.6 },
            { note: 76, start: 2.75, duration: 0.25, velocity: 0.7 },
            { note: 67, start: 3, duration: 0.25, velocity: 0.6 },
            { note: 72, start: 3.25, duration: 0.25, velocity: 0.6 },
            { note: 76, start: 3.5, duration: 0.25, velocity: 0.7 },
            { note: 67, start: 3.75, duration: 0.25, velocity: 0.6 },
            // Measure 2: Dm7 — D A D F C repeated
            { note: 50, start: 4, duration: 2, velocity: 0.5 },    // D3
            { note: 50, start: 6, duration: 2, velocity: 0.5 },
            { note: 62, start: 4, duration: 0.25, velocity: 0.6 },   // D4
            { note: 69, start: 4.25, duration: 0.25, velocity: 0.6 }, // A4
            { note: 74, start: 4.5, duration: 0.25, velocity: 0.6 },  // D5
            { note: 77, start: 4.75, duration: 0.25, velocity: 0.7 }, // F5
            { note: 69, start: 5, duration: 0.25, velocity: 0.6 },
            { note: 74, start: 5.25, duration: 0.25, velocity: 0.6 },
            { note: 77, start: 5.5, duration: 0.25, velocity: 0.7 },
            { note: 69, start: 5.75, duration: 0.25, velocity: 0.6 },
            { note: 62, start: 6, duration: 0.25, velocity: 0.6 },
            { note: 69, start: 6.25, duration: 0.25, velocity: 0.6 },
            { note: 74, start: 6.5, duration: 0.25, velocity: 0.6 },
            { note: 77, start: 6.75, duration: 0.25, velocity: 0.7 },
            { note: 69, start: 7, duration: 0.25, velocity: 0.6 },
            { note: 74, start: 7.25, duration: 0.25, velocity: 0.6 },
            { note: 77, start: 7.5, duration: 0.25, velocity: 0.7 },
            { note: 69, start: 7.75, duration: 0.25, velocity: 0.6 },
            // Measure 3: G7 — B D G B F
            { note: 55, start: 8, duration: 2, velocity: 0.5 },     // G3
            { note: 55, start: 10, duration: 2, velocity: 0.5 },
            { note: 59, start: 8, duration: 0.25, velocity: 0.6 },    // B3
            { note: 67, start: 8.25, duration: 0.25, velocity: 0.6 }, // G4
            { note: 71, start: 8.5, duration: 0.25, velocity: 0.6 },  // B4
            { note: 77, start: 8.75, duration: 0.25, velocity: 0.7 }, // F5
            { note: 67, start: 9, duration: 0.25, velocity: 0.6 },
            { note: 71, start: 9.25, duration: 0.25, velocity: 0.6 },
            { note: 77, start: 9.5, duration: 0.25, velocity: 0.7 },
            { note: 67, start: 9.75, duration: 0.25, velocity: 0.6 },
            { note: 59, start: 10, duration: 0.25, velocity: 0.6 },
            { note: 67, start: 10.25, duration: 0.25, velocity: 0.6 },
            { note: 71, start: 10.5, duration: 0.25, velocity: 0.6 },
            { note: 77, start: 10.75, duration: 0.25, velocity: 0.7 },
            { note: 67, start: 11, duration: 0.25, velocity: 0.6 },
            { note: 71, start: 11.25, duration: 0.25, velocity: 0.6 },
            { note: 77, start: 11.5, duration: 0.25, velocity: 0.7 },
            { note: 67, start: 11.75, duration: 0.25, velocity: 0.6 },
            // Measure 4: C major again
            { note: 48, start: 12, duration: 2, velocity: 0.5 },
            { note: 48, start: 14, duration: 2, velocity: 0.5 },
            { note: 64, start: 12, duration: 0.25, velocity: 0.6 },
            { note: 67, start: 12.25, duration: 0.25, velocity: 0.6 },
            { note: 72, start: 12.5, duration: 0.25, velocity: 0.6 },
            { note: 76, start: 12.75, duration: 0.25, velocity: 0.7 },
            { note: 67, start: 13, duration: 0.25, velocity: 0.6 },
            { note: 72, start: 13.25, duration: 0.25, velocity: 0.6 },
            { note: 76, start: 13.5, duration: 0.25, velocity: 0.7 },
            { note: 67, start: 13.75, duration: 0.25, velocity: 0.6 },
            { note: 64, start: 14, duration: 0.25, velocity: 0.6 },
            { note: 67, start: 14.25, duration: 0.25, velocity: 0.6 },
            { note: 72, start: 14.5, duration: 0.25, velocity: 0.6 },
            { note: 76, start: 14.75, duration: 0.25, velocity: 0.7 },
            { note: 67, start: 15, duration: 0.25, velocity: 0.6 },
            { note: 72, start: 15.25, duration: 0.25, velocity: 0.6 },
            { note: 76, start: 15.5, duration: 0.25, velocity: 0.7 },
            { note: 67, start: 15.75, duration: 0.25, velocity: 0.6 },
        ],
    },
    {
        title: 'Gymnop\u00e9die No. 1',
        composer: 'Erik Satie',
        region: 'France',
        year: '1888',
        key: 'D',
        clef: 'grand',
        timeSignature: [3, 4],
        bpm: 72,
        measures: 8,
        category: 'classical',
        notes: [
            // LH: alternating Gmaj7 and Dmaj7 chords (bass + dyad)
            // m1: Gmaj7 — G2 bass, B3+D4
            { note: 43, start: 0, duration: 1, velocity: 0.4 },     // G2
            { note: 59, start: 1, duration: 2, velocity: 0.35 },    // B3
            { note: 62, start: 1, duration: 2, velocity: 0.35 },    // D4
            // m2: Dmaj7 — D3 bass, F#3+A3
            { note: 50, start: 3, duration: 1, velocity: 0.4 },     // D3
            { note: 54, start: 4, duration: 2, velocity: 0.35 },    // F#3
            { note: 57, start: 4, duration: 2, velocity: 0.35 },    // A3
            // m3: Gmaj7
            { note: 43, start: 6, duration: 1, velocity: 0.4 },
            { note: 59, start: 7, duration: 2, velocity: 0.35 },
            { note: 62, start: 7, duration: 2, velocity: 0.35 },
            // m4: Dmaj7
            { note: 50, start: 9, duration: 1, velocity: 0.4 },
            { note: 54, start: 10, duration: 2, velocity: 0.35 },
            { note: 57, start: 10, duration: 2, velocity: 0.35 },
            // m5: Gmaj7 — melody enters: F#5 half, D5 quarter
            { note: 43, start: 12, duration: 1, velocity: 0.4 },
            { note: 59, start: 13, duration: 2, velocity: 0.35 },
            { note: 62, start: 13, duration: 2, velocity: 0.35 },
            { note: 78, start: 12, duration: 2, velocity: 0.7 },    // F#5
            { note: 74, start: 14, duration: 1, velocity: 0.65 },   // D5
            // m6: Dmaj7 — E5 dotted half
            { note: 50, start: 15, duration: 1, velocity: 0.4 },
            { note: 54, start: 16, duration: 2, velocity: 0.35 },
            { note: 57, start: 16, duration: 2, velocity: 0.35 },
            { note: 76, start: 15, duration: 3, velocity: 0.7 },    // E5
            // m7: Gmaj7 — C#5 half, A4 quarter
            { note: 43, start: 18, duration: 1, velocity: 0.4 },
            { note: 59, start: 19, duration: 2, velocity: 0.35 },
            { note: 62, start: 19, duration: 2, velocity: 0.35 },
            { note: 73, start: 18, duration: 2, velocity: 0.7 },    // C#5
            { note: 69, start: 20, duration: 1, velocity: 0.65 },   // A4
            // m8: Dmaj7 — D5 dotted half
            { note: 50, start: 21, duration: 1, velocity: 0.4 },
            { note: 54, start: 22, duration: 2, velocity: 0.35 },
            { note: 57, start: 22, duration: 2, velocity: 0.35 },
            { note: 74, start: 21, duration: 3, velocity: 0.7 },    // D5
        ],
    },
    {
        title: 'Nocturne in E-flat Major, Op. 9 No. 2',
        composer: 'Fr\u00e9d\u00e9ric Chopin',
        region: 'Poland',
        year: '1832',
        key: 'Eb',
        clef: 'grand',
        timeSignature: [12, 8],
        bpm: 69,
        measures: 4,
        category: 'classical',
        notes: [
            // Simplified: melody in Eb major over arpeggiated LH
            // 12/8 = 4 dotted-quarter groups per measure, 12 eighth-note beats per measure
            // Using beat = eighth note for simplicity: 12 beats per measure
            // LH Bb2-Eb3-G3 arpeggio pattern (simplified as block chords)
            { note: 46, start: 0, duration: 3, velocity: 0.4 },     // Bb2
            { note: 51, start: 0, duration: 3, velocity: 0.35 },    // Eb3
            { note: 55, start: 0, duration: 3, velocity: 0.35 },    // G3
            { note: 46, start: 3, duration: 3, velocity: 0.4 },
            { note: 51, start: 3, duration: 3, velocity: 0.35 },
            { note: 55, start: 3, duration: 3, velocity: 0.35 },
            { note: 46, start: 6, duration: 3, velocity: 0.4 },
            { note: 51, start: 6, duration: 3, velocity: 0.35 },
            { note: 55, start: 6, duration: 3, velocity: 0.35 },
            { note: 46, start: 9, duration: 3, velocity: 0.4 },
            { note: 51, start: 9, duration: 3, velocity: 0.35 },
            { note: 55, start: 9, duration: 3, velocity: 0.35 },
            // RH melody: Bb4 dotted-quarter, G4, Bb4-C5-D5-Eb5 etc.
            { note: 70, start: 0, duration: 3, velocity: 0.75 },    // Bb4
            { note: 67, start: 3, duration: 1.5, velocity: 0.7 },   // G4
            { note: 70, start: 4.5, duration: 1, velocity: 0.7 },   // Bb4
            { note: 72, start: 5.5, duration: 1, velocity: 0.7 },   // C5
            { note: 75, start: 6.5, duration: 3, velocity: 0.75 },  // Eb5
            { note: 74, start: 9.5, duration: 1, velocity: 0.65 },  // D5
            { note: 72, start: 10.5, duration: 1.5, velocity: 0.65 }, // C5
            // m2
            { note: 46, start: 12, duration: 3, velocity: 0.4 },
            { note: 51, start: 12, duration: 3, velocity: 0.35 },
            { note: 55, start: 12, duration: 3, velocity: 0.35 },
            { note: 46, start: 15, duration: 3, velocity: 0.4 },
            { note: 51, start: 15, duration: 3, velocity: 0.35 },
            { note: 55, start: 15, duration: 3, velocity: 0.35 },
            { note: 46, start: 18, duration: 3, velocity: 0.4 },
            { note: 51, start: 18, duration: 3, velocity: 0.35 },
            { note: 55, start: 18, duration: 3, velocity: 0.35 },
            { note: 46, start: 21, duration: 3, velocity: 0.4 },
            { note: 51, start: 21, duration: 3, velocity: 0.35 },
            { note: 55, start: 21, duration: 3, velocity: 0.35 },
            { note: 70, start: 12, duration: 3, velocity: 0.75 },   // Bb4
            { note: 67, start: 15, duration: 1.5, velocity: 0.7 },  // G4
            { note: 63, start: 16.5, duration: 1, velocity: 0.65 }, // Eb4
            { note: 65, start: 17.5, duration: 1, velocity: 0.65 }, // F4
            { note: 67, start: 18.5, duration: 2, velocity: 0.7 },  // G4
            { note: 65, start: 20.5, duration: 1.5, velocity: 0.65 }, // F4
            { note: 63, start: 22, duration: 2, velocity: 0.6 },    // Eb4
        ],
    },
    {
        title: 'Clair de Lune',
        composer: 'Claude Debussy',
        region: 'France',
        year: '1905',
        key: 'Db',
        clef: 'grand',
        timeSignature: [9, 8],
        bpm: 60,
        measures: 4,
        category: 'classical',
        notes: [
            // 9/8 = 9 eighth-note beats per measure
            // Opening: pp, very gentle, ascending thirds
            // m1: Db-F, Eb-Ab, F-Ab (simple ascending melody)
            { note: 61, start: 0, duration: 3, velocity: 0.45 },    // Db4
            { note: 65, start: 0, duration: 3, velocity: 0.5 },     // F4
            { note: 63, start: 3, duration: 3, velocity: 0.5 },     // Eb4
            { note: 68, start: 3, duration: 3, velocity: 0.55 },    // Ab4
            { note: 65, start: 6, duration: 3, velocity: 0.55 },    // F4
            { note: 68, start: 6, duration: 3, velocity: 0.55 },    // Ab4
            // m2: Bb-Db5, Ab-F
            { note: 70, start: 9, duration: 3, velocity: 0.55 },    // Bb4
            { note: 73, start: 9, duration: 3, velocity: 0.6 },     // Db5
            { note: 68, start: 12, duration: 3, velocity: 0.5 },    // Ab4
            { note: 65, start: 12, duration: 3, velocity: 0.5 },    // F4
            { note: 63, start: 15, duration: 3, velocity: 0.45 },   // Eb4
            { note: 61, start: 15, duration: 3, velocity: 0.45 },   // Db4
            // m3: repeat variation — Db-F, Eb-Ab, F-Bb
            { note: 61, start: 18, duration: 3, velocity: 0.5 },
            { note: 65, start: 18, duration: 3, velocity: 0.5 },
            { note: 63, start: 21, duration: 3, velocity: 0.5 },
            { note: 68, start: 21, duration: 3, velocity: 0.55 },
            { note: 65, start: 24, duration: 3, velocity: 0.55 },
            { note: 70, start: 24, duration: 3, velocity: 0.6 },
            // m4: climax of phrase — Db5, C5, Bb4
            { note: 73, start: 27, duration: 4.5, velocity: 0.65 }, // Db5
            { note: 72, start: 31.5, duration: 2, velocity: 0.55 }, // C5
            { note: 70, start: 33.5, duration: 2.5, velocity: 0.5 }, // Bb4
        ],
    },
    {
        title: 'Maple Leaf Rag',
        composer: 'Scott Joplin',
        region: 'USA',
        year: '1899',
        key: 'Ab',
        clef: 'grand',
        timeSignature: [2, 4],
        bpm: 100,
        measures: 8,
        category: 'classical',
        notes: [
            // 2/4 time, 2 beats per measure — ragtime syncopation
            // Opening A section theme
            // LH: stride pattern (bass-chord-bass-chord)
            // m1
            { note: 44, start: 0, duration: 0.5, velocity: 0.5 },   // Ab2
            { note: 60, start: 0.5, duration: 0.5, velocity: 0.4 }, // C4
            { note: 63, start: 0.5, duration: 0.5, velocity: 0.4 }, // Eb4
            { note: 51, start: 1, duration: 0.5, velocity: 0.5 },   // Eb3
            { note: 60, start: 1.5, duration: 0.5, velocity: 0.4 },
            { note: 63, start: 1.5, duration: 0.5, velocity: 0.4 },
            // RH: syncopated melody
            { note: 68, start: 0, duration: 0.25, velocity: 0.7 },  // Ab4
            { note: 72, start: 0.25, duration: 0.25, velocity: 0.7 }, // C5
            { note: 75, start: 0.5, duration: 0.5, velocity: 0.75 }, // Eb5
            { note: 73, start: 1, duration: 0.25, velocity: 0.7 },  // Db5
            { note: 72, start: 1.25, duration: 0.25, velocity: 0.7 }, // C5
            { note: 70, start: 1.5, duration: 0.5, velocity: 0.75 }, // Bb4
            // m2
            { note: 44, start: 2, duration: 0.5, velocity: 0.5 },
            { note: 60, start: 2.5, duration: 0.5, velocity: 0.4 },
            { note: 63, start: 2.5, duration: 0.5, velocity: 0.4 },
            { note: 51, start: 3, duration: 0.5, velocity: 0.5 },
            { note: 60, start: 3.5, duration: 0.5, velocity: 0.4 },
            { note: 63, start: 3.5, duration: 0.5, velocity: 0.4 },
            { note: 68, start: 2, duration: 0.75, velocity: 0.75 }, // Ab4
            { note: 72, start: 2.75, duration: 0.25, velocity: 0.65 }, // C5
            { note: 75, start: 3, duration: 0.5, velocity: 0.75 },  // Eb5
            { note: 72, start: 3.5, duration: 0.5, velocity: 0.7 }, // C5
            // m3-4: continuation
            { note: 44, start: 4, duration: 0.5, velocity: 0.5 },
            { note: 60, start: 4.5, duration: 0.5, velocity: 0.4 },
            { note: 63, start: 4.5, duration: 0.5, velocity: 0.4 },
            { note: 51, start: 5, duration: 0.5, velocity: 0.5 },
            { note: 60, start: 5.5, duration: 0.5, velocity: 0.4 },
            { note: 63, start: 5.5, duration: 0.5, velocity: 0.4 },
            { note: 68, start: 4, duration: 0.25, velocity: 0.7 },
            { note: 72, start: 4.25, duration: 0.25, velocity: 0.7 },
            { note: 75, start: 4.5, duration: 0.5, velocity: 0.75 },
            { note: 73, start: 5, duration: 0.25, velocity: 0.7 },
            { note: 72, start: 5.25, duration: 0.25, velocity: 0.7 },
            { note: 70, start: 5.5, duration: 0.5, velocity: 0.75 },
            { note: 44, start: 6, duration: 0.5, velocity: 0.5 },
            { note: 60, start: 6.5, duration: 0.5, velocity: 0.4 },
            { note: 63, start: 6.5, duration: 0.5, velocity: 0.4 },
            { note: 51, start: 7, duration: 0.5, velocity: 0.5 },
            { note: 60, start: 7.5, duration: 0.5, velocity: 0.4 },
            { note: 63, start: 7.5, duration: 0.5, velocity: 0.4 },
            { note: 68, start: 6, duration: 1, velocity: 0.8 },     // Ab4 held
            { note: 72, start: 7, duration: 0.5, velocity: 0.7 },
            { note: 68, start: 7.5, duration: 0.5, velocity: 0.65 },
            // m5-8: second phrase
            { note: 44, start: 8, duration: 0.5, velocity: 0.5 },
            { note: 60, start: 8.5, duration: 0.5, velocity: 0.4 },
            { note: 63, start: 8.5, duration: 0.5, velocity: 0.4 },
            { note: 51, start: 9, duration: 0.5, velocity: 0.5 },
            { note: 60, start: 9.5, duration: 0.5, velocity: 0.4 },
            { note: 63, start: 9.5, duration: 0.5, velocity: 0.4 },
            { note: 75, start: 8, duration: 0.25, velocity: 0.7 },
            { note: 77, start: 8.25, duration: 0.25, velocity: 0.7 },
            { note: 80, start: 8.5, duration: 0.5, velocity: 0.8 }, // Ab5
            { note: 77, start: 9, duration: 0.25, velocity: 0.7 },
            { note: 75, start: 9.25, duration: 0.25, velocity: 0.7 },
            { note: 72, start: 9.5, duration: 0.5, velocity: 0.75 },
            { note: 44, start: 10, duration: 0.5, velocity: 0.5 },
            { note: 60, start: 10.5, duration: 0.5, velocity: 0.4 },
            { note: 63, start: 10.5, duration: 0.5, velocity: 0.4 },
            { note: 51, start: 11, duration: 0.5, velocity: 0.5 },
            { note: 60, start: 11.5, duration: 0.5, velocity: 0.4 },
            { note: 63, start: 11.5, duration: 0.5, velocity: 0.4 },
            { note: 70, start: 10, duration: 0.75, velocity: 0.7 },
            { note: 68, start: 10.75, duration: 0.25, velocity: 0.65 },
            { note: 70, start: 11, duration: 0.5, velocity: 0.7 },
            { note: 72, start: 11.5, duration: 0.5, velocity: 0.75 },
            { note: 44, start: 12, duration: 0.5, velocity: 0.5 },
            { note: 60, start: 12.5, duration: 0.5, velocity: 0.4 },
            { note: 63, start: 12.5, duration: 0.5, velocity: 0.4 },
            { note: 51, start: 13, duration: 0.5, velocity: 0.5 },
            { note: 60, start: 13.5, duration: 0.5, velocity: 0.4 },
            { note: 63, start: 13.5, duration: 0.5, velocity: 0.4 },
            { note: 75, start: 12, duration: 0.5, velocity: 0.75 },
            { note: 72, start: 12.5, duration: 0.25, velocity: 0.7 },
            { note: 70, start: 12.75, duration: 0.25, velocity: 0.7 },
            { note: 68, start: 13, duration: 1, velocity: 0.8 },
            { note: 44, start: 14, duration: 0.5, velocity: 0.5 },
            { note: 60, start: 14.5, duration: 0.5, velocity: 0.4 },
            { note: 63, start: 14.5, duration: 0.5, velocity: 0.4 },
            { note: 51, start: 15, duration: 0.5, velocity: 0.5 },
            { note: 60, start: 15.5, duration: 0.5, velocity: 0.4 },
            { note: 63, start: 15.5, duration: 0.5, velocity: 0.4 },
            { note: 68, start: 14, duration: 2, velocity: 0.8 },    // Ab4 resolves
        ],
    },
    {
        title: 'Romance in A minor, Op. 11 No. 3',
        composer: 'Clara Schumann',
        region: 'Germany',
        year: '1840',
        key: 'C',  // Am relative
        clef: 'grand',
        timeSignature: [4, 4],
        bpm: 76,
        measures: 4,
        category: 'classical',
        notes: [
            // Opening melody in A minor — lyrical Romantic character
            // LH: A minor arpeggiated
            { note: 45, start: 0, duration: 2, velocity: 0.45 },    // A2
            { note: 52, start: 0.5, duration: 1.5, velocity: 0.35 }, // E3
            { note: 57, start: 1, duration: 1, velocity: 0.35 },    // A3
            { note: 45, start: 2, duration: 2, velocity: 0.45 },
            { note: 52, start: 2.5, duration: 1.5, velocity: 0.35 },
            { note: 57, start: 3, duration: 1, velocity: 0.35 },
            // RH: E5-D5-C5-B4 descending melody
            { note: 76, start: 0, duration: 1.5, velocity: 0.7 },   // E5
            { note: 74, start: 1.5, duration: 0.5, velocity: 0.65 }, // D5
            { note: 72, start: 2, duration: 1, velocity: 0.7 },     // C5
            { note: 71, start: 3, duration: 1, velocity: 0.65 },    // B4
            // m2
            { note: 45, start: 4, duration: 2, velocity: 0.45 },
            { note: 52, start: 4.5, duration: 1.5, velocity: 0.35 },
            { note: 57, start: 5, duration: 1, velocity: 0.35 },
            { note: 45, start: 6, duration: 2, velocity: 0.45 },
            { note: 52, start: 6.5, duration: 1.5, velocity: 0.35 },
            { note: 57, start: 7, duration: 1, velocity: 0.35 },
            { note: 69, start: 4, duration: 2, velocity: 0.7 },     // A4
            { note: 72, start: 6, duration: 1, velocity: 0.7 },     // C5
            { note: 71, start: 7, duration: 0.5, velocity: 0.65 },  // B4
            { note: 69, start: 7.5, duration: 0.5, velocity: 0.6 }, // A4
            // m3
            { note: 52, start: 8, duration: 2, velocity: 0.45 },    // E3
            { note: 56, start: 8.5, duration: 1.5, velocity: 0.35 }, // G#3
            { note: 59, start: 9, duration: 1, velocity: 0.35 },    // B3
            { note: 52, start: 10, duration: 2, velocity: 0.45 },
            { note: 56, start: 10.5, duration: 1.5, velocity: 0.35 },
            { note: 59, start: 11, duration: 1, velocity: 0.35 },
            { note: 71, start: 8, duration: 1.5, velocity: 0.7 },   // B4
            { note: 76, start: 9.5, duration: 0.5, velocity: 0.7 }, // E5
            { note: 74, start: 10, duration: 1, velocity: 0.65 },   // D5
            { note: 72, start: 11, duration: 1, velocity: 0.65 },   // C5
            // m4
            { note: 45, start: 12, duration: 2, velocity: 0.45 },
            { note: 52, start: 12.5, duration: 1.5, velocity: 0.35 },
            { note: 57, start: 13, duration: 1, velocity: 0.35 },
            { note: 45, start: 14, duration: 2, velocity: 0.45 },
            { note: 52, start: 14.5, duration: 1.5, velocity: 0.35 },
            { note: 57, start: 15, duration: 1, velocity: 0.35 },
            { note: 69, start: 12, duration: 3, velocity: 0.75 },   // A4 long
            { note: 68, start: 15, duration: 1, velocity: 0.55 },   // G#4
        ],
    },

    // ===== FOLK =====
    {
        title: 'Greensleeves',
        composer: 'Traditional',
        region: 'England',
        year: '16th c.',
        key: 'C', // Am
        clef: 'treble',
        timeSignature: [3, 4],
        bpm: 100,
        measures: 8,
        category: 'folk',
        notes: [
            // A section melody in A minor, 3/4
            // Pickup: A4
            { note: 69, start: 2, duration: 1, velocity: 0.65 },    // A4 pickup
            // m1: C5 half, D5 quarter
            { note: 72, start: 3, duration: 2, velocity: 0.7 },     // C5
            { note: 74, start: 5, duration: 1, velocity: 0.7 },     // D5
            // m2: E5 dotted-quarter, F5 eighth, E5 quarter
            { note: 76, start: 6, duration: 1.5, velocity: 0.75 },  // E5
            { note: 77, start: 7.5, duration: 0.5, velocity: 0.65 }, // F5
            { note: 76, start: 8, duration: 1, velocity: 0.7 },     // E5
            // m3: D5 half, B4 quarter
            { note: 74, start: 9, duration: 2, velocity: 0.7 },     // D5
            { note: 71, start: 11, duration: 1, velocity: 0.65 },   // B4
            // m4: G4 dotted-quarter, A4 eighth, B4 quarter
            { note: 67, start: 12, duration: 1.5, velocity: 0.65 }, // G4
            { note: 69, start: 13.5, duration: 0.5, velocity: 0.6 }, // A4
            { note: 71, start: 14, duration: 1, velocity: 0.65 },   // B4
            // m5: C5 half, A4 quarter
            { note: 72, start: 15, duration: 2, velocity: 0.7 },    // C5
            { note: 69, start: 17, duration: 1, velocity: 0.65 },   // A4
            // m6: A4 dotted-quarter, G#4 eighth, A4 quarter
            { note: 69, start: 18, duration: 1.5, velocity: 0.65 }, // A4
            { note: 68, start: 19.5, duration: 0.5, velocity: 0.6 }, // G#4
            { note: 69, start: 20, duration: 1, velocity: 0.65 },   // A4
            // m7: B4 half, G#4 quarter
            { note: 71, start: 21, duration: 2, velocity: 0.7 },    // B4
            { note: 68, start: 23, duration: 1, velocity: 0.6 },    // G#4
            // m8: E4 dotted half (resolve)
            { note: 64, start: 24, duration: 3, velocity: 0.7 },    // E4
        ],
    },
    {
        title: 'Sakura Sakura',
        composer: 'Traditional',
        region: 'Japan',
        year: 'Edo era',
        key: 'C', // Am pentatonic
        clef: 'treble',
        timeSignature: [4, 4],
        bpm: 72,
        measures: 4,
        category: 'folk',
        notes: [
            // Japanese pentatonic: A B C E F (In scale)
            // m1: A4 A4 B4 — B4 —
            { note: 69, start: 0, duration: 1, velocity: 0.65 },    // A4
            { note: 69, start: 1, duration: 1, velocity: 0.65 },    // A4
            { note: 71, start: 2, duration: 2, velocity: 0.7 },     // B4
            // m2: A4 A4 B4 —
            { note: 69, start: 4, duration: 1, velocity: 0.65 },
            { note: 69, start: 5, duration: 1, velocity: 0.65 },
            { note: 71, start: 6, duration: 2, velocity: 0.7 },
            // m3: A4 B4 C5 B4 A4 B4 — (quicker)
            { note: 69, start: 8, duration: 0.5, velocity: 0.65 },
            { note: 71, start: 8.5, duration: 0.5, velocity: 0.65 },
            { note: 72, start: 9, duration: 1, velocity: 0.7 },     // C5
            { note: 71, start: 10, duration: 0.5, velocity: 0.65 },
            { note: 69, start: 10.5, duration: 0.5, velocity: 0.6 },
            { note: 71, start: 11, duration: 1, velocity: 0.7 },
            // m4: A4 — E4 — (resolve down)
            { note: 69, start: 12, duration: 2, velocity: 0.65 },
            { note: 64, start: 14, duration: 2, velocity: 0.6 },    // E4
        ],
    },
    {
        title: 'Arirang',
        composer: 'Traditional',
        region: 'Korea',
        year: 'Ancient',
        key: 'G',
        clef: 'treble',
        timeSignature: [3, 4],
        bpm: 88,
        measures: 8,
        category: 'folk',
        notes: [
            // Korean folk in G major pentatonic (G A B D E), 3/4
            // The famous "Arirang, Arirang, arariyo" melody
            // m1: G4 quarter, A4 quarter, B4 quarter
            { note: 67, start: 0, duration: 1, velocity: 0.65 },    // G4
            { note: 69, start: 1, duration: 1, velocity: 0.65 },    // A4
            { note: 71, start: 2, duration: 1, velocity: 0.7 },     // B4
            // m2: D5 half, B4 quarter
            { note: 74, start: 3, duration: 2, velocity: 0.75 },    // D5
            { note: 71, start: 5, duration: 1, velocity: 0.65 },    // B4
            // m3: A4 quarter, G4 quarter, A4 quarter
            { note: 69, start: 6, duration: 1, velocity: 0.65 },
            { note: 67, start: 7, duration: 1, velocity: 0.6 },
            { note: 69, start: 8, duration: 1, velocity: 0.65 },
            // m4: B4 dotted half (held)
            { note: 71, start: 9, duration: 3, velocity: 0.7 },
            // m5: D5 quarter, E5 quarter, D5 quarter
            { note: 74, start: 12, duration: 1, velocity: 0.7 },    // D5
            { note: 76, start: 13, duration: 1, velocity: 0.75 },   // E5
            { note: 74, start: 14, duration: 1, velocity: 0.7 },
            // m6: B4 half, A4 quarter
            { note: 71, start: 15, duration: 2, velocity: 0.7 },
            { note: 69, start: 17, duration: 1, velocity: 0.65 },
            // m7: G4 quarter, A4 quarter, B4 quarter
            { note: 67, start: 18, duration: 1, velocity: 0.6 },
            { note: 69, start: 19, duration: 1, velocity: 0.65 },
            { note: 71, start: 20, duration: 1, velocity: 0.65 },
            // m8: G4 dotted half (resolve)
            { note: 67, start: 21, duration: 3, velocity: 0.7 },
        ],
    },
    {
        title: 'La Bamba',
        composer: 'Traditional',
        region: 'Mexico',
        year: 'Traditional',
        key: 'C',
        clef: 'treble',
        timeSignature: [4, 4],
        bpm: 140,
        measures: 4,
        category: 'folk',
        notes: [
            // Son jarocho melody over C-F-G progression
            // m1: C major — C5 eighth notes, syncopated melody
            { note: 72, start: 0, duration: 0.5, velocity: 0.75 },  // C5
            { note: 72, start: 0.5, duration: 0.5, velocity: 0.7 },
            { note: 74, start: 1, duration: 0.5, velocity: 0.75 },  // D5
            { note: 76, start: 1.5, duration: 0.5, velocity: 0.75 }, // E5
            { note: 76, start: 2, duration: 1, velocity: 0.8 },     // E5
            { note: 74, start: 3, duration: 0.5, velocity: 0.7 },   // D5
            { note: 72, start: 3.5, duration: 0.5, velocity: 0.7 }, // C5
            // m2: F-G resolution
            { note: 77, start: 4, duration: 1, velocity: 0.8 },     // F5
            { note: 76, start: 5, duration: 0.5, velocity: 0.75 },  // E5
            { note: 74, start: 5.5, duration: 0.5, velocity: 0.7 }, // D5
            { note: 79, start: 6, duration: 1, velocity: 0.8 },     // G5
            { note: 77, start: 7, duration: 0.5, velocity: 0.75 },  // F5
            { note: 76, start: 7.5, duration: 0.5, velocity: 0.7 }, // E5
            // m3: repeat with variation
            { note: 72, start: 8, duration: 0.5, velocity: 0.75 },
            { note: 74, start: 8.5, duration: 0.5, velocity: 0.75 },
            { note: 76, start: 9, duration: 1, velocity: 0.8 },
            { note: 79, start: 10, duration: 0.5, velocity: 0.8 },
            { note: 77, start: 10.5, duration: 0.5, velocity: 0.75 },
            { note: 76, start: 11, duration: 0.5, velocity: 0.7 },
            { note: 74, start: 11.5, duration: 0.5, velocity: 0.7 },
            // m4: resolve to C
            { note: 72, start: 12, duration: 2, velocity: 0.8 },    // C5
            { note: 67, start: 14, duration: 1, velocity: 0.7 },    // G4
            { note: 72, start: 15, duration: 1, velocity: 0.75 },   // C5
        ],
    },
    {
        title: 'Kalinka',
        composer: 'Ivan Larionov',
        region: 'Russia',
        year: '1860',
        key: 'C', // Dm
        clef: 'treble',
        timeSignature: [2, 4],
        bpm: 90,
        measures: 8,
        category: 'folk',
        notes: [
            // Dm verse: slow and lyrical "Pod sosnoyu, pod zelenoyu"
            // m1-2: D4 A4 A4 A4 | A4 G4 F4 E4
            { note: 62, start: 0, duration: 1, velocity: 0.65 },    // D4
            { note: 69, start: 1, duration: 0.5, velocity: 0.7 },   // A4
            { note: 69, start: 1.5, duration: 0.5, velocity: 0.7 },
            { note: 69, start: 2, duration: 0.5, velocity: 0.7 },
            { note: 69, start: 2.5, duration: 0.5, velocity: 0.7 },
            { note: 67, start: 3, duration: 0.5, velocity: 0.65 },  // G4
            { note: 65, start: 3.5, duration: 0.5, velocity: 0.6 }, // F4
            // m3-4: E4 D4 — F4 E4 D4
            { note: 64, start: 4, duration: 0.5, velocity: 0.6 },   // E4
            { note: 62, start: 4.5, duration: 1.5, velocity: 0.65 }, // D4
            { note: 65, start: 6, duration: 0.5, velocity: 0.65 },  // F4
            { note: 64, start: 6.5, duration: 0.5, velocity: 0.6 }, // E4
            { note: 62, start: 7, duration: 1, velocity: 0.65 },    // D4
            // m5-8: Refrain "Kalinka, kalinka, kalinka moya" — faster, D major
            { note: 74, start: 8, duration: 0.25, velocity: 0.8 },  // D5
            { note: 74, start: 8.25, duration: 0.25, velocity: 0.75 },
            { note: 72, start: 8.5, duration: 0.25, velocity: 0.75 }, // C5
            { note: 71, start: 8.75, duration: 0.25, velocity: 0.7 }, // B4
            { note: 69, start: 9, duration: 0.5, velocity: 0.75 },  // A4
            { note: 67, start: 9.5, duration: 0.5, velocity: 0.7 }, // G4
            { note: 74, start: 10, duration: 0.25, velocity: 0.8 },
            { note: 74, start: 10.25, duration: 0.25, velocity: 0.75 },
            { note: 72, start: 10.5, duration: 0.25, velocity: 0.75 },
            { note: 71, start: 10.75, duration: 0.25, velocity: 0.7 },
            { note: 69, start: 11, duration: 0.5, velocity: 0.75 },
            { note: 67, start: 11.5, duration: 0.5, velocity: 0.7 },
            // m7-8: resolve
            { note: 66, start: 12, duration: 0.5, velocity: 0.7 },  // F#4
            { note: 67, start: 12.5, duration: 0.5, velocity: 0.7 }, // G4
            { note: 69, start: 13, duration: 0.5, velocity: 0.75 }, // A4
            { note: 67, start: 13.5, duration: 0.5, velocity: 0.7 },
            { note: 66, start: 14, duration: 0.5, velocity: 0.65 }, // F#4
            { note: 62, start: 14.5, duration: 1.5, velocity: 0.8 }, // D4
        ],
    },

    // ===== GUITAR MASTERS =====
    {
        title: 'L\u00e1grima (Prelude)',
        composer: 'Francisco T\u00e1rrega',
        region: 'Spain',
        year: '1891',
        key: 'E',
        clef: 'treble',
        timeSignature: [3, 4],
        bpm: 80,
        measures: 8,
        category: 'guitar',
        notes: [
            // E major, gentle guitar prelude — "Teardrop"
            // m1: B4-G#4 dyad, then E5-B4-G#4 arpeggio
            { note: 52, start: 0, duration: 3, velocity: 0.4 },     // E3 bass
            { note: 71, start: 0, duration: 1, velocity: 0.65 },    // B4
            { note: 68, start: 0, duration: 1, velocity: 0.6 },     // G#4
            { note: 76, start: 1, duration: 1, velocity: 0.7 },     // E5
            { note: 76, start: 2, duration: 1, velocity: 0.65 },    // E5
            // m2
            { note: 52, start: 3, duration: 3, velocity: 0.4 },
            { note: 78, start: 3, duration: 1.5, velocity: 0.7 },   // F#5
            { note: 76, start: 4.5, duration: 0.5, velocity: 0.65 }, // E5
            { note: 73, start: 5, duration: 1, velocity: 0.65 },    // C#5
            // m3
            { note: 47, start: 6, duration: 3, velocity: 0.4 },     // B2
            { note: 71, start: 6, duration: 1, velocity: 0.65 },    // B4
            { note: 74, start: 7, duration: 1, velocity: 0.7 },     // D5
            { note: 73, start: 8, duration: 1, velocity: 0.65 },    // C#5
            // m4
            { note: 52, start: 9, duration: 3, velocity: 0.4 },
            { note: 71, start: 9, duration: 3, velocity: 0.7 },     // B4 held
            // m5: second phrase
            { note: 52, start: 12, duration: 3, velocity: 0.4 },
            { note: 71, start: 12, duration: 1, velocity: 0.65 },
            { note: 68, start: 12, duration: 1, velocity: 0.6 },
            { note: 76, start: 13, duration: 1, velocity: 0.7 },
            { note: 80, start: 14, duration: 1, velocity: 0.75 },   // G#5
            // m6
            { note: 52, start: 15, duration: 3, velocity: 0.4 },
            { note: 78, start: 15, duration: 1.5, velocity: 0.75 }, // F#5
            { note: 76, start: 16.5, duration: 0.5, velocity: 0.65 },
            { note: 73, start: 17, duration: 1, velocity: 0.65 },
            // m7
            { note: 47, start: 18, duration: 3, velocity: 0.4 },
            { note: 74, start: 18, duration: 1, velocity: 0.7 },    // D#5
            { note: 76, start: 19, duration: 1, velocity: 0.7 },
            { note: 73, start: 20, duration: 1, velocity: 0.65 },
            // m8: resolve to E
            { note: 52, start: 21, duration: 3, velocity: 0.4 },
            { note: 76, start: 21, duration: 3, velocity: 0.75 },   // E5 held
        ],
    },
    {
        title: 'La Catedral: I. Preludio (Saudade)',
        composer: 'Agust\u00edn Barrios Mangor\u00e9',
        region: 'Paraguay',
        year: '1921',
        key: 'C', // Am/B minor areas
        clef: 'treble',
        timeSignature: [4, 4],
        bpm: 66,
        measures: 4,
        category: 'guitar',
        notes: [
            // Preludio Saudade — contemplative, rubato, arpeggiated
            // B minor opening on guitar
            { note: 47, start: 0, duration: 4, velocity: 0.4 },     // B2 bass pedal
            { note: 59, start: 0, duration: 1, velocity: 0.55 },    // B3
            { note: 66, start: 0.5, duration: 0.5, velocity: 0.5 }, // F#4
            { note: 71, start: 1, duration: 1, velocity: 0.6 },     // B4
            { note: 74, start: 2, duration: 0.5, velocity: 0.65 },  // D5
            { note: 73, start: 2.5, duration: 0.5, velocity: 0.6 }, // C#5
            { note: 71, start: 3, duration: 0.5, velocity: 0.6 },   // B4
            { note: 69, start: 3.5, duration: 0.5, velocity: 0.55 }, // A4
            // m2
            { note: 45, start: 4, duration: 4, velocity: 0.4 },     // A2
            { note: 57, start: 4, duration: 1, velocity: 0.55 },    // A3
            { note: 64, start: 4.5, duration: 0.5, velocity: 0.5 }, // E4
            { note: 69, start: 5, duration: 1, velocity: 0.6 },     // A4
            { note: 72, start: 6, duration: 0.5, velocity: 0.65 },  // C5
            { note: 71, start: 6.5, duration: 0.5, velocity: 0.6 }, // B4
            { note: 69, start: 7, duration: 0.5, velocity: 0.55 },  // A4
            { note: 67, start: 7.5, duration: 0.5, velocity: 0.5 }, // G4
            // m3
            { note: 43, start: 8, duration: 4, velocity: 0.4 },     // G2
            { note: 55, start: 8, duration: 1, velocity: 0.55 },    // G3
            { note: 62, start: 8.5, duration: 0.5, velocity: 0.5 }, // D4
            { note: 67, start: 9, duration: 1, velocity: 0.6 },     // G4
            { note: 71, start: 10, duration: 1, velocity: 0.65 },   // B4
            { note: 74, start: 11, duration: 0.5, velocity: 0.7 },  // D5
            { note: 73, start: 11.5, duration: 0.5, velocity: 0.65 }, // C#5
            // m4: resolve to B
            { note: 47, start: 12, duration: 4, velocity: 0.45 },   // B2
            { note: 59, start: 12, duration: 2, velocity: 0.55 },   // B3
            { note: 66, start: 12, duration: 2, velocity: 0.6 },    // F#4
            { note: 71, start: 12, duration: 4, velocity: 0.7 },    // B4 held
        ],
    },
    {
        title: 'Prelude No. 1 in E minor',
        composer: 'Heitor Villa-Lobos',
        region: 'Brazil',
        year: '1940',
        key: 'C', // Em
        clef: 'treble',
        timeSignature: [4, 4],
        bpm: 66,
        measures: 4,
        category: 'guitar',
        notes: [
            // Famous cello-like melody over arpeggiated bass — "lyrical and sentimental"
            // LH: Em arpeggio pattern
            { note: 40, start: 0, duration: 2, velocity: 0.45 },    // E2
            { note: 52, start: 0, duration: 0.5, velocity: 0.35 },  // E3
            { note: 55, start: 0.5, duration: 0.5, velocity: 0.35 }, // G3
            { note: 59, start: 1, duration: 0.5, velocity: 0.35 },  // B3
            { note: 55, start: 1.5, duration: 0.5, velocity: 0.35 },
            { note: 40, start: 2, duration: 2, velocity: 0.45 },
            { note: 52, start: 2, duration: 0.5, velocity: 0.35 },
            { note: 55, start: 2.5, duration: 0.5, velocity: 0.35 },
            { note: 59, start: 3, duration: 0.5, velocity: 0.35 },
            { note: 55, start: 3.5, duration: 0.5, velocity: 0.35 },
            // RH melody: B4 — D5 C5 B4 A4 B4
            { note: 71, start: 0, duration: 2, velocity: 0.7 },     // B4
            { note: 74, start: 2, duration: 0.5, velocity: 0.7 },   // D5
            { note: 72, start: 2.5, duration: 0.5, velocity: 0.65 }, // C5
            { note: 71, start: 3, duration: 0.5, velocity: 0.65 },  // B4
            { note: 69, start: 3.5, duration: 0.5, velocity: 0.6 }, // A4
            // m2
            { note: 45, start: 4, duration: 2, velocity: 0.45 },    // A2
            { note: 52, start: 4, duration: 0.5, velocity: 0.35 },
            { note: 57, start: 4.5, duration: 0.5, velocity: 0.35 }, // A3
            { note: 60, start: 5, duration: 0.5, velocity: 0.35 },  // C4
            { note: 57, start: 5.5, duration: 0.5, velocity: 0.35 },
            { note: 45, start: 6, duration: 2, velocity: 0.45 },
            { note: 52, start: 6, duration: 0.5, velocity: 0.35 },
            { note: 57, start: 6.5, duration: 0.5, velocity: 0.35 },
            { note: 60, start: 7, duration: 0.5, velocity: 0.35 },
            { note: 57, start: 7.5, duration: 0.5, velocity: 0.35 },
            { note: 71, start: 4, duration: 1, velocity: 0.7 },     // B4
            { note: 69, start: 5, duration: 1, velocity: 0.65 },    // A4
            { note: 67, start: 6, duration: 1.5, velocity: 0.7 },   // G4
            { note: 69, start: 7.5, duration: 0.5, velocity: 0.6 }, // A4
            // m3
            { note: 43, start: 8, duration: 2, velocity: 0.45 },    // G2
            { note: 55, start: 8, duration: 0.5, velocity: 0.35 },
            { note: 59, start: 8.5, duration: 0.5, velocity: 0.35 },
            { note: 62, start: 9, duration: 0.5, velocity: 0.35 },  // D4
            { note: 59, start: 9.5, duration: 0.5, velocity: 0.35 },
            { note: 43, start: 10, duration: 2, velocity: 0.45 },
            { note: 55, start: 10, duration: 0.5, velocity: 0.35 },
            { note: 59, start: 10.5, duration: 0.5, velocity: 0.35 },
            { note: 62, start: 11, duration: 0.5, velocity: 0.35 },
            { note: 59, start: 11.5, duration: 0.5, velocity: 0.35 },
            { note: 71, start: 8, duration: 1, velocity: 0.7 },     // B4
            { note: 74, start: 9, duration: 1, velocity: 0.75 },    // D5
            { note: 72, start: 10, duration: 1.5, velocity: 0.7 },  // C5
            { note: 71, start: 11.5, duration: 0.5, velocity: 0.65 },
            // m4: resolve
            { note: 40, start: 12, duration: 4, velocity: 0.5 },    // E2
            { note: 52, start: 12, duration: 0.5, velocity: 0.35 },
            { note: 55, start: 12.5, duration: 0.5, velocity: 0.35 },
            { note: 59, start: 13, duration: 0.5, velocity: 0.35 },
            { note: 55, start: 13.5, duration: 0.5, velocity: 0.35 },
            { note: 52, start: 14, duration: 0.5, velocity: 0.35 },
            { note: 55, start: 14.5, duration: 0.5, velocity: 0.35 },
            { note: 59, start: 15, duration: 0.5, velocity: 0.35 },
            { note: 55, start: 15.5, duration: 0.5, velocity: 0.35 },
            { note: 71, start: 12, duration: 4, velocity: 0.75 },   // B4 sustained
        ],
    },
    {
        title: 'Prelude No. 2 "Blue Lullaby"',
        composer: 'George Gershwin',
        region: 'USA',
        year: '1926',
        key: 'C', // C#m
        clef: 'grand',
        timeSignature: [4, 4],
        bpm: 72,
        measures: 4,
        category: 'classical',
        notes: [
            // Blues-inflected lullaby in C# minor — jazz harmony
            // Simplified opening: slow bluesy melody with LH chords
            // LH: C#m chords
            { note: 49, start: 0, duration: 2, velocity: 0.45 },    // C#3
            { note: 56, start: 0, duration: 2, velocity: 0.4 },     // G#3
            { note: 61, start: 0, duration: 2, velocity: 0.4 },     // C#4
            { note: 49, start: 2, duration: 2, velocity: 0.45 },
            { note: 56, start: 2, duration: 2, velocity: 0.4 },
            { note: 61, start: 2, duration: 2, velocity: 0.4 },
            // RH melody: bluesy, languid
            { note: 73, start: 0, duration: 1.5, velocity: 0.7 },   // C#5
            { note: 71, start: 1.5, duration: 0.5, velocity: 0.6 }, // B4
            { note: 69, start: 2, duration: 1, velocity: 0.65 },    // A4
            { note: 68, start: 3, duration: 0.5, velocity: 0.6 },   // G#4
            { note: 66, start: 3.5, duration: 0.5, velocity: 0.55 }, // F#4
            // m2
            { note: 49, start: 4, duration: 2, velocity: 0.45 },
            { note: 56, start: 4, duration: 2, velocity: 0.4 },
            { note: 61, start: 4, duration: 2, velocity: 0.4 },
            { note: 49, start: 6, duration: 2, velocity: 0.45 },
            { note: 56, start: 6, duration: 2, velocity: 0.4 },
            { note: 61, start: 6, duration: 2, velocity: 0.4 },
            { note: 64, start: 4, duration: 2, velocity: 0.65 },    // E4
            { note: 68, start: 6, duration: 1.5, velocity: 0.7 },   // G#4
            { note: 66, start: 7.5, duration: 0.5, velocity: 0.6 }, // F#4
            // m3
            { note: 52, start: 8, duration: 2, velocity: 0.45 },    // E3
            { note: 56, start: 8, duration: 2, velocity: 0.4 },
            { note: 59, start: 8, duration: 2, velocity: 0.4 },     // B3
            { note: 52, start: 10, duration: 2, velocity: 0.45 },
            { note: 56, start: 10, duration: 2, velocity: 0.4 },
            { note: 59, start: 10, duration: 2, velocity: 0.4 },
            { note: 64, start: 8, duration: 1, velocity: 0.65 },    // E4
            { note: 66, start: 9, duration: 0.5, velocity: 0.6 },   // F#4 (blue note)
            { note: 68, start: 9.5, duration: 1.5, velocity: 0.7 }, // G#4
            { note: 73, start: 11, duration: 1, velocity: 0.7 },    // C#5
            // m4: resolve
            { note: 49, start: 12, duration: 4, velocity: 0.5 },
            { note: 56, start: 12, duration: 4, velocity: 0.45 },
            { note: 61, start: 12, duration: 4, velocity: 0.45 },
            { note: 73, start: 12, duration: 1.5, velocity: 0.7 },  // C#5
            { note: 71, start: 13.5, duration: 0.5, velocity: 0.6 },
            { note: 68, start: 14, duration: 1, velocity: 0.6 },
            { note: 64, start: 15, duration: 1, velocity: 0.55 },   // E4
        ],
    },
];
