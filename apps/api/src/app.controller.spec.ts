import { describe, it, expect } from 'vitest';
import { AppController } from './app.controller';

describe('AppController', () => {
  const controller = new AppController();

  it('returns health status', () => {
    const result = controller.health();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('ptaas-api');
    expect(result.timestamp).toBeDefined();
  });
});
