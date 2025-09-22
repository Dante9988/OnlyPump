import { Controller, Get, Post, Param, Headers, Logger } from '@nestjs/common';
import { UsersService } from './users.service';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiHeader } from '@nestjs/swagger';

@ApiTags('users')
@Controller('api/users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  @Get('profile/:address')
  @ApiOperation({ summary: 'Get user profile' })
  @ApiParam({ name: 'address', description: 'User wallet address' })
  @ApiResponse({ status: 200, description: 'Returns user profile' })
  async getUserProfile(@Param('address') address: string) {
    this.logger.log(`Getting profile for address: ${address}`);
    return this.usersService.getUserProfile(address);
  }

  @Get(':address/created-tokens')
  @ApiOperation({ summary: 'Get tokens created by a user' })
  @ApiParam({ name: 'address', description: 'User wallet address' })
  @ApiResponse({ status: 200, description: 'Returns tokens created by the user' })
  async getUserCreatedTokens(@Param('address') address: string) {
    this.logger.log(`Getting created tokens for address: ${address}`);
    return this.usersService.getUserCreatedTokens(address);
  }

  @Get(':address/token-balances')
  @ApiOperation({ summary: 'Get user token balances' })
  @ApiParam({ name: 'address', description: 'User wallet address' })
  @ApiResponse({ status: 200, description: 'Returns user token balances' })
  async getUserTokenBalances(@Param('address') address: string) {
    this.logger.log(`Getting token balances for address: ${address}`);
    return this.usersService.getUserTokenBalances(address);
  }

  @Get(':address/sol-balance')
  @ApiOperation({ summary: 'Get user SOL balance' })
  @ApiParam({ name: 'address', description: 'User wallet address' })
  @ApiResponse({ status: 200, description: 'Returns user SOL balance' })
  async getUserSolBalance(@Param('address') address: string) {
    this.logger.log(`Getting SOL balance for address: ${address}`);
    return this.usersService.getUserSolBalance(address);
  }

  @Get(':address/creator-fees')
  @ApiOperation({ summary: 'Get creator fees for a user' })
  @ApiParam({ name: 'address', description: 'User wallet address' })
  @ApiResponse({ status: 200, description: 'Returns creator fees' })
  async getUserCreatorFees(@Param('address') address: string) {
    this.logger.log(`Getting creator fees for address: ${address}`);
    return this.usersService.getUserCreatorFees(address);
  }

  @Post(':address/collect-fees')
  @ApiOperation({ summary: 'Collect creator fees' })
  @ApiParam({ name: 'address', description: 'User wallet address' })
  @ApiHeader({ name: 'x-wallet-public-key', description: 'Wallet public key' })
  @ApiResponse({ status: 200, description: 'Returns transaction result' })
  async collectCreatorFees(
    @Param('address') address: string,
    @Headers('x-wallet-public-key') walletPublicKey: string
  ) {
    this.logger.log(`Collecting creator fees for address: ${address}`);
    return this.usersService.collectCreatorFees(address, walletPublicKey);
  }
}
