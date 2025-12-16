import { Controller, Post, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { VanityAddressManagerService } from '../../services/vanity-address-manager.service';

@ApiTags('Token Management')
@Controller('api/tokens')
export class TokensVanityController {
  constructor(private readonly vanityAddressManager: VanityAddressManagerService) {}

  @Post('reserve-vanity')
  @ApiOperation({
    summary: 'Reserve a vanity mint address (pubkey only)',
    description:
      'Returns a fresh reserved mint pubkey from the server-side vanity pool. The mint keypair is never returned to the client.',
  })
  @ApiResponse({
    status: 201,
    description: 'Reserved vanity mint pubkey',
    schema: {
      example: {
        publicKey: 'CgnijefPVaQeoJvARnxYYcRqRbAsrAZNJ55FTRR4pump',
        mint: 'CgnijefPVaQeoJvARnxYYcRqRbAsrAZNJ55FTRR4pump',
        reservedMint: 'CgnijefPVaQeoJvARnxYYcRqRbAsrAZNJ55FTRR4pump',
      },
    },
  })
  async reserveVanity(): Promise<{ publicKey: string; mint: string; reservedMint: string }> {
    const result = this.vanityAddressManager.getAvailableVanityAddress();
    if (!result) {
      throw new ServiceUnavailableException('No available vanity addresses');
    }

    // Return multiple aliases so frontends can depend on whichever field name they implemented.
    return {
      publicKey: result.publicKey,
      mint: result.publicKey,
      reservedMint: result.publicKey,
    };
  }
}


