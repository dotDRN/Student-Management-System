import prisma from '../src/lib/prisma.js';

const classesToCreate = [
  { code: 'SHIKSHA_JR', name: 'Shiksha (jr)', ageMin: 3, ageMax: 4 },
  { code: 'SHIKSHA_SR', name: 'Shiksha (sr)', ageMin: 5, ageMax: 6 },
  { code: 'SANSKAR_1', name: 'Sanskar 1 (1-4)', ageMin: 7, ageMax: 10 },
  { code: 'SANSKAR_2', name: 'Sanskar 2 (4-6)', ageMin: 11, ageMax: 13 },
  { code: 'SWAYAM_1', name: 'Swayam 1 (7-10)', ageMin: 14, ageMax: 16 },
  { code: 'SWAYAM_2', name: 'Swayam 2 (10-12)', ageMin: 17, ageMax: 18 },
];

async function main() {
  console.log("Seeding classes...");
  for (const c of classesToCreate) {
    await prisma.program.upsert({
      where: { code: c.code },
      update: { name: c.name, ageMin: c.ageMin, ageMax: c.ageMax, isActive: true },
      create: { ...c, isActive: true },
    });
  }
  console.log("Classes seeded successfully.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
