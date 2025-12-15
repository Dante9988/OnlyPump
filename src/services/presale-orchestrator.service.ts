import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { getAssociatedTokenAddress, getAccount, createTransferInstruction } from '@solana/spl-token';
import { PresaleService } from './presale.service';
import { TokenManagementService, BuyTokenRequest } from './token-management.service';
import { OrchestrateFundDto, OrchestrateFundResponseDto, WalletBuyResultDto } from '../api/dto/presale.dto';
import { TOKEN_PROGRAM_ID } from '../common/constants';

@Injectable()
export class PresaleOrchestratorService {
  private readonly logger = new Logger(PresaleOrchestratorService.name);

  constructor(
    private readonly connection: Connection,
    private readonly config: ConfigService,
    private readonly presaleService: PresaleService,
    private readonly tokenManagementService: TokenManagementService,
  ) {}

  /**
   * Orchestrate bundled buys across multiple wallets, consolidate tokens, and fund presale.
   */
  async orchestrateFund(mint: string, dto: OrchestrateFundDto): Promise<OrchestrateFundResponseDto> {
    const mintPk = new PublicKey(mint);
    const adminKeypair = this.loadDeployerKeypair();
    const deployerPk = adminKeypair.publicKey;

    const perWalletResults: WalletBuyResultDto[] = [];
    const consolidationSignatures: string[] = [];

    const perWalletBudgetSol = dto.buyBudgetSol / dto.wallets.length;
    const perWalletBudgetLamports = Math.floor(perWalletBudgetSol * 1e9);

    // 1. Execute buys per wallet (best-effort)
    for (const walletInfo of dto.wallets) {
      const walletResult: WalletBuyResultDto = {
        wallet: '',
      };
      perWalletResults.push(walletResult);

      try {
        const walletKp = this.keypairFromBase58(walletInfo.secretKeyBase58);
        walletResult.wallet = walletKp.publicKey.toBase58();

        const request: BuyTokenRequest = {
          tokenMint: mintPk.toBase58(),
          solAmount: perWalletBudgetSol,
          slippageBps: dto.slippageBps,
        };

        // Reuse existing buy logic to build the transaction
        const buildResult = await this.tokenManagementService.buyToken(
          walletKp.publicKey.toBase58(),
          request,
        );

        if (!buildResult.success || !buildResult.txId) {
          walletResult.error = buildResult.error || 'Failed to build buy transaction';
          this.logger.warn(
            `Skipping wallet ${walletResult.wallet} due to build error: ${walletResult.error}`,
          );
          continue;
        }

        // Decode and sign the transaction with the wallet secret key
        const txBuffer = Buffer.from(buildResult.txId, 'base64');
        const tx = Transaction.from(txBuffer);
        tx.partialSign(walletKp);

        const sig = await this.connection.sendRawTransaction(
          tx.serialize(),
          {
            skipPreflight: false,
            maxRetries: 3,
          },
        );
        await this.connection.confirmTransaction(sig, 'confirmed');

        walletResult.txSignature = sig;

        // Compute acquired token amount by checking ATA balance
        const ata = await getAssociatedTokenAddress(mintPk, walletKp.publicKey);
        const account = await getAccount(this.connection, ata);
        walletResult.tokenAmount = account.amount.toString();
      } catch (e) {
        walletResult.error = (e as Error).message;
        this.logger.error('Error in bundled buy for wallet', e as Error);
      }
    }

    // 2. Consolidate tokens to deployer ATA
    const deployerAta =
      dto.deployerTokenAccount &&
      dto.deployerTokenAccount.trim().length > 0
        ? new PublicKey(dto.deployerTokenAccount)
        : await getAssociatedTokenAddress(mintPk, deployerPk);

    let totalConsolidated = 0n;

    for (const result of perWalletResults) {
      if (!result.wallet || !result.tokenAmount || result.error) {
        continue;
      }

      try {
        const walletPk = new PublicKey(result.wallet);
        const walletKp = this.keypairFromBase58(
          dto.wallets.find((w) => {
            try {
              return this.keypairFromBase58(w.secretKeyBase58).publicKey.equals(walletPk);
            } catch {
              return false;
            }
          })?.secretKeyBase58 || '',
        );

        const ata = await getAssociatedTokenAddress(mintPk, walletPk);
        const amount = BigInt(result.tokenAmount);
        if (amount === 0n) continue;

        const ix = createTransferInstruction(
          ata,
          deployerAta,
          walletPk,
          Number(amount),
          [],
          TOKEN_PROGRAM_ID,
        );

        const tx = new Transaction().add(ix);
        tx.feePayer = walletPk;
        tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
        tx.partialSign(walletKp);

        const sig = await this.connection.sendRawTransaction(
          tx.serialize(),
          { skipPreflight: false, maxRetries: 3 },
        );
        await this.connection.confirmTransaction(sig, 'confirmed');
        consolidationSignatures.push(sig);
        totalConsolidated += amount;
      } catch (e) {
        this.logger.error('Error consolidating tokens from wallet', e as Error);
      }
    }

    // 3. Check deployer final balance
    const deployerAccount = await getAccount(this.connection, deployerAta);
    const finalDeployerBalance = deployerAccount.amount.toString();

    // 4. Fund presale if we consolidated anything
    let fundPresaleSignature: string | undefined;
    let finalVaultBalance: string | undefined;

    if (totalConsolidated > 0n) {
      const amountStr = totalConsolidated.toString();

      fundPresaleSignature = (
        await this.presaleService.fundPresaleTokens({
          mint: mintPk.toBase58(),
          amount: amountStr,
          fromTokenAccount: deployerAta.toBase58(),
        })
      ).txSig;

      // Read vault balance
      const { tokenVault } = this.presaleService.getPresalePdas(mintPk);
      try {
        const vaultAccount = await getAccount(this.connection, tokenVault);
        finalVaultBalance = vaultAccount.amount.toString();
      } catch {
        finalVaultBalance = undefined;
      }
    }

    return {
      perWallet: perWalletResults,
      consolidationSignatures,
      fundPresaleSignature,
      finalDeployerTokenBalance: finalDeployerBalance,
      finalVaultTokenBalance: finalVaultBalance,
    };
  }

