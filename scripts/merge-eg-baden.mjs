import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const [outputPath, rightsPath, ...indexPaths] = process.argv.slice(2);

if (!outputPath || !rightsPath || indexPaths.length === 0) {
    throw new Error('Usage: node scripts/merge-eg-baden.mjs OUTPUT RIGHTS INDEX...');
}

const readJson = async (path) => JSON.parse(await readFile(resolve(path), 'utf8'));
const [rightsMappings, ...indexes] = await Promise.all([
    readJson(rightsPath),
    ...indexPaths.map(readJson),
]);

const headers = indexes.map(({ songs: _songs, ...header }) => header);
const referenceHeader = headers[0];
for (const header of headers.slice(1)) {
    for (const key of ['id', 'version', 'name', 'shortName', 'language']) {
        if (header[key] !== referenceHeader[key]) {
            throw new Error(`Inconsistent hymnal header field ${key}`);
        }
    }
    if (JSON.stringify(header.organizationIds) !== JSON.stringify(referenceHeader.organizationIds)) {
        throw new Error('Inconsistent hymnal header field organizationIds');
    }
}

const entriesByNumberAndTitle = new Map();
indexes.forEach((index, indexPosition) => {
    index.songs.forEach((song, songPosition) => {
        if (!song.id || !song.number || !song.title) {
            throw new Error(`Missing required song field in ${indexPaths[indexPosition]} at index ${songPosition}`);
        }
        const key = JSON.stringify([song.number, song.title]);
        const existing = entriesByNumberAndTitle.get(key);
        const source = {
            file: basename(indexPaths[indexPosition]),
            inputId: song.id,
            position: songPosition,
        };
        if (existing) {
            existing.sources.push(source);
            existing.uncertain ||= song.metadata?.uncertain === true;
        } else {
            entriesByNumberAndTitle.set(key, {
                number: song.number,
                title: song.title,
                author: song.author,
                copyright: song.copyright,
                ccli: song.ccli,
                uncertain: song.metadata?.uncertain === true,
                sources: [source],
            });
        }
    });
});

const compareNumbers = (left, right) => {
    const tokenize = (value) => value.split(/([0-9]+)/).filter(Boolean).map((part) => /^\d+$/.test(part) ? Number(part) : part);
    const leftParts = tokenize(left);
    const rightParts = tokenize(right);
    for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
        if (leftParts[index] === undefined) return -1;
        if (rightParts[index] === undefined) return 1;
        if (leftParts[index] === rightParts[index]) continue;
        if (typeof leftParts[index] === typeof rightParts[index]) return leftParts[index] < rightParts[index] ? -1 : 1;
        return typeof leftParts[index] === 'number' ? -1 : 1;
    }
    return 0;
};

const groupedByNumber = Map.groupBy(entriesByNumberAndTitle.values(), (entry) => entry.number);
const songs = [];
for (const number of [...groupedByNumber.keys()].sort(compareNumbers)) {
    const variants = groupedByNumber.get(number).sort((left, right) => {
        const sourceOrder = left.sources[0].file.localeCompare(right.sources[0].file, 'de');
        return sourceOrder || left.sources[0].position - right.sources[0].position;
    });
    variants.forEach((entry, variantIndex) => {
        const song = {
            id: `${referenceHeader.id}:${number}${variantIndex === 0 ? '' : `#${variantIndex + 1}`}`,
            number,
            title: entry.title,
        };
        if (entry.author) song.author = entry.author;
        if (entry.copyright) song.copyright = entry.copyright;
        if (entry.ccli) song.ccli = entry.ccli;
        song.metadata = {
            uncertain: entry.uncertain || variants.length > 1,
            registerVariant: variantIndex + 1,
            registerVariantCount: variants.length,
            sources: entry.sources,
        };
        songs.push(song);
    });
}

const output = {
    id: referenceHeader.id,
    version: referenceHeader.version,
    name: referenceHeader.name,
    shortName: referenceHeader.shortName,
    organizationIds: referenceHeader.organizationIds.map((id) => id === 'evangelische-landeskirche-in-baden' ? 'ekiba' : id),
    language: referenceHeader.language,
    description: 'Verlustfrei zusammengeführte Transkription des fotografierten alphabetischen Liedverzeichnisses. Identische Registereinträge wurden dedupliziert; abweichende Titel derselben Liednummer bleiben als gekennzeichnete Registervarianten erhalten.',
    metadata: {
        sourceType: 'photographed-alphabetical-index',
        sourceFiles: indexPaths.map((path) => basename(path)),
        inputEntryCount: indexes.reduce((sum, index) => sum + index.songs.length, 0),
        distinctRegisterEntryCount: songs.length,
        distinctNumberCount: groupedByNumber.size,
        rightsMappings,
    },
    songs,
};

await writeFile(resolve(outputPath), `${JSON.stringify(output, null, 2)}\n`);
