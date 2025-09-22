import { Connection, PublicKey } from '@solana/web3.js';
import { 
  deriveBondingCurvePDA, 
  deriveGlobalPDA, 
  fetchBondingCurveAccount, 
  fetchGlobalAccount,
  isPumpFunToken,
  getTokenMintFromLogs
} from './account.utils';

// Mock the external dependencies
jest.mock('@solana/web3.js', () => {
  const original = jest.requireActual('@solana/web3.js');
  return {
    ...original,
    Connection: jest.fn().mockImplementation(() => ({
      getAccountInfo: jest.fn().mockResolvedValue({
        data: Buffer.from([
          // Mock discriminator
          23, 183, 248, 55, 96, 216, 172, 96,
          // Mock virtualTokenReserves (u64)
          100, 0, 0, 0, 0, 0, 0, 0,
          // Mock virtualSolReserves (u64)
          200, 0, 0, 0, 0, 0, 0, 0,
          // Mock realTokenReserves (u64)
          50, 0, 0, 0, 0, 0, 0, 0,
          // Mock realSolReserves (u64)
          100, 0, 0, 0, 0, 0, 0, 0,
          // Mock tokenTotalSupply (u64)
          1000, 0, 0, 0, 0, 0, 0, 0,
          // Mock complete (bool)
          0
        ])
      })
    })),
    PublicKey: {
      ...original.PublicKey,
      findProgramAddressSync: jest.fn().mockReturnValue([new original.PublicKey('11111111111111111111111111111111'), 255])
    }
  };
});

describe('Account Utils', () => {
  describe('deriveBondingCurvePDA', () => {
    it('should derive a bonding curve PDA', () => {
      const mint = new PublicKey('11111111111111111111111111111111');
      const [pda, bump] = deriveBondingCurvePDA(mint);
      
      expect(pda).toBeDefined();
      expect(bump).toBe(255);
    });
  });

  describe('deriveGlobalPDA', () => {
    it('should derive a global PDA', () => {
      const [pda, bump] = deriveGlobalPDA();
      
      expect(pda).toBeDefined();
      expect(bump).toBe(255);
    });
  });

  describe('fetchBondingCurveAccount', () => {
    it('should fetch and parse a bonding curve account', async () => {
      const connection = new Connection('');
      const mint = new PublicKey('11111111111111111111111111111111');
      
      const bondingCurve = await fetchBondingCurveAccount(connection, mint);
      
      expect(bondingCurve).toBeDefined();
      expect(bondingCurve?.virtualTokenReserves).toBe(100n);
      expect(bondingCurve?.virtualSolReserves).toBe(200n);
      expect(bondingCurve?.realTokenReserves).toBe(50n);
      expect(bondingCurve?.realSolReserves).toBe(100n);
      expect(bondingCurve?.tokenTotalSupply).toBe(1000n);
      expect(bondingCurve?.complete).toBe(false);
    });

    it('should return null if account not found', async () => {
      const connection = new Connection('');
      jest.spyOn(connection, 'getAccountInfo').mockResolvedValueOnce(null);
      
      const mint = new PublicKey('11111111111111111111111111111111');
      const bondingCurve = await fetchBondingCurveAccount(connection, mint);
      
      expect(bondingCurve).toBeNull();
    });
  });

  describe('isPumpFunToken', () => {
    it('should return true for a valid Pump.fun token', async () => {
      const connection = new Connection('');
      const mint = new PublicKey('11111111111111111111111111111111');
      
      const result = await isPumpFunToken(connection, mint);
      expect(result).toBe(true);
    });

    it('should return false if bonding curve not found', async () => {
      const connection = new Connection('');
      jest.spyOn(connection, 'getAccountInfo').mockResolvedValueOnce(null);
      
      const mint = new PublicKey('11111111111111111111111111111111');
      const result = await isPumpFunToken(connection, mint);
      
      expect(result).toBe(false);
    });
  });

  describe('getTokenMintFromLogs', () => {
    it('should extract token mint from logs', () => {
      const logs = [
        'Program log: Create_pool 1000 TOKEN and 100 WSOL',
        'Program log: Transfer 1000 TOKEN from TokenAccountAddress to PoolAddress',
        'Program log: Transfer from 3XChw3Bj2fTND4zTQkNwNZPqGRVwBmGBqoMQQjFQDhzd to PoolAddress'
      ];
      
      const result = getTokenMintFromLogs(logs);
      expect(result?.toString()).toBe('3XChw3Bj2fTND4zTQkNwNZPqGRVwBmGBqoMQQjFQDhzd');
    });

    it('should return null if mint not found', () => {
      const logs = [
        'Program log: Some other operation'
      ];
      
      const result = getTokenMintFromLogs(logs);
      expect(result).toBeNull();
    });
  });
});
