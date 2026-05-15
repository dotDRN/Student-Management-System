import { Project, SyntaxKind } from 'ts-morph';

const project = new Project({
  tsConfigFilePath: 'tsconfig.json',
});

const serviceFiles = project.getSourceFiles('src/services/**/*.ts');

serviceFiles.forEach(file => {
  let fileChanged = false;

  // 2.2 Replace soft deletes
  const callExpressions = file.getDescendantsOfKind(SyntaxKind.CallExpression);
  callExpressions.forEach(callExpr => {
    const propertyAccess = callExpr.getExpressionIfKind(SyntaxKind.PropertyAccessExpression);
    if (!propertyAccess) return;

    const nameNode = propertyAccess.getNameNode();
    const methodName = nameNode.getText();

    if (methodName === 'delete' || methodName === 'deleteMany') {
      const objText = propertyAccess.getExpression().getText();
      if (objText.startsWith('prisma.') || objText.startsWith('tx.')) {
        nameNode.replaceWithText(methodName === 'delete' ? 'update' : 'updateMany');
        
        // Ensure data: { isActive: false } is set in the arguments
        const args = callExpr.getArguments();
        if (args.length > 0 && args[0].isKind(SyntaxKind.ObjectLiteralExpression)) {
            const objLiteral = args[0];
            const dataProp = objLiteral.getProperty('data');
            if (!dataProp) {
                objLiteral.insertPropertyAssignment(0, { name: 'data', initializer: '{ isActive: false }' });
            }
        }
        fileChanged = true;
      }
    }
  });

  if (fileChanged) {
    file.saveSync();
  }
});
console.log('Soft delete updates complete.');
