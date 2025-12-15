import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  ONLYPUMP_PRESALE_IDL,
  ONLYPUMP_PRESALE_PROGRAM_ID,
} from '../common/constants';
import { SupabaseService } from './supabase.service';

export interface PresalePdas {
  platform: PublicKey;
  presale: PublicKey;
  tokenVault: PublicKey;
  tokenVaultAuthority: PublicKey;
  publicSolVault: PublicKey;
  ecosystemVault: PublicKey;
  ecosystemVaultAuthority: PublicKey;
  userPosition?: PublicKey;
  whitelist?: PublicKey;
}

@Injectable()
export class PresaleService {
  private readonly logger = new Logger(PresaleService.name);
  private readonly programId: PublicKey;
  private readonly program: anchor.Program;
  private readonly adminKeypair: Keypair;

  constructor(
    private readonly connection: Connection,
    private readonly config: ConfigService,
    private readonly supabaseService: SupabaseService,
  ) {
    const programIdStr =
      this.config.get<string>('ONLYPUMP_PRESALE_PROGRAM_ID') ??
      ONLYPUMP_PRESALE_PROGRAM_ID.toBase58();
    this.programId = new PublicKey(programIdStr);

    this.adminKeypair = this.loadAdminKeypair();
    const wallet = {
      publicKey: this.adminKeypair.publicKey,
      signTransaction: async (tx: Transaction) => {
        tx.partialSign(this.adminKeypair);
        return tx;
      },
      signAllTransactions: async (txs: Transaction[]) => {
        txs.forEach((tx) => tx.partialSign(this.adminKeypair));
        return txs;
      },
    };

    const provider = new anchor.AnchorProvider(this.connection, wallet as any, {
      commitment: 'confirmed',
    });

    // In Anchor 0.32.1+, the Program constructor signature changed to (idl, provider, coder?, getCustomResolver?)
    // The program ID is read from idl.address, not passed as a parameter
    this.program = new anchor.Program(
      ONLYPUMP_PRESALE_IDL as anchor.Idl,
      provider,
    );
  }

  // ========= PDA Helpers =========

  getPresalePdas(mint: PublicKey, user?: PublicKey): PresalePdas {
    const [platform] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      this.programId,
    );

    const [presale] = PublicKey.findProgramAddressSync(
      [Buffer.from('presale'), mint.toBuffer()],
      this.programId,
    );

    const [tokenVault] = PublicKey.findProgramAddressSync(
      [Buffer.from('token_vault'), presale.toBuffer()],
      this.programId,
    );

    const tokenVaultAuthority = tokenVault;

    const [publicSolVault] = PublicKey.findProgramAddressSync(
      [Buffer.from('public_sol_vault'), presale.toBuffer()],
      this.programId,
    );

    const [ecosystemVault] = PublicKey.findProgramAddressSync(
      [Buffer.from('ecosystem_vault'), presale.toBuffer()],
      this.programId,
    );

    const ecosystemVaultAuthority = ecosystemVault;

    let userPosition: PublicKey | undefined;
    let whitelist: PublicKey | undefined;

    if (user) {
      [userPosition] = PublicKey.findProgramAddressSync(
        [Buffer.from('position'), presale.toBuffer(), user.toBuffer()],
        this.programId,
      );

      [whitelist] = PublicKey.findProgramAddressSync(
        [Buffer.from('whitelist'), presale.toBuffer(), user.toBuffer()],
        this.programId,
      );
    }

