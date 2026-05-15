import prisma from './src/lib/prisma.js';
async function main() {
  const centers = await prisma.center.findMany();
  console.log("Centers:", centers);
  const programs = await prisma.program.findMany();
  console.log("Programs:", programs);
}
main().catch(console.error).finally(() => prisma.$disconnect());
