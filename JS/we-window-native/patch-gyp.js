const fs = require('fs');
const path = require('path');

const gypFile = path.join(
  'C:', 'Users', 'huoxi', 'Desktop', 'World Editor', 'JS',
  'we-window-native', 'node_modules', '@electron', 'rebuild',
  'node_modules', 'node-gyp', 'lib', 'find-visualstudio.js'
);

console.log('Patching:', gypFile);
let c = fs.readFileSync(gypFile, 'utf8');

// === Patch 1: getToolset fuzzy matching ===
// Replace the exact-match chain with a pkgMatch helper
const p1Old = `    if (process.arch === 'arm64' && info.packages.includes(pkgArm64)) {
      this.log.silly(\`- found \${vcToolsArm64}\`)
    } else if (info.packages.includes(pkgX64)) {
      if (process.arch === 'arm64') {
        this.addLog(\`- found \${vcToolsX64} on ARM64 platform. Expect less performance and/or link failure with ARM64 binary.\`)
      } else {
        this.log.silly(\`- found \${vcToolsX64}\`)
      }
    } else if (info.packages.includes(express)) {
      this.log.silly('- found Visual Studio Express (looking for toolset)')
    } else {
      return null
    }`;

const p1New = `    const pkgMatch = (patterns) => {
      if (!Array.isArray(info.packages)) return false;
      return patterns.some(p => info.packages.includes(p) || info.packages.some(x => x && x.includes(p)));
    };
    if (process.arch === 'arm64' && pkgMatch([pkgArm64, 'VC.Tools.ARM64'])) {
      this.log.silly(\`- found \${vcToolsArm64}\`)
    } else if (pkgMatch([pkgX64, 'VC.Tools.x86.x64', 'Tools.HostX64.TargetX64'])) {
      if (process.arch === 'arm64') {
        this.addLog(\`- found \${vcToolsX64} on ARM64 platform. Expect less performance and/or link failure with ARM64 binary.\`)
      } else {
        this.log.silly(\`- found \${vcToolsX64} (fuzzy match)\`)
      }
    } else if (pkgMatch([express])) {
      this.log.silly('- found Visual Studio Express (looking for toolset)')
    } else {
      return null
    }`;

if (c.includes(p1Old)) {
  c = c.replace(p1Old, p1New);
  console.log('✅ Patch 1 OK (getToolset fuzzy)');
} else {
  console.log('❌ Patch 1 FAIL - searching...');
  const idx = c.indexOf("info.packages.includes(pkgArm64)");
  if (idx >= 0) {
    console.log('  Found at offset', idx);
    console.log('  Context:', c.substring(idx - 20, idx + 100));
  }
}

// === Patch 2: getMSBuild fuzzy ===
const p2Old = `    if (info.packages.indexOf(pkg) !== -1) {
      this.log.silly('- found VC.MSBuild.Base')`;

const p2New = `    if (info.packages.indexOf(pkg) !== -1 || (Array.isArray(info.packages) && info.packages.some(p => p && p.includes('MSBuild')))) {
      this.log.silly('- found VC.MSBuild.Base (or versioned package)')`;

if (c.includes(p2Old)) {
  c = c.replace(p2Old, p2New);
  console.log('✅ Patch 2 OK (getMSBuild fuzzy)');
} else {
  console.log('❌ Patch 2 FAIL');
}

// === Patch 3: getSDK fuzzy ===
const p3Old = `      if (!pkg.startsWith(win10SDKPrefix) && !pkg.startsWith(win11SDKPrefix)) {
        return
      }`;

const p3New = `      if (!pkg.startsWith(win10SDKPrefix) && !pkg.startsWith(win11SDKPrefix) && !pkg.startsWith('Win11SDK_')) {
        return
      }`;

if (c.includes(p3Old)) {
  c = c.replace(p3Old, p3New);
  console.log('✅ Patch 3 OK (getSDK fuzzy for Win11SDK_ prefix)');
} else {
  console.log('⚠️  Patch 3 skipped (SDK patch not needed or already applied)');
}

// === Patch 4: getToolset - VS 2026 should return v143, not v145 ===
// (VS 2026 still ships v143 toolset in MSBuild v170)
const p4Old = `    } else if (versionYear === 2026) {
      return 'v145'
    }`;

const p4New = `    } else if (versionYear === 2026) {
      // VS 2026 still uses v143 toolset (MSBuild v170 targets only v143)
      return 'v143'
    }`;

if (c.includes(p4Old)) {
  c = c.replace(p4Old, p4New);
  console.log('✅ Patch 4 OK (VS 2026 toolset v145 -> v143)');
} else {
  console.log('⚠️  Patch 4 skipped (VS 2026 toolset patch not needed)');
}

fs.writeFileSync(gypFile, c, 'utf8');
console.log('\n✅ All patches written. Now verify syntax:');

// Check syntax by trying to parse
try {
  // quick node syntax check via exec
  const { execSync } = require('child_process');
  const r = execSync(`node -c "${gypFile}" 2>&1`, { encoding: 'utf8' });
  console.log('✅ Syntax OK');
} catch(e) {
  console.log('❌ Syntax error:', e.message);
}
