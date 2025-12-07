use anchor_lang::prelude::*;
use crate::state::accounts::WhitelistUser;

/// Whitelist a user for a presale
/// Admin-only
/// Creates/updates WhitelistEntry PDA
/// PDA seeds: ["whitelist", presale_pubkey, user_pubkey]
pub fn whitelist_user(
    ctx: Context<WhitelistUser>,
    tier: u8,
    max_contribution_lamports: u64,
) -> Result<()> {
    ctx.accounts.validate()?;

    let whitelist = &mut ctx.accounts.whitelist;
    whitelist.presale = ctx.accounts.presale.key();
    whitelist.user = ctx.accounts.user.key();
    whitelist.tier = tier;
    whitelist.max_contribution_lamports = max_contribution_lamports;
    whitelist.bump = ctx.bumps.whitelist;

    Ok(())
}

