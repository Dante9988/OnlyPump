use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use crate::state::accounts::FundPresaleTokens;

/// Fund the presale token vault with the required tokens (800M total)
/// Admin-only
/// Transfers tokens from authority's token account to token_vault PDA
/// Assumption: Exactly 800M tokens (400M + 300M + 100M) should be transferred
pub fn fund_presale_tokens(ctx: Context<FundPresaleTokens>, amount: u64) -> Result<()> {
    ctx.accounts.validate()?;

    // Transfer tokens from authority to token_vault
    // Note: The authority must be the owner of from_token_account
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.from_token_account.to_account_info(),
                to: ctx.accounts.token_vault.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        ),
        amount,
    )?;

    Ok(())
}

