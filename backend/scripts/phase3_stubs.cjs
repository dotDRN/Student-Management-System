const fs = require('fs');
const path = require('path');

const resources = [
  'student', 'attendance', 'activity', 'exam', 'form', 
  'skill', 'message', 'equipment', 'announcement', 'auth', 'user'
];

const basePath = path.join(__dirname, '../src');

const ensureFile = (filepath, template) => {
  if (!fs.existsSync(filepath)) {
    fs.writeFileSync(filepath, template);
    console.log(`Created: ${filepath}`);
  }
};

resources.forEach(r => {
  // controllers
  ensureFile(
    path.join(basePath, 'controllers', `${r}.controller.ts`),
    `// TODO: Thin controller for ${r}\n`
  );

  // services
  ensureFile(
    path.join(basePath, 'services', `${r}.service.ts`),
    `// TODO: Fat service logic for ${r}\n`
  );

  // routes
  ensureFile(
    path.join(basePath, 'routes', `${r}.routes.ts`),
    `// TODO: Express router for ${r}\n`
  );

  // validators
  ensureFile(
    path.join(basePath, 'validators', `${r}.schema.ts`),
    `import { z } from 'zod';\n\n// TODO: Add Zod schemas for ${r}\n`
  );
});

console.log('Folder structure standardized and missing files stubbed out.');
