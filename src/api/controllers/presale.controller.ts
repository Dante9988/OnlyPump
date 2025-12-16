import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, getAccount } from '@solana/spl-token';
import { PresaleService } from '../../services/presale.service';
import { PresaleOrchestratorService } from '../../services/presale-orchestrator.service';
import { TokenManagementService } from '../../services/token-management.service';
import { PLATFORM_FEE_VAULT, PLATFORM_FEE_BPS } from '../../common/constants';
import {
  InitializePlatformDto,
  CreatePresaleDto,
  FundPresaleDto,
  WhitelistUserDto,
  ContributePublicDto,
  FinalizePresaleDto,
  MigratePresaleDto,
  ClaimTokensDto,
  OrchestrateFundDto,
  OrchestrateFundResponseDto,
  PresalePricingInputDto,
  PresalePricingOutputDto,
  LaunchTokenFromPresaleDto,
} from '../dto/presale.dto';
import { XRequestSignatureGuard } from '../guards/x-request-signature.guard';

@ApiTags('Presale')
@Controller('api/presale')
@ApiHeader({
  name: 'x-solana-cluster',
  description: 'Target Solana cluster for building transactions: devnet | mainnet-beta (default: devnet)',
  required: false,
})
export class PresaleController {
  private readonly logger = new Logger(PresaleController.name);

  constructor(
    private readonly presaleService: PresaleService,
    private readonly orchestratorService: PresaleOrchestratorService,
    private readonly tokenManagementService: TokenManagementService,
    private readonly connection: Connection,
  ) {}

  // ======== READ ENDPOINTS ========

  @Get('platform')
  @ApiOperation({ summary: 'Get platform configuration' })
  @ApiResponse({ status: 200, description: 'PlatformConfig account' })
  async getPlatform() {
    return this.presaleService.getPlatformConfig();
  }

  @Post('pricing/preview')
  @ApiOperation({
    summary: 'Preview migration and public presale pricing from VIP cap + token allocations',
    description:
      'Given vipCapSol, lpTokenAmount, publicTokenAmount, and optional publicPriceMultiple, returns derived migration price, public price, and hard cap.',
  })
  @ApiBody({ type: PresalePricingInputDto })
  @ApiResponse({ status: 200, description: 'Pricing preview', type: PresalePricingOutputDto })
  async previewPricing(@Body() dto: PresalePricingInputDto): Promise<PresalePricingOutputDto> {
    return this.presaleService.computePublicPricing({
      vipCapSol: dto.vipCapSol,
      lpTokenAmount: dto.lpTokenAmount,
      publicTokenAmount: dto.publicTokenAmount,
      publicPriceMultiple: dto.publicPriceMultiple,
    });
  }

  @Get(':mint/bonding-curve')
  @ApiOperation({
    summary: 'Get Pump.fun bonding curve status for the mint and estimate SOL needed to complete the curve',
    description:
      'Returns bonding curve reserves + a quote of how much SOL is needed (at current curve state) to buy all remaining real token reserves and mark the curve complete.',
  })
  @ApiResponse({ status: 200, description: 'Bonding curve status + completion estimate' })
  async getBondingCurve(@Param('mint') mint: string) {
    return this.tokenManagementService.getBondingCurveCompletion(mint);
  }

  @Get(':mint')
  @ApiOperation({ summary: 'Get presale state by mint' })
  @ApiResponse({ status: 200, description: 'Presale account' })
  async getPresale(@Param('mint') mint: string) {
    return this.presaleService.getPresale(mint);
  }

  @Get(':mint/position/:user')
  @ApiOperation({ summary: 'Get user position for a presale' })
  @ApiResponse({ status: 200, description: 'UserPosition account or null' })
  async getUserPosition(
    @Param('mint') mint: string,
    @Param('user') user: string,
  ) {
    return this.presaleService.getUserPosition(mint, user);
  }

  @Get(':mint/whitelist/:user')
  @ApiOperation({ summary: 'Get whitelist entry for a user' })
  @ApiResponse({ status: 200, description: 'WhitelistEntry account or null' })
  async getWhitelist(
    @Param('mint') mint: string,
    @Param('user') user: string,
  ) {
    return this.presaleService.getWhitelistEntry(mint, user);
  }

