import "dotenv/config";
import app from './app.js';
import { startCronJobs } from './cron.js';

const PORT = Number(process.env.PORT) || 5000;

startCronJobs();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
