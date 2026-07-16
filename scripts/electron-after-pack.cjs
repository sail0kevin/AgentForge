const fs = require('fs');
const path = require('path');

function findRuntimeLinks(root) {
  const links = [];
  if (!fs.existsSync(root)) return links;

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    const stat = fs.lstatSync(entryPath);
    if (stat.isSymbolicLink()) {
      links.push(entryPath);
    } else if (stat.isDirectory()) {
      links.push(...findRuntimeLinks(entryPath));
    }
  }
  return links;
}

exports.default = async function materializeNextRuntimeLinks(context) {
  const sourceRoot = path.join(context.packager.projectDir, '.next', 'node_modules');
  const links = findRuntimeLinks(sourceRoot);
  if (links.length === 0) return;

  const resourcesDir = context.packager.getResourcesDir(context.appOutDir);
  const destinationRoot = path.join(resourcesDir, 'app', '.next', 'node_modules');

  for (const linkPath of links) {
    const relativePath = path.relative(sourceRoot, linkPath);
    const destinationPath = path.join(destinationRoot, relativePath);
    const targetPath = fs.realpathSync(linkPath);
    fs.rmSync(destinationPath, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.cpSync(targetPath, destinationPath, { recursive: true, dereference: true, force: true });
    console.log(`  • materialized Next runtime dependency  module=${relativePath}`);
  }

  const prismaClientSource = path.join(context.packager.projectDir, 'node_modules', '.prisma');
  const prismaClientDestination = path.join(resourcesDir, 'app', 'node_modules', '.prisma');
  if (!fs.existsSync(prismaClientSource)) {
    throw new Error('Generated Prisma client is missing; run prisma generate before packaging.');
  }
  fs.rmSync(prismaClientDestination, { recursive: true, force: true });
  fs.cpSync(prismaClientSource, prismaClientDestination, { recursive: true, dereference: true, force: true });
  console.log('  • copied generated Prisma client  module=node_modules\\.prisma');
};