  // ======== WRITE ENDPOINTS (x-request-signature) ========

  @Post('platform/initialize')
  @UseGuards(XRequestSignatureGuard)
  @ApiHeader({
    name: 'x-request-signature',
    description:
      'JSON payload with wallet, signature, timestamp, nonce, method, path, bodyHash',
    required: true,
  })
  @ApiOperation({ summary: 'Initialize platform configuration' })
  @ApiBody({ type: InitializePlatformDto })
  @ApiResponse({ status: 201, description: 'Platform initialized' })
  async initializePlatform(@Body() dto: InitializePlatformDto) {
    return this.presaleService.initializePlatform(
      dto.operator,
      dto.treasury,
      dto.feeBps,
    );
  }

  @Post()
  @UseGuards(XRequestSignatureGuard)
  @ApiHeader({
    name: 'x-request-signature',
    description:
      'JSON payload with wallet, signature, timestamp, nonce, method, path, bodyHash',
    required: true,
  })
  @ApiOperation({ summary: 'Build presale creation transaction (returns unsigned transaction for client to sign)' })
  @ApiBody({ type: CreatePresaleDto })
  @ApiResponse({ status: 201, description: 'Transaction built successfully - client should sign and broadcast' })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  async createPresale(@Req() req: any, @Body() dto: CreatePresaleDto) {
    const creatorWallet =
      req?.user?.walletPubkey ||
      req?.walletAddress;

    if (!creatorWallet) {
      throw new BadRequestException('Creator wallet is required');
    }

    try {
      return await this.presaleService.createPresale({
      name: dto.name,
      symbol: dto.symbol,
      description: dto.description,
      mint: dto.mint,
      authority: dto.authority,
      publicStartTs: dto.publicStartTs,
      publicEndTs: dto.publicEndTs,
      publicPriceLamportsPerToken: dto.publicPriceLamportsPerToken,
      hardCapLamports: dto.hardCapLamports,
        creatorWallet,
    });
    } catch (error: any) {
      // Convert service errors to BadRequestException (400)
      throw new BadRequestException(error?.message || 'Failed to build presale transaction');
    }
  }

  @Post(':mint/fund')
  @UseGuards(XRequestSignatureGuard)
  @ApiHeader({
    name: 'x-request-signature',
    description:
      'JSON payload with wallet, signature, timestamp, nonce, method, path, bodyHash',
    required: true,
  })
  @ApiOperation({ summary: 'Fund presale token vault' })
  @ApiBody({ type: FundPresaleDto })
  @ApiResponse({ status: 201, description: 'Presale funded' })
  async fundPresale(
    @Param('mint') mint: string,
    @Body() dto: FundPresaleDto,
  ) {
    return this.presaleService.fundPresaleTokens({
      mint,
      amount: dto.amount,
      fromTokenAccount: dto.fromTokenAccount,
    });
  }

  @Post(':mint/whitelist')
  @UseGuards(XRequestSignatureGuard)
  @ApiHeader({
    name: 'x-request-signature',
    description:
      'JSON payload with wallet, signature, timestamp, nonce, method, path, bodyHash',
    required: true,
  })
  @ApiOperation({ summary: 'Whitelist a user for a presale (admin only)' })
  @ApiBody({ type: WhitelistUserDto })
  @ApiResponse({ status: 201, description: 'Whitelist transaction built' })
  async whitelistUser(
    @Req() req: any,
    @Param('mint') mint: string,
    @Body() dto: WhitelistUserDto,
  ) {
    const adminWallet = req?.user?.walletPubkey || req?.walletAddress;

    if (!adminWallet) {
      throw new BadRequestException('Admin wallet is required');
    }

    try {
      return await this.presaleService.whitelistUser({
      mint,
      user: dto.user,
      tier: dto.tier,
      maxContributionLamports: dto.maxContributionLamports,
        adminWallet,
      });
    } catch (error: any) {
      throw new BadRequestException(error?.message || 'Failed to build whitelist transaction');
    }
  }

