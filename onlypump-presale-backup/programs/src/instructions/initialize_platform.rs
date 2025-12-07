use anchor_lang::prelude::*;
use crate::state::accounts::InitializePlatform;

/// Initialize the platform with owner, operator, treasury, and fee configuration
/// PDA seeds: ["platform"]
pub fn initialize_platform(
    ctx: Context<InitializePlatform>,
    operator: Pubkey,
    treasury: Pubkey,
    fee_bps: u16,
) -> Result<()> {
    let platform = &mut ctx.accounts.platform;
    platform.owner = ctx.accounts.owner.key();
    platform.operator = operator;
    platform.treasury = treasury;
    platform.fee_bps = fee_bps;
    platform.bump = ctx.bumps.platform;
    Ok(())
}

