import request from 'supertest';
import { server as httpServer, app } from '../server';

describe('Server', () => {
  beforeAll((done) => {
    // Start the server before tests
    if (!httpServer.listening) {
      httpServer.listen(0, 'localhost', () => {
        const address = httpServer.address();
        const port = typeof address === 'string' ? address : address?.port;
        console.log('Test server started on port', port);
        done();
      });
    } else {
      done();
    }
  });

  afterAll((done) => {
    // Close the server after tests are done
    if (httpServer.listening) {
      httpServer.close(done);
    } else {
      done();
    }
  });

  describe('GET /health', () => {
    it('should return 200 and server status', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('service', 'mediview-video-service');
      expect(response.body).toHaveProperty('environment');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});
