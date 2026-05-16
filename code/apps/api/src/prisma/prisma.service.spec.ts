import { Test } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();
    service = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should connect on module init', async () => {
    const spy = jest.spyOn(service, '$connect').mockResolvedValue();
    await service.onModuleInit();
    expect(spy).toHaveBeenCalled();
  });

  it('should disconnect on module destroy', async () => {
    const spy = jest.spyOn(service, '$disconnect').mockResolvedValue();
    await service.onModuleDestroy();
    expect(spy).toHaveBeenCalled();
  });

  describe('withTenantContext', () => {
    it('executes fn inside a transaction with set_config', async () => {
      const mockTx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
      };
      jest.spyOn(service, '$transaction').mockImplementation((fn: any) => fn(mockTx));

      const result = await service.withTenantContext('org_1', async (tx) => {
        return 'result';
      });

      expect(service.$transaction).toHaveBeenCalled();
      expect(mockTx.$executeRaw).toHaveBeenCalled();
      expect(result).toBe('result');
    });
  });
});
