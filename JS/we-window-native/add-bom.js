const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\huoxi\\Desktop\\World Editor\\JS\\we-window-native\\src';
const files = ['binding.cc', 'dwm.cc', 'window.cc', 'common.h', 'dwm.h', 'window.h'];

const bom = Buffer.from([0xEF, 0xBB, 0xBF]);

for (const f of files) {
    const fp = path.join(dir, f);
    if (!fs.existsSync(fp)) { console.log('SKIP:', f); continue; }
    const data = fs.readFileSync(fp);
    // ?????? BOM
    if (data[0] === 0xEF && data[1] === 0xBB && data[2] === 0xBF) {
        console.log('OK (already has BOM):', f);
        continue;
    }
    // ? BOM + ???
    fs.writeFileSync(fp, Buffer.concat([bom, data]));
    console.log('BOM added:', f);
}