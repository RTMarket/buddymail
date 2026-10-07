/**
 * 固定从 backend/.env 加载，不依赖进程 cwd。
 * PM2 若从其它目录启动，默认 dotenv 会找不到 .env，导致 OPENAI_API_KEY 等为空。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "..", ".env");
const result = config({ path: envPath });
if (result.error) {
  console.warn(`[loadEnv] 未读取到 ${envPath}: ${result.error.message}`);
}
