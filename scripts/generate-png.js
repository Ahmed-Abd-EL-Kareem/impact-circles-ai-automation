const fs = require('fs');
const path = require('path');

// 1x1 transparent PNG buffer
const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const outDir = path.join(__dirname, '..', 'test-fixtures');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(path.join(outDir, 'fictional-receipt.png'), png1x1);
console.log('Created fictional-receipt.png');
