import { Body, Controller, Get, HttpException, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiBadRequestResponse, ApiInternalServerErrorResponse } from '@nestjs/swagger';
import { PumpFunService } from '../../modules/pump-fun/pump-fun.service';
import { BuyTokenDto, CreateTokenDto, SellTokenDto, TokenInfoDto } from '../dto/token.dto';
import { PumpFunResult, TokenInfo } from '../../interfaces/pump-fun.interface';
import { WalletProvider } from '../../interfaces/wallet.interface';

@ApiTags('pump-fun')
@Controller('api/pump-fun')
export class PumpFunController {
  constructor(private readonly pumpFunService: PumpFunService) {}

  @Post('create-token')
  @ApiOperation({ summary: 'Create a new token on Pump.fun' })
  @ApiResponse({ status: 201, description: 'Token created successfully', type: Object })
  @ApiBadRequestResponse({ description: 'Invalid input parameters' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async createToken(
    @Body() createTokenDto: CreateTokenDto,
    // Note: In a real application, you would extract the wallet from a JWT token or session
    // This is just for demonstration purposes
    wallet: WalletProvider
  ): Promise<PumpFunResult> {
    try {
      const result = await this.pumpFunService.createToken(
        wallet,
        createTokenDto.name,
        createTokenDto.symbol,
        createTokenDto.uri,
        createTokenDto.description,
        createTokenDto.socials,
        {
          speed: createTokenDto.speed,
          slippageBps: createTokenDto.slippageBps,
          useJito: createTokenDto.useJito,
          jitoTipLamports: createTokenDto.jitoTipLamports,
        }
      );

      if (!result.success) {
        throw new HttpException(
          result.error || 'Failed to create token',
          HttpStatus.BAD_REQUEST
        );
      }

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      // Log the error for internal tracking
      console.error('Error creating token:', error);
      
      throw new HttpException(
        'An unexpected error occurred while creating the token',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('buy-token')
  @ApiOperation({ summary: 'Buy a token on Pump.fun' })
  @ApiResponse({ status: 200, description: 'Token purchased successfully', type: Object })
  @ApiBadRequestResponse({ description: 'Invalid input parameters' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async buyToken(
    @Body() buyTokenDto: BuyTokenDto,
    // Note: In a real application, you would extract the wallet from a JWT token or session
    wallet: WalletProvider
  ): Promise<PumpFunResult> {
    try {
      const result = await this.pumpFunService.buyToken(
        wallet,
        buyTokenDto.tokenMint,
        buyTokenDto.solAmount,
        {
          speed: buyTokenDto.speed,
          slippageBps: buyTokenDto.slippageBps,
          useJito: buyTokenDto.useJito,
          jitoTipLamports: buyTokenDto.jitoTipLamports,
        }
      );

      if (!result.success) {
        throw new HttpException(
          result.error || 'Failed to buy token',
          HttpStatus.BAD_REQUEST
        );
      }

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      console.error('Error buying token:', error);
      
      throw new HttpException(
        'An unexpected error occurred while buying the token',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('sell-token')
  @ApiOperation({ summary: 'Sell a token on Pump.fun' })
  @ApiResponse({ status: 200, description: 'Token sold successfully', type: Object })
  @ApiBadRequestResponse({ description: 'Invalid input parameters' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async sellToken(
    @Body() sellTokenDto: SellTokenDto,
    // Note: In a real application, you would extract the wallet from a JWT token or session
    wallet: WalletProvider
  ): Promise<PumpFunResult> {
    try {
      const result = await this.pumpFunService.sellToken(
        wallet,
        sellTokenDto.tokenMint,
        sellTokenDto.percentage,
        {
          speed: sellTokenDto.speed,
          slippageBps: sellTokenDto.slippageBps,
          useJito: sellTokenDto.useJito,
          jitoTipLamports: sellTokenDto.jitoTipLamports,
        }
      );

      if (!result.success) {
        throw new HttpException(
          result.error || 'Failed to sell token',
          HttpStatus.BAD_REQUEST
        );
      }

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      console.error('Error selling token:', error);
      
      throw new HttpException(
        'An unexpected error occurred while selling the token',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('token-info/:tokenMint')
  @ApiOperation({ summary: 'Get information about a token' })
  @ApiResponse({ status: 200, description: 'Token information retrieved successfully', type: Object })
  @ApiBadRequestResponse({ description: 'Invalid token mint address' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async getTokenInfo(@Param() params: TokenInfoDto): Promise<TokenInfo> {
    try {
      const tokenInfo = await this.pumpFunService.getTokenInfo(params.tokenMint);
      
      if (!tokenInfo) {
        throw new HttpException(
          'Token not found',
          HttpStatus.NOT_FOUND
        );
      }
      
      return tokenInfo;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      console.error('Error getting token info:', error);
      
      throw new HttpException(
        'An unexpected error occurred while fetching token information',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('is-pump-fun-token/:tokenMint')
  @ApiOperation({ summary: 'Check if a token is a Pump.fun token' })
  @ApiResponse({ status: 200, description: 'Check completed successfully', type: Boolean })
  @ApiBadRequestResponse({ description: 'Invalid token mint address' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async isTokenPumpFun(@Param() params: TokenInfoDto): Promise<boolean> {
    try {
      return await this.pumpFunService.isTokenPumpFun(params.tokenMint);
    } catch (error) {
      console.error('Error checking if token is Pump.fun token:', error);
      
      throw new HttpException(
        'An unexpected error occurred while checking the token',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('is-bonding-curve-complete/:tokenMint')
  @ApiOperation({ summary: 'Check if a token\'s bonding curve is complete' })
  @ApiResponse({ status: 200, description: 'Check completed successfully', type: Boolean })
  @ApiBadRequestResponse({ description: 'Invalid token mint address' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async isBondingCurveComplete(@Param() params: TokenInfoDto): Promise<boolean> {
    try {
      return await this.pumpFunService.isBondingCurveComplete(params.tokenMint);
    } catch (error) {
      console.error('Error checking if bonding curve is complete:', error);
      
      throw new HttpException(
        'An unexpected error occurred while checking the bonding curve',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
