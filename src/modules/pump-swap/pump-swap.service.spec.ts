import { Test, TestingModule } from '@nestjs/testing';
import { PumpSwapService } from './pump-swap.service';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

// Mock the account utils
jest.mock('../../utils/account.utils', () => ({
  deriveBondingCurvePDA: jest.fn().mockReturnValue([new (jest.requireActual('@solana/web3.js').PublicKey)('11111111111111111111111111111111'), 255]),
  deriveGlobalPDA: jest.fn().mockReturnValue([new (jest.requireActual('@solana/web3.js').PublicKey)('11111111111111111111111111111111'), 255]),
  fetchBondingCurveAccount: jest.fn().mockResolvedValue({
    virtualTokenReserves: BigInt(100),
    virtualSolReserves: BigInt(200),
    realTokenReserves: BigInt(50),
    realSolReserves: BigInt(100),
    tokenTotalSupply: BigInt(1000),
    complete: true // Set to complete for PumpSwap tests
  }),
  fetchGlobalAccount: jest.fn().mockResolvedValue({
    initialized: true,
    authority: new (jest.requireActual('@solana/web3.js').PublicKey)('11111111111111111111111111111111'),
    feeRecipient: new (jest.requireActual('@solana/web3.js').PublicKey)('11111111111111111111111111111111'),
    initialVirtualTokenReserves: BigInt(100),
    initialVirtualSolReserves: BigInt(200),
    initialRealTokenReserves: BigInt(50),
    tokenTotalSupply: BigInt(1000),
    feeBasisPoints: BigInt(30)
  }),
  isPumpFunToken: jest.fn().mockResolvedValue(true)
}));

// Mock the token utils
jest.mock('../../utils/token.utils', () => ({
  getTokenBalance: jest.fn().mockResolvedValue(1000),
  getSolBalance: jest.fn().mockResolvedValue(5),
  getTokenInfo: jest.fn().mockResolvedValue({
    mint: '11111111111111111111111111111111',
    name: 'Test Token',
    symbol: 'TEST',
    decimals: 9,
    supply: BigInt(1000000),
    price: 0.1,
    marketCap: 100000,
    volume24h: 50000,
    bondingCurveComplete: true,
    migratedToRaydium: true
  }),
  getTokenMarketData: jest.fn().mockResolvedValue({
    price: 0.1,
    priceChange24h: 5,
    volume24h: 50000,
    marketCap: 100000,
    liquiditySol: 100
  })
}));

// Mock the transaction utils
jest.mock('../../utils/transaction.utils', () => ({
  createComputeBudgetInstruction: jest.fn().mockReturnValue({}),
  createJitoTipInstruction: jest.fn().mockReturnValue({}),
  signAndSendTransaction: jest.fn().mockResolvedValue('mock-transaction-signature'),
  confirmTransaction: jest.fn().mockResolvedValue(true),
  isBondingCurveComplete: jest.fn().mockReturnValue(true),
  isPumpSwapPoolCreation: jest.fn().mockReturnValue(true)
}));

// Mock the external dependencies
jest.mock('@solana/web3.js', () => {
  const original = jest.requireActual('@solana/web3.js');
  
  // Create a mock Keypair class
  class MockKeypair {
    publicKey = new original.PublicKey('11111111111111111111111111111111');
    secretKey = new Uint8Array(32);
    
    sign(transaction) {
      return transaction;
    }
  }
  
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
          1
        ]),
        executable: false,
        lamports: 1000000,
        owner: new original.PublicKey('11111111111111111111111111111111'),
        rentEpoch: 0
      }),
      getBalance: jest.fn().mockResolvedValue(5000000000), // 5 SOL
      getLatestBlockhash: jest.fn().mockResolvedValue({ blockhash: 'mock-blockhash' }),
      sendRawTransaction: jest.fn().mockResolvedValue('mock-transaction-signature'),
      getSignatureStatus: jest.fn().mockResolvedValue({
        value: { err: null, confirmationStatus: 'confirmed' }
      })
    })),
    PublicKey: jest.fn().mockImplementation((key) => ({
      toString: () => key,
      toBuffer: () => Buffer.from(key),
      equals: (other) => key === other.toString()
    })),
    Keypair: MockKeypair,
    fromSecretKey: jest.fn().mockReturnValue(new MockKeypair()),
    generate: jest.fn().mockReturnValue(new MockKeypair()),
    SystemProgram: {
      transfer: jest.fn().mockReturnValue({})
    },
    Transaction: jest.fn().mockImplementation(() => ({
      add: jest.fn(),
      recentBlockhash: '',
      feePayer: null,
      sign: jest.fn(),
      partialSign: jest.fn(),
      signatures: [],
      serialize: jest.fn().mockReturnValue(new Uint8Array())
    })),
    TransactionInstruction: jest.fn().mockImplementation(() => ({})),
    ComputeBudgetProgram: {
      setComputeUnitPrice: jest.fn().mockReturnValue({})
    }
  };
});

jest.mock('@solana/spl-token', () => {
  const { PublicKey } = jest.requireActual('@solana/web3.js');
  return {
    getAssociatedTokenAddress: jest.fn().mockResolvedValue(new PublicKey('11111111111111111111111111111111'))
  };
});