  @Post(':mint/migrate')
  @UseGuards(XRequestSignatureGuard)
  @ApiHeader({
    name: 'x-request-signature',
    description:
      'JSON payload with wallet, signature, timestamp, nonce, method, path, bodyHash',
    required: true,
  })
  @ApiOperation({ summary: 'Migrate presale and create LP (stub)' })
  @ApiBody({ type: MigratePresaleDto })
  @ApiResponse({ status: 201, description: 'Presale migrated' })
  async migrate(
    @Param('mint') mint: string,
    @Body() dto: MigratePresaleDto,
  ) {
    return this.presaleService.migrateAndCreateLp({
      mint,
      admin: dto.admin,
      lpTokenAccount: dto.lpTokenAccount,
      lpSolAccount: dto.lpSolAccount,
      treasury: dto.treasury,
      lpSolAmount: dto.lpSolAmount,
    });
  }

  @Post(':mint/claim')
  @UseGuards(XRequestSignatureGuard)
  @ApiHeader({
    name: 'x-request-signature',
    description:
      'JSON payload with wallet, signature, timestamp, nonce, method, path, bodyHash',
    required: true,
  })
  @ApiOperation({ summary: 'Claim tokens after presale migration' })
  @ApiBody({ type: ClaimTokensDto })
  @ApiResponse({ status: 201, description: 'Tokens claimed' })
  async claim(
    @Param('mint') mint: string,
    @Body() dto: ClaimTokensDto,
  ) {
    return this.presaleService.claimTokens({
      mint,
      user: dto.user,
      userTokenAccount: dto.userTokenAccount,
    });
  }

  @Post(':mint/orchestrate/fund')
  @UseGuards(XRequestSignatureGuard)
  @ApiHeader({
    name: 'x-request-signature',
    description:
      'JSON payload with wallet, signature, timestamp, nonce, method, path, bodyHash',
    required: true,
  })
  @ApiOperation({
    summary: 'Run bundled buy + consolidation + fund_presale_tokens flow',
    description:
      'Splits a SOL budget across multiple wallets, buys from Pump.fun/PumpSwap, consolidates tokens to deployer, then funds presale vault.',
  })
  @ApiBody({ type: OrchestrateFundDto })
  @ApiResponse({
    status: 201,
    description: 'Orchestration completed',
    type: OrchestrateFundResponseDto,
  })
  async orchestrateFund(
    @Param('mint') mint: string,
    @Body() dto: OrchestrateFundDto,
  ): Promise<OrchestrateFundResponseDto> {
    return this.orchestratorService.orchestrateFund(mint, dto);
  }

  @Post(':mint/launch')
  @UseGuards(XRequestSignatureGuard)
  @ApiHeader({
    name: 'x-request-signature',
    description:
      'JSON payload with wallet, signature, timestamp, nonce, method, path, bodyHash',
    required: true,
  })
  @ApiOperation({
    summary: 'Launch token from presale (withdraw funds + prepare for token creation)',
    description:
      'Verifies presale exists, creator has authority, and presale voting passed. Returns withdraw transaction to get SOL from presale vault.',
  })
  @ApiBody({ type: LaunchTokenFromPresaleDto })
  @ApiResponse({
    status: 201,
    description: 'Withdraw transaction prepared - creator should sign, then create token',
  })
  @ApiResponse({ status: 400, description: 'Invalid presale state or unauthorized' })
  async launchFromPresale(
    @Req() req: any,
    @Param('mint') mint: string,
    @Body() dto: LaunchTokenFromPresaleDto,
  ) {
    const creatorWallet = req?.user?.walletPubkey || req?.walletAddress;

    if (!creatorWallet) {
      throw new BadRequestException('Creator wallet is required');
    }

    try {
      return await this.orchestratorService.launchTokenFromPresale(creatorWallet, {
        mint: dto.mint,
        uri: dto.uri,
        name: dto.name,
        symbol: dto.symbol,
        description: dto.description,
        buyAmountSol: dto.buyAmountSol,
      });
    } catch (error: any) {
      throw new BadRequestException(error?.message || 'Failed to prepare launch');
    }
  }

