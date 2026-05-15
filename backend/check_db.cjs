require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

prisma.user.findMany().then(users => {
  console.log('Users in DB:');
  console.table(users.map(u => ({ id: u.id, email: u.email, role: u.role, password: u.password })));
}).catch(console.error).finally(() => prisma.$disconnect());
