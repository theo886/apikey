const fs = require('fs');
const pathModule = require('path');

/**
 * Generate CSV list of assemblies for the BatchPackAndGo macro
 *
 * Usage: node generatePackAndGoList.js -o assemblies_to_pack.csv
 */

const outputFile = process.argv[3] || 'assemblies_to_pack.csv';

// Load categorized assemblies
const topLevel = JSON.parse(fs.readFileSync('output/topLevelAssemblies.json', 'utf8'));
const subAsm = JSON.parse(fs.readFileSync('output/subAssemblies.json', 'utf8'));

// Combine all assemblies
const allAssemblies = [...subAsm, ...topLevel];

console.log(`Found ${allAssemblies.length} assemblies`);
console.log(`  - Top-level: ${topLevel.length}`);
console.log(`  - Sub-assemblies: ${subAsm.length}`);

// Base path for vault (update this to match your system)
const VAULT_BASE = 'C:\\Engineering';

// Generate full paths
const lines = [];
let missingPath = 0;

allAssemblies.forEach(asm => {
    let filePath = asm.filePath;

    if (!filePath) {
        missingPath++;
        return;
    }

    // Convert vault path to full Windows path
    // filePath format: \Production\10,000\10,000-10,999\\10121-01.SLDASM
    // Need: C:\Engineering\Production\10,000\10,000-10,999\10121-01.SLDASM

    // Clean up double backslashes
    filePath = filePath.replace(/\\\\/g, '\\');

    // Add vault base if path is relative
    if (!filePath.match(/^[A-Z]:\\/i)) {
        filePath = VAULT_BASE + filePath;
    }

    lines.push(filePath);
});

// Write CSV
fs.writeFileSync(outputFile, lines.join('\n'), 'utf8');

console.log(`\nGenerated: ${outputFile}`);
console.log(`  Assemblies: ${lines.length}`);
if (missingPath > 0) {
    console.log(`  Skipped (no path): ${missingPath}`);
}

console.log(`\nVault base path: ${VAULT_BASE}`);
console.log('If this is wrong, edit VAULT_BASE in this script.');

console.log(`\nNext steps:`);
console.log(`1. Copy ${outputFile} to C:\\Temp\\assemblies_to_pack.csv`);
console.log(`2. Open SolidWorks`);
console.log(`3. Tools -> Macro -> Run -> BatchPackAndGo.swp`);