  @Post(':mint/initialize-vaults')
  @UseGuards(XRequestSignatureGuard)
  @ApiHeader({
    name: 'x-request-signature',
    description:
      'JSON payload with wallet, signature, timestamp, nonce, method, path, bodyHash',
    required: true,
  })
  @ApiOperation({
    summary: 'Initialize presale token vaults (call after token is created)',
    description:
      'Creates token_vault and ecosystem_vault for the presale. Must be called by presale authority after the SPL token is created.',
  })
  @ApiResponse({ status: 201, description: 'Vaults initialization transaction built' })
  @ApiResponse({ status: 400, description: 'Token not created or unauthorized' })
  async initializeVaults(
    @Req() req: any,
    @Param('mint') mint: string,
  ) {
    const creatorWallet = req?.user?.walletPubkey || req?.walletAddress;

    if (!creatorWallet) {
      throw new BadRequestException('Creator wallet is required');
    }

    try {
      // Verify presale exists and creator has authority
      const presaleData = await this.presaleService.getPresaleByMint(mint);
      
      if (!presaleData) {
        throw new BadRequestException(`No presale found for mint ${mint}`);
      }

      if (presaleData.authority.toString() !== creatorWallet) {
        throw new BadRequestException('Only presale authority can initialize vaults');
      }

      return await this.presaleService.initializeVaults({
        mint,
        creatorWallet,
      });
    } catch (error: any) {
      throw new BadRequestException(error?.message || 'Failed to initialize vaults');
    }
  }

  @Post(':mint/contribute')
  @UseGuards(XRequestSignatureGuard)
  @ApiHeader({
    name: 'x-request-signature',
    description:
      'JSON payload with wallet, signature, timestamp, nonce, method, path, bodyHash',
    required: true,
  })
  @ApiOperation({ summary: 'Contribute SOL to presale' })
  @ApiBody({ type: ContributePublicDto })
  @ApiResponse({ status: 201, description: 'Contribution transaction built' })
  async contributePublic(
    @Req() req: any,
    @Param('mint') mint: string,
    @Body() dto: ContributePublicDto,
  ) {
    const userWallet = req?.user?.walletPubkey || req?.walletAddress;

    if (!userWallet) {
      throw new BadRequestException('User wallet is required');
    }

    try {
      return await this.presaleService.contributePublic({
        mint,
        userWallet,
        amountLamports: dto.amountLamports,
      });
    } catch (error: any) {
      throw new BadRequestException(error?.message || 'Failed to build contribution transaction');
    }
  }

  @Post(':mint/finalize')
  @UseGuards(XRequestSignatureGuard)
  @ApiHeader({
    name: 'x-request-signature',
    description:
      'JSON payload with wallet, signature, timestamp, nonce, method, path, bodyHash',
    required: true,
  })
  @ApiOperation({ summary: 'Finalize presale (admin only)' })
  @ApiBody({ type: FinalizePresaleDto })
  @ApiResponse({ status: 201, description: 'Finalize transaction built' })
  async finalizePresale(
    @Req() req: any,
    @Param('mint') mint: string,
  ) {
    const adminWallet = req?.user?.walletPubkey || req?.walletAddress;

    if (!adminWallet) {
      throw new BadRequestException('Admin wallet is required');
    }

    try {
      return await this.presaleService.finalizePresale({
        mint,
        adminWallet,
      });
    } catch (error: any) {
      throw new BadRequestException(error?.message || 'Failed to build finalize transaction');
    }
  }

  @Post(':mint/start-vote')
  @UseGuards(XRequestSignatureGuard)
  @ApiHeader({
    name: 'x-request-signature',
    description:
      'JSON payload with wallet, signature, timestamp, nonce, method, path, bodyHash',
    required: true,
  })
  @ApiOperation({ summary: 'Start voting period (admin only)' })
  @ApiResponse({ status: 201, description: 'Start vote transaction built' })
  async startVote(
    @Req() req: any,
    @Param('mint') mint: string,
    @Body() dto: { votingEndsTs: number },
  ) {
    const adminWallet = req?.user?.walletPubkey || req?.walletAddress;

    if (!adminWallet) {
      throw new BadRequestException('Admin wallet is required');
    }

    try {
      return await this.presaleService.startVote({
        mint,
        adminWallet,
        votingEndsTs: dto.votingEndsTs,
      });
    } catch (error: any) {
      throw new BadRequestException(error?.message || 'Failed to build start vote transaction');
    }
  }

