import "dotenv/config";
import { loginUser } from "../src/services/auth.service.js";
import prisma from "../src/lib/prisma.js";

async function main() {
  try {
    console.log("Attempting service login for super_admin@sparsha.org...");
    const result = await loginUser({
      email: "super_admin@sparsha.org",
      password: "SuperAdmin@123"
    });
    console.log("Login succeeded!");
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error("Login failed with error:");
    console.error("Message:", err.message);
    console.error("Status Code:", err.statusCode);
    console.error("Stack:", err.stack);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