  /**
   * Launch a token from presale funds
   * Returns all required transactions for creator to sign and send in order:
   * 1) withdraw SOL from presale vault
   * 2) create+buy token on Pump.fun using the reserved mint
   * 3) initialize presale vaults (SPL token accounts)
   * 4) fund presale token vault with 50% of the bought tokens
   */
  async launchTokenFromPresale(creatorWallet: string, dto: { mint: string; uri: string; name: string; symbol: string; description?: string; buyAmountSol: number }) {
    const creatorPk = new PublicKey(creatorWallet);

    // 1. Check if presale exists for this mint
    const presaleData = await this.presaleService.getPresaleByMint(dto.mint);
    
    if (!presaleData) {
      throw new Error(`No presale found for mint ${dto.mint}`);
    }

    this.logger.log(`Presale data: is_finalized=${presaleData.is_finalized}, outcome=${presaleData.outcome}, phase=${presaleData.phase}`);

    // 2. Verify creator is the presale authority
    if (presaleData.authority.toString() !== creatorWallet) {
      throw new Error('Only presale authority can launch the token');
    }

    // 3. Verify presale state
    // Phase should be LAUNCHABLE (3) after successful vote
    if (presaleData.phase !== 3) { // 3 = LAUNCHABLE
      throw new Error(`Presale must be in LAUNCHABLE phase. Current phase: ${presaleData.phase} (3=LAUNCHABLE, 2=VOTING, 4=REFUNDABLE)`);
    }

    if (presaleData.outcome !== 1) { // 1 = LAUNCH outcome from vote
      throw new Error(`Presale vote outcome must be LAUNCH. Current outcome: ${presaleData.outcome} (1=LAUNCH, 2=REFUND)`);
    }

    // 4. Check available funds
    const vaultBalanceSol = presaleData.vaultBalance / 1e9;
    this.logger.log(`Presale vault has ${vaultBalanceSol} SOL available`);

    if (dto.buyAmountSol > vaultBalanceSol) {
      throw new Error(`Insufficient presale funds. Requested: ${dto.buyAmountSol} SOL, Available: ${vaultBalanceSol} SOL`);
    }

    // 5. Build withdraw transaction
    const withdrawResult = await this.presaleService.withdrawForLaunch({
      mint: dto.mint,
      authorityWallet: creatorWallet,
    });

    this.logger.log(`✅ Built withdraw transaction for ${vaultBalanceSol} SOL`);
    this.logger.log(`Creator should: sign & send txs for withdraw → create+buy → init vaults → fund presale`);

    // 6. Build Pump.fun create+buy transaction using the SAME reserved mint (server looks up mint keypair)
    const createAndBuyResult = await this.tokenManagementService.createAndBuyToken(
      creatorWallet,
      {
        name: dto.name,
        symbol: dto.symbol,
        uri: dto.uri,
        description: dto.description,
        useVanityAddress: true,
        solAmount: dto.buyAmountSol,
        mintPublicKey: dto.mint,
      },
    );
    if (!createAndBuyResult.success || !createAndBuyResult.txId) {
      throw new Error(createAndBuyResult.error || 'Failed to build create-and-buy transaction');
    }
    if (!createAndBuyResult.tokenMint || createAndBuyResult.tokenMint !== dto.mint) {
      throw new Error(`Create+buy mint mismatch. Expected ${dto.mint}, got ${createAndBuyResult.tokenMint}`);
    }
    if (!createAndBuyResult.tokenAmountRaw) {
      throw new Error('Missing tokenAmountRaw from create-and-buy result');
    }

    // 7. Initialize vaults transaction (now that mint will exist after step 2)
    const initVaultsResult = await this.presaleService.initializeVaults({
      mint: dto.mint,
      creatorWallet,
    });

    // 8. Build fund-presale transaction: transfer 50% of bought tokens to presale token vault
    const mintPk = new PublicKey(dto.mint);
    const { tokenVault } = this.presaleService.getPresalePdas(mintPk);
    const creatorAta = await getAssociatedTokenAddress(mintPk, creatorPk);
    const boughtAmount = BigInt(createAndBuyResult.tokenAmountRaw);
    const fundAmount = boughtAmount / 2n; // 50%
    if (fundAmount <= 0n) {
      throw new Error(`Computed fundAmount is 0 from boughtAmount=${boughtAmount.toString()}`);
    }

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    const fundTx = new Transaction({
      feePayer: creatorPk,
      blockhash,
      lastValidBlockHeight,
    });
    fundTx.add(
      createTransferInstruction(
        creatorAta,
        tokenVault,
        creatorPk,
        fundAmount,
        [],
        TOKEN_PROGRAM_ID,
      ),
    );

    return {
      // Back-compat / test-friendly top-level fields
      withdrawTransaction: withdrawResult.transaction,
      createAndBuyTransaction: createAndBuyResult.txId,
      initializeVaultsTransaction: initVaultsResult.transaction,
      fundPresaleTransaction: fundTx
        .serialize({ requireAllSignatures: false, verifySignatures: false })
        .toString('base64'),
      step1_withdraw: {
        transaction: withdrawResult.transaction,
        description: 'Withdraw presale funds to creator wallet',
      },
      step2_createAndBuy: {
        transaction: createAndBuyResult.txId,
        description: 'Create + buy Pump.fun token using reserved mint (creator signs tx)',
      },
      step3_initializeVaults: {
        transaction: initVaultsResult.transaction,
        description: 'Initialize token vaults for presale',
      },
      step4_fundPresale: {
        transaction: fundTx
          .serialize({ requireAllSignatures: false, verifySignatures: false })
          .toString('base64'),
        description: 'Transfer 50% of bought tokens from creator ATA to presale token vault',
        fundAmountRaw: fundAmount.toString(),
        creatorAta: creatorAta.toBase58(),
        tokenVault: tokenVault.toBase58(),
      },
      presaleAddress: withdrawResult.presale,
      availableSol: vaultBalanceSol,
      message: 'Execute steps 1-4 in order. Creator signs all transactions.',
    };
  }

  private keypairFromBase58(secretKeyBase58: string): Keypair {
    if (!secretKeyBase58) {
      throw new Error('Missing secretKeyBase58');
    }
    const decoded = bs58.decode(secretKeyBase58.trim());
    return Keypair.fromSecretKey(decoded.length === 64 ? decoded : decoded.slice(0, 64));
  }

  private loadDeployerKeypair(): Keypair {
    const raw =
      this.config.get<string>('PRESALE_ADMIN_KEYPAIR') ??
      this.config.get<string>('WALLET_PRIVATE_KEY');
    if (!raw) {
      throw new Error('PRESALE_ADMIN_KEYPAIR or WALLET_PRIVATE_KEY required for orchestrator');
    }
    try {
      if (raw.trim().startsWith('[')) {
        const arr = JSON.parse(raw) as number[];
        return Keypair.fromSecretKey(new Uint8Array(arr));
      }
      const decoded = bs58.decode(raw.trim());
      return Keypair.fromSecretKey(decoded.length === 64 ? decoded : decoded.slice(0, 64));
    } catch (e) {
      this.logger.error('Failed to parse deployer keypair', e as Error);
      throw new Error('Invalid deployer keypair format');
    }
  }
}


