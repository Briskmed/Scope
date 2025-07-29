import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file in the root directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Validate required environment variables
const requiredEnvVars = ['GROQ_API_KEY'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Error: Missing required environment variable: ${envVar}`);
    console.error(`Please make sure you have a .env file in the root directory with ${envVar} set.`);
    process.exit(1);
  }
}

// Log environment status for debugging
console.log('✅ Environment variables loaded successfully');
console.log('Current working directory:', process.cwd());
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('GROQ_API_KEY present:', !!process.env.GROQ_API_KEY);

// Export validated environment variables
export const config = {
  port: process.env.PORT || '3000',
  groqApiKey: process.env.GROQ_API_KEY,
  nodeEnv: process.env.NODE_ENV || 'development',
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || '*',
};
