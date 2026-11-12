const request = require('supertest');
const app = require('../src/app');

describe('GET /api/v1/health', () => {
  it('returns API status, environment, and timestamp', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        status: 'ok',
        environment: expect.any(String),
        timestamp: expect.any(String),
      },
    });
  });

  it('uses the consistent not-found response for unknown routes', async () => {
    const response = await request(app).get('/api/v1/unknown');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false, errors: [] });
  });
});
