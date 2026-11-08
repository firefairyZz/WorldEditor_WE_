try {
    const w = require('./prebuilds/win32-x64/we_window.node');
    console.log('? Loaded!');
    console.log('Exported functions:', Object.keys(w));
    console.log('CORNER:', w.CORNER);
    console.log('MATERIAL:', w.MATERIAL);
    console.log('STYLE:', w.STYLE);
    console.log('isWin11():', w.isWin11 ? w.isWin11() : 'N/A');
    console.log('getBuild():', w.getBuild ? w.getBuild() : 'N/A');
} catch(e) {
    console.log('? Load failed:', e.message);
}