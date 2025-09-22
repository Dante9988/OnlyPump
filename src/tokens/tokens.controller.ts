import { Controller, Get, Query, Logger } from '@nestjs/common';
import { TokensService } from './tokens.service';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';

@ApiTags('tokens')
@Controller('api/tokens')
export class TokensController {
  private readonly logger = new Logger(TokensController.name);

  constructor(private readonly tokensService: TokensService) {}

  @Get('trending')
  @ApiOperation({ summary: 'Get trending tokens' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of tokens to return' })
  @ApiResponse({ status: 200, description: 'Returns trending tokens' })
  async getTrendingTokens(@Query('limit') limit: string = '10') {
    this.logger.log(`Getting trending tokens with limit: ${limit}`);
    const limitNum = parseInt(limit, 10);
    return this.tokensService.getTrendingTokens(limitNum);
  }

  @Get('recent')
  @ApiOperation({ summary: 'Get recently created tokens' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of tokens to return' })
  @ApiResponse({ status: 200, description: 'Returns recently created tokens' })
  async getRecentTokens(@Query('limit') limit: string = '10') {
    this.logger.log(`Getting recent tokens with limit: ${limit}`);
    const limitNum = parseInt(limit, 10);
    return this.tokensService.getRecentTokens(limitNum);
  }

  @Get('graduating')
  @ApiOperation({ summary: 'Get tokens about to graduate' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of tokens to return' })
  @ApiResponse({ status: 200, description: 'Returns tokens about to graduate' })
  async getGraduatingTokens(@Query('limit') limit: string = '10') {
    this.logger.log(`Getting graduating tokens with limit: ${limit}`);
    const limitNum = parseInt(limit, 10);
    return this.tokensService.getGraduatingTokens(limitNum);
  }

  @Get('updates')
  @ApiOperation({ summary: 'Get real-time token updates' })
  @ApiResponse({ status: 200, description: 'Returns token updates' })
  async getTokenUpdates() {
    this.logger.log('Getting token updates');
    return this.tokensService.getTokenUpdates();
  }
}
