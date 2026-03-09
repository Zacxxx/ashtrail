import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dir = path.join(__dirname, '../generated/characters');

if (!fs.existsSync(dir)) {
    console.log(`Directory does not exist: ${dir}`);
    process.exit(0);
}

const files = fs.readdirSync(dir);
let migratedCount = 0;

for (const file of files) {
    if (file.endsWith('.json')) {
        const filePath = path.join(dir, file);
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);
            let modified = false;

            if (!data.type) {
                data.type = 'Human';
                modified = true;
            }

            if (!data.worldId) {
                data.worldId = '665774da-472d-4570-adfb-1242ceefdfd9';
                modified = true;
            }

            if (modified) {
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
                console.log(`Migrated: ${file}`);
                migratedCount++;
            }
        } catch (e) {
            console.error(`Error processing ${file}:`, e);
        }
    }
}

console.log(`Migration complete. Migrated ${migratedCount} characters.`);
