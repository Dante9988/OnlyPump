import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SupabaseService } from '../../services/supabase.service';

@ApiTags('Health')
@Controller('api/health')
export class HealthController {
  constructor(private readonly supabaseService: SupabaseService) {}

  @Get()
  @ApiOperation({ summary: 'Basic health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get('db')
  @ApiOperation({ summary: 'Database connection check' })
  @ApiResponse({ status: 200, description: 'Database is connected' })
  async checkDatabase() {
    try {
      // Test query to transactions table
      const { data, error, count } = await this.supabaseService.db
        .from('transactions')
        .select('*', { count: 'exact', head: true });

      if (error) {
        return {
          status: 'error',
          database: 'disconnected',
          error: error.message,
          code: error.code,
        };
      }

      // Get table list
      const tables = [
        'transactions',
        'tokens',
        'user_positions',
        'creators',
        'creator_posts',
        'live_streams',
        'clubs',
        'waitlist',
      ];

      return {
        status: 'connected',
        database: 'supabase',
        tables: tables,
        transaction_count: count || 0,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        status: 'error',
        database: 'disconnected',
        error: error.message,
        hint: 'Check SUPABASE_URL and SUPABASE_SERVICE_KEY in .env',
      };
    }
  }
}

