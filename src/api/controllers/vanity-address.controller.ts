import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AdvancedVanityAddressService, PoolStats, ReservationResult } from '../../services/advanced-vanity-address.service';

@Controller('api/vanity')
export class VanityAddressController {
  constructor(private readonly vanityService: AdvancedVanityAddressService) {}

  @Get('stats')
  getStats(): PoolStats {
    return this.vanityService.getStats();
  }

  @Post('reserve')
  async reserve(): Promise<ReservationResult | { error: string }> {
    const result = await this.vanityService.reserve();
    if (!result) {
      return { error: 'No available keypairs in pool' };
    }
    return result;
  }

  @Post('mark-used')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markUsed(@Body() body: { reservationId: string }): Promise<void> {
    const success = await this.vanityService.markUsed(body.reservationId);
    if (!success) {
      throw new Error('Failed to mark keypair as used');
    }
  }

  @Post('release')
  @HttpCode(HttpStatus.NO_CONTENT)
  async release(@Body() body: { reservationId: string }): Promise<void> {
    const success = await this.vanityService.release(body.reservationId);
    if (!success) {
      throw new Error('Failed to release keypair');
    }
  }

  @Post('refresh')
  async refresh(): Promise<{ message: string }> {
    await this.vanityService.refreshPool();
    return { message: 'Pool refresh initiated' };
  }
}
