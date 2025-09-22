import { Body, Controller, Get, HttpException, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiBadRequestResponse, ApiInternalServerErrorResponse } from '@nestjs/swagger';
import { PumpSwapService } from '../../modules/pump-swap/pump-swap.service';
import { BuyTokenDto, SellTokenDto, TokenInfoDto } from '../dto/token.dto';
import { PumpFunResult } from '../../interfaces/pump-fun.interface';
import { WalletProvider } from '../../interfaces/wallet.interface';

@ApiTags('pump-swap')
@Controller('api/pump-swap')
export class PumpSwapController {
  constructor(private readonly pumpSwapService: PumpSwapService) {}

  @Post('buy-token')
  @ApiOperation({ summary: 'Buy a token on PumpSwap' })
  @ApiResponse({ status: 200, description: 'Token purchased successfully', type: Object })
  @ApiBadRequestResponse({ description: 'Invalid input parameters' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async buyToken(
    @Body() buyTokenDto: BuyTokenDto,
    // Note: In a real application, you would extract the wallet from a JWT token or session
    wallet: WalletProvider
  ): Promise<PumpFunResult> {
    try {
      const result = await this.pumpSwapService.buyToken(
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
  @ApiOperation({ summary: 'Sell a token on PumpSwap' })
  @ApiResponse({ status: 200, description: 'Token sold successfully', type: Object })
  @ApiBadRequestResponse({ description: 'Invalid input parameters' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async sellToken(
    @Body() sellTokenDto: SellTokenDto,
    // Note: In a real application, you would extract the wallet from a JWT token or session
    wallet: WalletProvider
  ): Promise<PumpFunResult> {
    try {
      const result = await this.pumpSwapService.sellToken(
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

  @Get('has-pool/:tokenMint')
  @ApiOperation({ summary: 'Check if a token has a PumpSwap pool' })
  @ApiResponse({ status: 200, description: 'Check completed successfully', type: Boolean })
  @ApiBadRequestResponse({ description: 'Invalid token mint address' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async hasPool(@Param() params: TokenInfoDto): Promise<boolean> {
    try {
      return await this.pumpSwapService.hasPool(params.tokenMint);
    } catch (error) {
      console.error('Error checking if token has PumpSwap pool:', error);
      
      throw new HttpException(
        'An unexpected error occurred while checking the token pool',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