  @Post(':mint/cast-vote')
  @UseGuards(XRequestSignatureGuard)
  @ApiHeader({
    name: 'x-request-signature',
    description:
      'JSON payload with wallet, signature, timestamp, nonce, method, path, bodyHash',
    required: true,
  })
  @ApiOperation({ summary: 'Cast a vote for LAUNCH or REFUND' })
  @ApiResponse({ status: 201, description: 'Vote cast transaction built' })
  async castVote(
    @Req() req: any,
    @Param('mint') mint: string,
    @Body() dto: { supportLaunch: boolean },
  ) {
    const userWallet = req?.user?.walletPubkey || req?.walletAddress;

    if (!userWallet) {
      throw new BadRequestException('User wallet is required');
    }

    try {
      return await this.presaleService.castVote({
        mint,
        userWallet,
        supportLaunch: dto.supportLaunch,
      });
    } catch (error: any) {
      throw new BadRequestException(error?.message || 'Failed to build cast vote transaction');
    }
  }

  @Post(':mint/finalize-vote')
  @UseGuards(XRequestSignatureGuard)
  @ApiHeader({
    name: 'x-request-signature',
    description:
      'JSON payload with wallet, signature, timestamp, nonce, method, path, bodyHash',
    required: true,
  })
  @ApiOperation({ summary: 'Finalize voting and lock outcome (admin only)' })
  @ApiResponse({ status: 201, description: 'Finalize vote transaction built' })
  async finalizeVote(
    @Req() req: any,
    @Param('mint') mint: string,
  ) {
    const adminWallet = req?.user?.walletPubkey || req?.walletAddress;

    if (!adminWallet) {
      throw new BadRequestException('Admin wallet is required');
    }

    try {
      return await this.presaleService.finalizeVote({
        mint,
        adminWallet,
      });
    } catch (error: any) {
      throw new BadRequestException(error?.message || 'Failed to build finalize vote transaction');
    }
  }

  @Post('claim-creator-rewards')
  @UseGuards(XRequestSignatureGuard)
  @ApiHeader({
    name: 'x-request-signature',
    description:
      'JSON payload with wallet, signature, timestamp, nonce, method, path, bodyHash',
    required: true,
  })
  @ApiOperation({
    summary: 'Claim creator rewards with automatic 50% platform fee',
    description:
      'Withdraws creator tokens/SOL from any source and automatically sends 50% to platform fee vault. Creator signs transaction approving the fee split.',
  })
  @ApiResponse({ status: 201, description: 'Withdrawal transaction built with platform fee' })
  @ApiResponse({ status: 400, description: 'Invalid request or insufficient balance' })
  async claimCreatorRewards(
    @Req() req: any,
    @Body() dto: { tokenMint: string; amount: string },
  ) {
    const creatorWallet = req?.user?.walletPubkey || req?.walletAddress;

    if (!creatorWallet) {
      throw new BadRequestException('Creator wallet is required');
    }

    try {
      const creatorPk = new PublicKey(creatorWallet);
      const mintPk = new PublicKey(dto.tokenMint);
      
      // Get creator's token account
      const creatorTokenAccount = await getAssociatedTokenAddress(
        mintPk,
        creatorPk
      );

      // Get platform fee vault token account
      const platformFeeTokenAccount = await getAssociatedTokenAddress(
        mintPk,
        PLATFORM_FEE_VAULT
      );

      // Calculate 50% split
      const totalAmount = BigInt(dto.amount);
      const platformFee = totalAmount * BigInt(PLATFORM_FEE_BPS) / BigInt(10000); // 50%
      const creatorReceives = totalAmount - platformFee;

      // Build transaction
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      const transaction = new Transaction({
        feePayer: creatorPk,
        blockhash,
        lastValidBlockHeight,
      });

      // Transfer platform fee to platform vault
      transaction.add(
        createTransferInstruction(
          creatorTokenAccount,
          platformFeeTokenAccount,
          creatorPk,
          platformFee,
        )
      );

      this.logger.log(`Creator ${creatorWallet} claiming ${dto.amount} tokens: 50% fee = ${platformFee}, creator receives = ${creatorReceives}`);

      return {
        transaction: transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
        totalAmount: dto.amount,
        platformFeeAmount: platformFee.toString(),
        creatorReceives: creatorReceives.toString(),
        platformFeeVault: PLATFORM_FEE_VAULT.toBase58(),
      };
    } catch (error: any) {
      throw new BadRequestException(error?.message || 'Failed to build creator rewards claim');
    }
  }
}
