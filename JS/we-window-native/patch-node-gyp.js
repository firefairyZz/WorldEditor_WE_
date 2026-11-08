const fs = require('fs');
const path = require('path');

const file = path.join('C:', 'WE', 'JS', 'we-window-native', 'node_modules', '@electron', 'rebuild', 'node_modules', 'node-gyp', 'lib', 'find-visualstudio.js');
let content = fs.readFileSync(file, 'utf8');

// === Patch 1: getToolset - add fuzzy matching for versioned VS 2026 packages ===
const oldToolsetIf =     if (process.arch === 'arm64' && info.packages.includes(pkgArm64)) {
      this.log.silly(\- found \\)
    } else if (info.packages.includes(pkgX64)) {
      if (process.arch === 'arm64') {
        this.addLog(\- found \ on ARM64 platform. Expect less performance and/or link failure with ARM64 binary.\)
      } else {
        this.log.silly(\- found \\)
      }
    } else if (info.packages.includes(express)) {
      this.log.silly('- found Visual Studio Express (looking for toolset)')
    } else {
      return null
    };

const newToolsetIf =     const pkgMatch = (patterns) => {
      if (!Array.isArray(info.packages)) return false;
      return patterns.some(p => info.packages.includes(p) || info.packages.some(x => x && x.includes(p)));
    };
    if (process.arch === 'arm64' && pkgMatch([pkgArm64, 'VC.Tools.ARM64'])) {
      this.log.silly(\- found \\)
    } else if (pkgMatch([pkgX64, 'VC.Tools.x86.x64', 'Tools.HostX64.TargetX64'])) {
      if (process.arch === 'arm64') {
        this.addLog(\- found \ on ARM64 platform. Expect less performance and/or link failure with ARM64 binary.\)
      } else {
        this.log.silly(\- found \ (fuzzy match)\)
      }
    } else if (pkgMatch([express])) {
      this.log.silly('- found Visual Studio Express (looking for toolset)')
    } else {
      return null
    };

if (content.includes(oldToolsetIf)) {
  content = content.replace(oldToolsetIf, newToolsetIf);
  console.log('? Patch 1 applied: getToolset fuzzy matching');
} else {
  console.log('? Patch 1 FAILED: pattern not found');
  console.log('Searching nearby...');
  const idx = content.indexOf('VC.Tools.ARM64');
  if (idx >= 0) console.log('Found VC.Tools.ARM64 at', idx);
}

// === Patch 2: getMSBuild - also check versioned packages ===
const oldMSBuild =     if (info.packages.indexOf(pkg) !== -1) {
      this.log.silly('- found VC.MSBuild.Base');

const newMSBuild =     if (info.packages.indexOf(pkg) !== -1 || (Array.isArray(info.packages) && info.packages.some(p => p && p.includes('MSBuild')))) {
      this.log.silly('- found VC.MSBuild.Base (or versioned package)');

if (content.includes(oldMSBuild)) {
  content = content.replace(oldMSBuild, newMSBuild);
  console.log('? Patch 2 applied: getMSBuild fuzzy matching');
} else {
  console.log('? Patch 2 FAILED');
}

fs.writeFileSync(file, content, 'utf8');
console.log('? Patched file written');

// Verify syntax
try {
  new Function(content); // won't work for module syntax, just check basic
  console.log('Basic check passed');
} catch(e) {
  // ignore, syntax check needs node -c
}