describe('PumpSwapService', () => {
  let service: PumpSwapService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: PumpSwapService,
          useFactory: () => {
            return new PumpSwapService('https://mock-rpc-url.com');
          },
        },
      ],
    }).compile();

    service = module.get<PumpSwapService>(PumpSwapService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('hasPool', () => {
    it('should return true for a token with a PumpSwap pool', async () => {
      const result = await service.hasPool('TokenMint');
      expect(result).toBe(true);
    });
  });

  describe('verifyMigration', () => {
    it('should verify a valid migration', () => {
      const logs = [
        'Program log: Create_pool 1000 TOKEN and 100 WSOL',
        'Program log: Instruction: Withdraw',
        'Program log: Bonding curve complete'
      ];
      
      // Mock the isPumpSwapPoolCreation function to return true for valid migration
      const { isPumpSwapPoolCreation } = require('../../utils/transaction.utils');
      isPumpSwapPoolCreation.mockReturnValueOnce(true);
      
      const result = service.verifyMigration(logs);
      expect(result).toBe(true);
    });

    it('should reject an invalid migration', () => {
      const logs = [
        'Program log: Some other operation'
      ];
      
      // Mock the isPumpSwapPoolCreation function to return false for invalid migration
      const { isPumpSwapPoolCreation } = require('../../utils/transaction.utils');
      isPumpSwapPoolCreation.mockReturnValueOnce(false);
      
      const result = service.verifyMigration(logs);
      expect(result).toBe(false);
    });
  });

  describe('buyToken', () => {
    it('should successfully buy tokens', async () => {
      // Create a mock wallet provider
      const mockWalletProvider = {
        getPublicKey: jest.fn().mockResolvedValue(new PublicKey('11111111111111111111111111111111')),
        signTransaction: jest.fn().mockImplementation(tx => tx),
        signAllTransactions: jest.fn().mockImplementation(txs => txs),
        signMessage: jest.fn().mockImplementation(msg => msg)
      };
      
      const result = await service.buyToken(
        mockWalletProvider,
        'TokenMint',
        1, // 1 SOL
        { slippageBps: 100 }
      );
      
      expect(result.success).toBe(true);
      expect(result.txId).toBe('mock-transaction-signature');
    });

    it('should fail if wallet has insufficient SOL', async () => {
      // Create a mock wallet provider
      const mockWalletProvider = {
        getPublicKey: jest.fn().mockResolvedValue(new PublicKey('11111111111111111111111111111111')),
        signTransaction: jest.fn().mockImplementation(tx => tx),
        signAllTransactions: jest.fn().mockImplementation(txs => txs),
        signMessage: jest.fn().mockImplementation(msg => msg)
      };
      
      // Mock the getSolBalance function to return a low balance
      const { getSolBalance } = require('../../utils/token.utils');
      getSolBalance.mockResolvedValueOnce(0.0001); // 0.0001 SOL
      
      const result = await service.buyToken(
        mockWalletProvider,
        'TokenMint',
        1, // 1 SOL
        { slippageBps: 100 }
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient SOL balance');
    });
  });

  describe('sellToken', () => {
    it('should successfully sell tokens', async () => {
      // Create a mock wallet provider
      const mockWalletProvider = {
        getPublicKey: jest.fn().mockResolvedValue(new PublicKey('11111111111111111111111111111111')),
        signTransaction: jest.fn().mockImplementation(tx => tx),
        signAllTransactions: jest.fn().mockImplementation(txs => txs),
        signMessage: jest.fn().mockImplementation(msg => msg)
      };
      
      const result = await service.sellToken(
        mockWalletProvider,
        'TokenMint',
        50, // 50% of tokens
        { slippageBps: 100 }
      );
      
      expect(result.success).toBe(true);
      expect(result.txId).toBe('mock-transaction-signature');
    });

    it('should fail with invalid percentage', async () => {
      // Create a mock wallet provider
      const mockWalletProvider = {
        getPublicKey: jest.fn().mockResolvedValue(new PublicKey('11111111111111111111111111111111')),
        signTransaction: jest.fn().mockImplementation(tx => tx),
        signAllTransactions: jest.fn().mockImplementation(txs => txs),
        signMessage: jest.fn().mockImplementation(msg => msg)
      };
      
      const result = await service.sellToken(
        mockWalletProvider,
        'TokenMint',
        0, // 0% (invalid)
        { slippageBps: 100 }
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Percentage must be between');
    });
  });

  describe('monitoring', () => {
    it('should start and stop monitoring for new tokens', () => {
      const callback = jest.fn();
      const subscriptionId = service.monitorNewTokens(callback);
      
      expect(subscriptionId).toBeDefined();
      
      service.stopMonitoring(subscriptionId);
      // Just checking that it doesn't throw an error
      expect(true).toBe(true);
    });

    it('should start and stop monitoring for migrations', () => {
      const callback = jest.fn();
      const subscriptionId = service.monitorMigrations(callback);
      
      expect(subscriptionId).toBeDefined();
      
      service.stopMigrationMonitoring(subscriptionId);
      // Just checking that it doesn't throw an error
      expect(true).toBe(true);
    });
  });
});