    return {
      platform,
      presale,
      tokenVault,
      tokenVaultAuthority,
      publicSolVault,
      ecosystemVault,
      ecosystemVaultAuthority,
      userPosition,
      whitelist,
    };
  }

  // ========= Read Methods =========

  async getPlatformConfig() {
    const { platform } = this.getPresalePdas(this.programId); // mint not used for platform PDA
    // Account names come from the IDL; `as any` keeps typing simple here.
    return (this.program.account as any).platformConfig.fetch(platform);
  }

  async getPresaleByMint(mint: string) {
    try {
      const mintPk = new PublicKey(mint);
      const { presale, publicSolVault } = this.getPresalePdas(mintPk);
      const presaleAccount = await (this.program.account as any).presale.fetch(presale);
      
      // Get the SOL vault balance
      const vaultBalance = await this.connection.getBalance(publicSolVault);
      
      return {
        address: presale.toBase58(),
        publicSolVault: publicSolVault.toBase58(),
        vaultBalance,
        ...presaleAccount,
      };
    } catch (error: any) {
      // Presale doesn't exist
      if (error.message?.includes('Account does not exist')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Compute migration and public presale pricing from VIP cap + token allocations.
   *
   * vipCapSol: SOL raised in VIP to seed LP (e.g. 85).
   * lpTokenAmount: tokens seeded into LP at migration (e.g. 200_000_000).
   * publicTokenAmount: tokens sold in public presale (e.g. 400_000_000).
   * publicPriceMultiple: multiplier over migration price for public (>= 1.0).
   */
  computePublicPricing(args: {
    vipCapSol: number;
    lpTokenAmount: number;
    publicTokenAmount: number;
    publicPriceMultiple?: number;
  }) {
    const { vipCapSol, lpTokenAmount, publicTokenAmount } = args;
    const multiple = args.publicPriceMultiple && args.publicPriceMultiple > 0
      ? args.publicPriceMultiple
      : 1.0;

    const migrationPriceSolPerToken = vipCapSol / lpTokenAmount;
    const migrationPriceLamportsPerToken = Math.round(
      migrationPriceSolPerToken * 1e9,
    );

    const publicPriceSolPerToken = migrationPriceSolPerToken * multiple;
    const publicPriceLamportsPerToken = Math.round(
      publicPriceSolPerToken * 1e9,
    );

    const publicHardCapSol = publicTokenAmount * publicPriceSolPerToken;
    const publicHardCapLamports = Math.round(publicHardCapSol * 1e9);

    return {
      migrationPriceSolPerToken,
      migrationPriceLamportsPerToken,
      publicPriceSolPerToken,
      publicPriceLamportsPerToken,
      publicHardCapSol,
      publicHardCapLamports,
    };
  }

  async getPresale(mintStr: string) {
    const mint = new PublicKey(mintStr);
    const { presale } = this.getPresalePdas(mint);
    return (this.program.account as any).presale.fetch(presale);
  }

  async getUserPosition(mintStr: string, userStr: string) {
    const mint = new PublicKey(mintStr);
    const user = new PublicKey(userStr);
    const { userPosition } = this.getPresalePdas(mint, user);
    if (!userPosition) return null;
    try {
      return await (this.program.account as any).userPosition.fetch(userPosition);
    } catch {
      return null;
    }
  }

  async getWhitelistEntry(mintStr: string, userStr: string) {
    const mint = new PublicKey(mintStr);
    const user = new PublicKey(userStr);
    const { whitelist } = this.getPresalePdas(mint, user);
    if (!whitelist) return null;
    try {
      return await (this.program.account as any).whitelistEntry.fetch(whitelist);
    } catch {
      return null;
    }
  }

  // ========= Write Methods (admin-signed) =========

  async initializePlatform(operator: string, treasury: string, feeBps: number) {
    const operatorPk = new PublicKey(operator);
    const treasuryPk = new PublicKey(treasury);
    const { platform } = this.getPresalePdas(this.programId);

    const txSig = await this.program.methods
      .initializePlatform(operatorPk, treasuryPk, feeBps)
      .accounts({
        platform,
        owner: this.adminKeypair.publicKey,
      })
      .signers([this.adminKeypair])
      .rpc();

    return { txSig, platform: platform.toBase58() };
  }

  async createPresale(args: {
    mint: string;
    authority: string;
    publicStartTs: number;
    publicEndTs: number;
    publicPriceLamportsPerToken: number;
    hardCapLamports: number;
    name?: string;
    symbol?: string;
    description?: string;
    creatorWallet: string; // Now required - the wallet that will sign the transaction
  }) {
    const mint = new PublicKey(args.mint);
    const authority = new PublicKey(args.authority);
    const creator = new PublicKey(args.creatorWallet);
    
    const {
      platform,
      presale,
      tokenVault,
      tokenVaultAuthority,
      ecosystemVault,
      ecosystemVaultAuthority,
      publicSolVault,
    } = this.getPresalePdas(mint);

    try {
      // Build the transaction instruction (no signing)
      // New structure: token vaults are created later via initialize_vaults
      const ix = await this.program.methods
        .createPresale(
          mint,
          authority,
          new anchor.BN(args.publicStartTs),
          new anchor.BN(args.publicEndTs),
          new anchor.BN(args.publicPriceLamportsPerToken),
          new anchor.BN(args.hardCapLamports),
        )
        .accounts({
          platform,
          presale,
          publicSolVault,
          admin: creator, // The creator wallet
          mintPubkey: mint, // Changed from 'mint' to 'mintPubkey' to match new program
        })
        .instruction();

      // Create transaction with recent blockhash
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      const transaction = new Transaction({
        feePayer: creator,
        blockhash,
        lastValidBlockHeight,
      });
      
      transaction.add(ix);

      // Serialize transaction for client to sign
      const serialized = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      // Persist metadata to Supabase, if configured
      if (this.supabaseService.isConfigured()) {
        try {
          await this.supabaseService.createPresaleRecord({
            presale_pda: presale.toBase58(),
            mint: args.mint,
            name: args.name ?? 'Unknown',
            symbol: args.symbol ?? 'UNKNOWN',
            description: args.description,
            creator_wallet: args.creatorWallet,
          });
        } catch (e) {
          this.logger.error(
            `Failed to save presale metadata for ${presale.toBase58()}: ${
              (e as Error).message
            }`,
          );
          // Do not fail on DB errors – transaction can still be sent.
        }
      }

      return {
        transaction: serialized.toString('base64'),
        presale: presale.toBase58(),
        platform: platform.toBase58(),
        publicSolVault: publicSolVault.toBase58(),
        message: 'Presale created. Token vaults will be initialized after token is created via initialize-vaults endpoint',
      };
    } catch (error: any) {
      // Convert Anchor errors to readable client errors
      const errorMessage = error?.message || error?.toString() || 'Failed to build transaction';
      throw new Error(`Failed to create presale transaction: ${errorMessage}`);
    }
  }

  async initializeVaults(args: {
    mint: string;
    creatorWallet: string;
  }) {
    const mint = new PublicKey(args.mint);
    const creator = new PublicKey(args.creatorWallet);
    
    const {
      platform,
      presale,
      tokenVault,
      tokenVaultAuthority,
      ecosystemVault,
      ecosystemVaultAuthority,
    } = this.getPresalePdas(mint);

    try {
      const ix = await this.program.methods
        .initializeVaults()
        .accounts({
          platform,
          presale,
          tokenVault,
          tokenVaultAuthority,
          ecosystemVault,
          ecosystemVaultAuthority,
          admin: creator,
          mint,
        })
        .instruction();

      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      const transaction = new Transaction({
        feePayer: creator,
        blockhash,
        lastValidBlockHeight,
      });
      
      transaction.add(ix);

      return {
        transaction: transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
        presale: presale.toBase58(),
        tokenVault: tokenVault.toBase58(),
        ecosystemVault: ecosystemVault.toBase58(),
      };
    } catch (error: any) {
      throw new Error(`Failed to build initialize vaults transaction: ${error?.message || error}`);
    }
  }

  async withdrawForLaunch(args: {
    mint: string;
    authorityWallet: string;
  }) {
    const mint = new PublicKey(args.mint);
    const authority = new PublicKey(args.authorityWallet);
    
    const { presale, publicSolVault } = this.getPresalePdas(mint);

    try {
      const ix = await this.program.methods
        .withdrawForLaunch()
        .accounts({
          presale,
          publicSolVault,
          authority,
        })
        .instruction();

      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      const transaction = new Transaction({
        feePayer: authority,
        blockhash,
        lastValidBlockHeight,
      });
      
      transaction.add(ix);

      return {
        transaction: transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
        presale: presale.toBase58(),
      };
    } catch (error: any) {
      throw new Error(`Failed to build withdraw transaction: ${error?.message || error}`);
    }
  }

  async contributePublic(args: {
    mint: string;
    userWallet: string;
    amountLamports: number;
  }) {
    const mint = new PublicKey(args.mint);
    const user = new PublicKey(args.userWallet);
    
    const { presale, publicSolVault, userPosition, whitelist } = this.getPresalePdas(mint, user);

    try {
      // Check if whitelist account exists on-chain
      let whitelistExists = false;
      try {
        if (whitelist) {
          const info = await this.connection.getAccountInfo(whitelist);
          whitelistExists = !!info;
        }
      } catch (e) {
        // Whitelist doesn't exist, which is fine for public presale
      }

      const accounts: any = {
        presale,
        publicSolVault,
        userPosition,
        user,
      };

      // `whitelist` is optional in the IDL, but Anchor's TS builder expects the key to exist.
      // Provide the PDA when it exists, otherwise explicitly set it to null.
      accounts.whitelist = whitelistExists && whitelist ? whitelist : null;

      const ix = await this.program.methods
        .contributePublic(new anchor.BN(args.amountLamports))
        .accounts(accounts)
        .instruction();

      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      const transaction = new Transaction({
        feePayer: user,
        blockhash,
        lastValidBlockHeight,
      });
      
      transaction.add(ix);

      return {
        transaction: transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
        presale: presale.toBase58(),
        userPosition: userPosition?.toBase58(),
      };
    } catch (error: any) {
      throw new Error(`Failed to build contribute transaction: ${error?.message || error}`);
    }
  }

  async finalizePresale(args: {
    mint: string;
    adminWallet: string;
  }) {
    const mint = new PublicKey(args.mint);
    const admin = new PublicKey(args.adminWallet);
    
    const { platform, presale } = this.getPresalePdas(mint);

    try {
      const ix = await this.program.methods
        .finalizePresale()
        .accounts({
          platform,
          presale,
          admin,
        })
        .instruction();

      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      const transaction = new Transaction({
        feePayer: admin,
        blockhash,
        lastValidBlockHeight,
      });
      
      transaction.add(ix);

      return {
        transaction: transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
        presale: presale.toBase58(),
      };
    } catch (error: any) {
      throw new Error(`Failed to build finalize transaction: ${error?.message || error}`);
    }
  }

  async startVote(args: {
    mint: string;
    adminWallet: string;
    votingEndsTs: number;
  }) {
    const mint = new PublicKey(args.mint);
    const admin = new PublicKey(args.adminWallet);
    
    const { platform, presale } = this.getPresalePdas(mint);

    try {
      const ix = await this.program.methods
        .startVote(new anchor.BN(args.votingEndsTs))
        .accounts({
          platform,
          presale,
          admin,
        })
        .instruction();

      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      const transaction = new Transaction({
        feePayer: admin,
        blockhash,
        lastValidBlockHeight,
      });
      
      transaction.add(ix);

      return {
        transaction: transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
        presale: presale.toBase58(),
      };
    } catch (error: any) {
      throw new Error(`Failed to build start vote transaction: ${error?.message || error}`);
    }
  }

  async castVote(args: {
    mint: string;
    userWallet: string;
    supportLaunch: boolean;
  }) {
    const mint = new PublicKey(args.mint);
    const voter = new PublicKey(args.userWallet);
    
    const { presale, userPosition } = this.getPresalePdas(mint, voter);

    try {
      const ix = await this.program.methods
        .castVote(args.supportLaunch)
        .accounts({
          presale,
          userPosition,
          voter,
        })
        .instruction();

      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      const transaction = new Transaction({
        feePayer: voter,
        blockhash,
        lastValidBlockHeight,
      });
      
      transaction.add(ix);

      return {
        transaction: transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
        presale: presale.toBase58(),
      };
    } catch (error: any) {
      throw new Error(`Failed to build cast vote transaction: ${error?.message || error}`);
    }
  }

  async finalizeVote(args: {
    mint: string;
    adminWallet: string;
  }) {
    const mint = new PublicKey(args.mint);
    const admin = new PublicKey(args.adminWallet);
    
    const { platform, presale } = this.getPresalePdas(mint);

    try {
      const ix = await this.program.methods
        .resolveVote() // Correct instruction name from Rust program
        .accounts({
          platform,
          presale,
          admin,
        })
        .instruction();

      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      const transaction = new Transaction({
        feePayer: admin,
        blockhash,
        lastValidBlockHeight,
      });
      
      transaction.add(ix);

      return {
        transaction: transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
        presale: presale.toBase58(),
      };
    } catch (error: any) {
      throw new Error(`Failed to build finalize vote transaction: ${error?.message || error}`);
    }
  }

  async fundPresaleTokens(args: {
    mint: string;
    amount: string;
    fromTokenAccount: string;
  }) {
    const mint = new PublicKey(args.mint);
    const {
      platform,
      presale,
      tokenVault,
    } = this.getPresalePdas(mint);

    const amountBn = new anchor.BN(args.amount);

    const txSig = await this.program.methods
      .fundPresaleTokens(amountBn)
      .accounts({
        platform,
        presale,
        tokenVault,
        fromTokenAccount: new PublicKey(args.fromTokenAccount),
        authority: this.adminKeypair.publicKey,
      })
      .signers([this.adminKeypair])
      .rpc();

    return { txSig };
  }

  async whitelistUser(args: {
    mint: string;
    user: string;
    tier: number;
    maxContributionLamports?: number;
    adminWallet: string;
  }) {
    const mint = new PublicKey(args.mint);
    const user = new PublicKey(args.user);
    const admin = new PublicKey(args.adminWallet);
    const { platform, presale, whitelist } = this.getPresalePdas(mint, user);

    const maxContribution = args.maxContributionLamports ?? 0;

    try {
      const ix = await this.program.methods
        .whitelistUser(args.tier, new anchor.BN(maxContribution))
        .accounts({
          platform,
          presale,
          whitelist,
          admin,
          user,
        })
        .instruction();

      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      const transaction = new Transaction({
        feePayer: admin,
        blockhash,
        lastValidBlockHeight,
      });
      
      transaction.add(ix);

      return {
        transaction: transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
        whitelist: whitelist?.toBase58(),
        presale: presale.toBase58(),
      };
    } catch (error: any) {
      throw new Error(`Failed to build whitelist transaction: ${error?.message || error}`);
    }
  }


  async migrateAndCreateLp(args: {
    mint: string;
    admin: string;
    lpTokenAccount: string;
    lpSolAccount: string;
    treasury: string;
    lpSolAmount: number;
  }) {
    const mint = new PublicKey(args.mint);
    const {
      platform,
      presale,
      tokenVault,
      tokenVaultAuthority,
      publicSolVault,
      ecosystemVault,
    } = this.getPresalePdas(mint);

    const txSig = await this.program.methods
      .migrateAndCreateLp(new anchor.BN(args.lpSolAmount))
      .accounts({
        platform,
        presale,
        tokenVault,
        tokenVaultAuthority,
        publicSolVault,
        ecosystemVault,
        lpTokenAccount: new PublicKey(args.lpTokenAccount),
        lpSolAccount: new PublicKey(args.lpSolAccount),
        treasury: new PublicKey(args.treasury),
        admin: new PublicKey(args.admin),
      })
      .signers([this.adminKeypair])
      .rpc();

    return { txSig };
  }

  async claimTokens(args: {
    mint: string;
    user: string;
    userTokenAccount: string;
  }) {
    const mint = new PublicKey(args.mint);
    const user = new PublicKey(args.user);
    const {
      presale,
      tokenVault,
      tokenVaultAuthority,
      userPosition,
    } = this.getPresalePdas(mint, user);

    const tx = await this.program.methods
      .claimTokens()
      .accounts({
        presale,
        tokenVault,
        tokenVaultAuthority,
        userPosition,
        user,
        userTokenAccount: new PublicKey(args.userTokenAccount),
      })
      .transaction();

    const txSig = await this.sendAndConfirm(tx, [this.adminKeypair]);
    return { txSig };
  }

  // ========= Tx helpers =========

  buildTx(instructions: TransactionInstruction[], feePayer: PublicKey): Transaction {
    const tx = new Transaction();
    tx.feePayer = feePayer;
    instructions.forEach((ix) => tx.add(ix));
    return tx;
  }

  async sendAndConfirm(tx: Transaction, signers: Keypair[]): Promise<string> {
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    tx.feePayer = this.adminKeypair.publicKey;
    tx.partialSign(...signers);
    const raw = tx.serialize();
    const sig = await this.connection.sendRawTransaction(raw, {
      skipPreflight: false,
      maxRetries: 3,
    });
    await this.connection.confirmTransaction(sig, 'confirmed');
    this.logger.log(`Sent presale transaction: ${sig}`);
    return sig;
  }

  // ========= Internal helpers =========

  private loadAdminKeypair(): Keypair {
    const raw = this.config.get<string>('PRESALE_ADMIN_KEYPAIR');
    if (!raw) {
      throw new Error('PRESALE_ADMIN_KEYPAIR env var is required for presale admin actions');
    }

    try {
      // Try JSON array format
      if (raw.trim().startsWith('[')) {
        const arr = JSON.parse(raw) as number[];
        return Keypair.fromSecretKey(new Uint8Array(arr));
      }

      // Try base58
      const decoded = bs58.decode(raw.trim());
      return Keypair.fromSecretKey(decoded.length === 64 ? decoded : decoded.slice(0, 64));
    } catch (e) {
      this.logger.error('Failed to parse PRESALE_ADMIN_KEYPAIR', e as Error);
      throw new Error('Invalid PRESALE_ADMIN_KEYPAIR format');
    }
  }
}


