const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Fonction pour échapper les apostrophes dans les fichiers React
function fixUnescapedEntities(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Remplacer les apostrophes dans les strings JSX par &apos;
    const jsxStringRegex = />(.*?'.*?)</g;
    content = content.replace(jsxStringRegex, (match) => {
      return match.replace(/'/g, '&apos;');
    });
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Apostrophes corrigées dans ${filePath}`);
  } catch (error) {
    console.error(`❌ Erreur lors de la correction des apostrophes dans ${filePath}:`, error);
  }
}

// Fonction pour appliquer automatiquement les corrections ESLint
function runEslintFix() {
  try {
    console.log('🔧 Application des corrections automatiques ESLint...');
    execSync('npx eslint --fix "app/**/*.{ts,tsx}" "components/**/*.{ts,tsx}"', { stdio: 'inherit' });
    console.log('✅ Corrections ESLint appliquées avec succès');
  } catch (error) {
    console.error('❌ Erreur lors de l\'application des corrections ESLint:', error);
  }
}

// Trouver tous les fichiers .tsx et corriger les apostrophes
function fixAllUnescapedEntities() {
  const rootDir = '.';
  
  const getAllFiles = (dir, ext) => {
    let results = [];
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory() && !filePath.includes('node_modules') && !filePath.includes('.next')) {
        results = results.concat(getAllFiles(filePath, ext));
      } else if (path.extname(file) === ext) {
        results.push(filePath);
      }
    }
    
    return results;
  };
  
  const tsxFiles = getAllFiles(rootDir, '.tsx');
  
  console.log(`🔍 Correction des apostrophes non échappées dans ${tsxFiles.length} fichiers...`);
  
  for (const file of tsxFiles) {
    fixUnescapedEntities(file);
  }
}

// Exécution
console.log('🚀 Début des corrections automatiques...');
runEslintFix();
fixAllUnescapedEntities();
console.log('✨ Corrections terminées'); 