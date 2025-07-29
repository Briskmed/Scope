import { server, app } from './server';

// This file serves as the entry point for the application
// The actual server logic is imported from server.ts

const PORT = process.env.PORT || 3000;

// Start the server if this file is run directly
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🔄 WebSocket available at ws://localhost:${PORT}/socket.io/`);
    console.log(`📊 Health check at http://localhost:${PORT}/health`);
  });
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
