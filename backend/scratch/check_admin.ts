import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const users = await prisma.user.findMany();

  console.log("Total users found:", users.length);
  for (const user of users) {
    const isSuperAdminDefault = await bcrypt.compare("SuperAdmin@123", user.passwordHash);
    const isStaffDefault = await bcrypt.compare("Staff@123", user.passwordHash);
    const isPassword123 = await bcrypt.compare("Password@123", user.passwordHash);
    
    console.log(`User: ${user.email} (${user.role})`);
    console.log(`  Hash: ${user.passwordHash}`);
    console.log(`  Matches "SuperAdmin@123":`, isSuperAdminDefault);
    console.log(`  Matches "Staff@123":`, isStaffDefault);
    console.log(`  Matches "Password@123":`, isPassword123);
  }

  // Generate a new hash for "Password@123"
  const newHash = await bcrypt.hash("Password@123", 10);
  console.log("\nGenerated new bcryptjs hash for 'Password@123':", newHash);
  const verifyNew = await bcrypt.compare("Password@123", newHash);
  console.log("Verified new hash:", verifyNew);
}

main().catch(console.error).finally(() => prisma.$disconnect());
