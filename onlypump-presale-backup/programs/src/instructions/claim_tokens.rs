use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::accounts::ClaimTokens;
use crate::errors::PresaleError;
use crate::events::ClaimTokensEvent;

/// User claims their allocated tokens after migration
/// Preconditions: presale.is_migrated == true
/// Transfers tokens from token_vault to user's ATA
pub fn claim_tokens(ctx: Context<ClaimTokens>) -> Result<()> {
    let presale = &ctx.accounts.presale;

    require!(presale.is_migrated, PresaleError::PresaleNotMigrated);

    let position = &mut ctx.accounts.user_position;
    let claimable = position
        .tokens_allocated
        .checked_sub(position.tokens_claimed)
        .ok_or(PresaleError::NothingToClaim)?;

    require!(claimable > 0, PresaleError::NothingToClaim);

    // Transfer tokens from token_vault to user's ATA
    let token_vault_seeds = &[
        b"token_vault",
        presale.key().as_ref(),
        &[ctx.bumps.token_vault],
    ];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.token_vault.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.token_vault_authority.to_account_info(),
            },
            &[token_vault_seeds],
        ),
        claimable,
    )?;

    // Update claimed amount
    position.tokens_claimed = position
        .tokens_claimed
        .checked_add(claimable)
        .ok_or(PresaleError::NothingToClaim)?;

    emit!(ClaimTokensEvent {
        user: ctx.accounts.user.key(),
        presale: presale.key(),
        tokens_claimed: claimable,
    });

    Ok(())
}

