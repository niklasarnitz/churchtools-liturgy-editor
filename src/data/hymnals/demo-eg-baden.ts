import type { HymnalDefinition } from './types';

/** Small fixture only; it intentionally contains no lyrics or notation. */
export const demoEgBaden: HymnalDefinition = {
    id: 'eg-baden-demo',
    version: 1,
    name: 'Demo-Gesangbuch Baden',
    shortName: 'EG Demo Baden',
    organizationIds: ['ekiba'],
    language: 'de',
    description: 'Fünf frei erfundene Testeinträge für die lokale Entwicklung.',
    demo: true,
    songs: [
        { id: 'eg-baden-demo:001', number: '1', title: 'Morgenlicht der Hoffnung', author: 'Demo-Datensatz' },
        { id: 'eg-baden-demo:17a', number: '17a', title: 'Licht auf unsern Wegen', author: 'Demo-Datensatz' },
        { id: 'eg-baden-demo:317', number: '317', title: 'Lobe den Schöpfer', author: 'Demo-Datensatz' },
        { id: 'eg-baden-demo:420', number: '420', title: 'Komm, Geist des Lebens', author: 'Demo-Datensatz' },
        { id: 'eg-baden-demo:695', number: '695', title: 'Segen für den Weg', author: 'Demo-Datensatz' },
    ],
};
