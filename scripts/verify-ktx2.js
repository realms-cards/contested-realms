#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// KTX2 file signature
const KTX2_SIGNATURE = Buffer.from([
  0xAB, 0x4B, 0x54, 0x58, 0x20, 0x32, 0x30, 0xBB, 0x0D, 0x0A, 0x1A, 0x0A
]);

function readUint32(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

function verifyKTX2File(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    
    // Check signature
    const signature = buffer.slice(0, 12);
    if (!signature.equals(KTX2_SIGNATURE)) {
      return { valid: false, error: 'Invalid KTX2 signature' };
    }

    // Read header
    const pixelWidth = readUint32(buffer, 20);
    const pixelHeight = readUint32(buffer, 24);
    
    // Check if dimensions are multiples of 4
    const widthMultipleOf4 = pixelWidth % 4 === 0;
    const heightMultipleOf4 = pixelHeight % 4 === 0;
    
    return {
      valid: widthMultipleOf4 && heightMultipleOf4,
      width: pixelWidth,
      height: pixelHeight,
      widthMultipleOf4,
      heightMultipleOf4
    };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

function findKTX2Files(dir) {
  const ktx2Files = [];
  
  function walk(currentDir) {
    const files = fs.readdirSync(currentDir);
    
    for (const file of files) {
      const fullPath = path.join(currentDir, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
        walk(fullPath);
      } else if (file.endsWith('.ktx2')) {
        ktx2Files.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return ktx2Files;
}

function main() {
  const dataKtx2Dir = path.join(__dirname, '..', 'data-ktx2');
  const publicKtx2Dir = path.join(__dirname, '..', 'public', 'ktx2');
  
  console.log('🔍 Searching for KTX2 files...\n');
  
  const ktx2Files = [];
  
  if (fs.existsSync(dataKtx2Dir)) {
    ktx2Files.push(...findKTX2Files(dataKtx2Dir));
  }
  
  if (fs.existsSync(publicKtx2Dir)) {
    ktx2Files.push(...findKTX2Files(publicKtx2Dir));
  }
  
  if (ktx2Files.length === 0) {
    console.log('No KTX2 files found.');
    return;
  }
  
  console.log(`Found ${ktx2Files.length} KTX2 files\n`);
  
  const issues = [];
  let validCount = 0;
  
  for (const file of ktx2Files) {
    const relativePath = path.relative(path.join(__dirname, '..'), file);
    const result = verifyKTX2File(file);
    
    if (result.valid) {
      validCount++;
      console.log(`✅ ${relativePath}`);
      console.log(`   Dimensions: ${result.width}x${result.height}`);
    } else if (result.error) {
      console.log(`❌ ${relativePath}`);
      console.log(`   Error: ${result.error}`);
      issues.push({ file: relativePath, error: result.error });
    } else {
      console.log(`⚠️  ${relativePath}`);
      console.log(`   Dimensions: ${result.width}x${result.height}`);
      if (!result.widthMultipleOf4) {
        console.log(`   ❌ Width (${result.width}) is not a multiple of 4`);
      }
      if (!result.heightMultipleOf4) {
        console.log(`   ❌ Height (${result.height}) is not a multiple of 4`);
      }
      issues.push({
        file: relativePath,
        width: result.width,
        height: result.height,
        widthMultipleOf4: result.widthMultipleOf4,
        heightMultipleOf4: result.heightMultipleOf4
      });
    }
    console.log('');
  }
  
  console.log('\n📊 Summary:');
  console.log(`   Valid files: ${validCount}/${ktx2Files.length}`);
  console.log(`   Files with issues: ${issues.length}`);
  
  if (issues.length > 0) {
    console.log('\n⚠️  Files needing attention:');
    for (const issue of issues) {
      if (issue.error) {
        console.log(`   - ${issue.file}: ${issue.error}`);
      } else {
        const suggestedWidth = Math.ceil(issue.width / 4) * 4;
        const suggestedHeight = Math.ceil(issue.height / 4) * 4;
        console.log(`   - ${issue.file}: ${issue.width}x${issue.height} → Suggested: ${suggestedWidth}x${suggestedHeight}`);
      }
    }
  }
}

main();