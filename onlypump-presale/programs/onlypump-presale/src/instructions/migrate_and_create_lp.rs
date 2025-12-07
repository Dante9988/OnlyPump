use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use crate::state::accounts::MigrateAndCreateLp;
use crate::errors::PresaleError;
use crate::events::MigrateAndCreateLpEvent;

/// Migrate presale and create LP
/// Admin-only
/// Preconditions: is_finalized == true, is_migrated == false
/// Actions:
/// - Transfer lp_token_allocation (300M) from token_vault for LP
/// - Take lp_sol_amount from public_sol_vault to pair with tokens
/// - Transfer ecosystem_allocation (100M) to ecosystem_vault
/// - Set is_migrated = true
/// - Send leftover SOL to treasury
/// Note: Actual LP creation CPI is stubbed for now
pub fn migrate_and_create_lp(
    ctx: Context<MigrateAndCreateLp>,
    lp_sol_amount: u64,
) -> Result<()> {
    ctx.accounts.validate()?;

    let presale = &mut ctx.accounts.presale;

    require!(presale.is_finalized, PresaleError::PresaleNotFinalized);
    require!(!presale.is_migrated, PresaleError::PresaleAlreadyMigrated);

    // Transfer LP tokens (300M) from token_vault to lp_token_account
    let presale_key = presale.key();
    let token_vault_seeds = &[
        b"token_vault",
        presale_key.as_ref(),
        &[ctx.bumps.token_vault],
    ];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.token_vault.to_account_info(),
                to: ctx.accounts.lp_token_account.to_account_info(),
                authority: ctx.accounts.token_vault_authority.to_account_info(),
            },
            &[token_vault_seeds],
        ),
        presale.lp_token_allocation,
    )?;

    // Transfer SOL from public_sol_vault to lp_sol_account
    require!(
        ctx.accounts.public_sol_vault.lamports() >= lp_sol_amount,
        PresaleError::InsufficientFunds
    );

    **ctx.accounts.public_sol_vault.try_borrow_mut_lamports()? -= lp_sol_amount;
    **ctx.accounts.lp_sol_account.try_borrow_mut_lamports()? += lp_sol_amount;

    // Transfer ecosystem tokens (100M) to ecosystem_vault
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.token_vault.to_account_info(),
                to: ctx.accounts.ecosystem_vault.to_account_info(),
                authority: ctx.accounts.token_vault_authority.to_account_info(),
            },
            &[token_vault_seeds],
        ),
        presale.ecosystem_allocation,
    )?;

    // Transfer leftover SOL to treasury
    let remaining_sol = ctx.accounts.public_sol_vault.lamports();
    if remaining_sol > 0 {
        **ctx.accounts.public_sol_vault.try_borrow_mut_lamports()? -= remaining_sol;
        **ctx.accounts.treasury.try_borrow_mut_lamports()? += remaining_sol;
    }

    // Mark as migrated
    presale.is_migrated = true;

    // TODO: Stub for actual LP creation CPI
    // In production, this would call Raydium or PumpSwap to create the LP
    // For now, tokens and SOL are in lp_token_account and lp_sol_account ready for LP creation

    emit!(MigrateAndCreateLpEvent {
        presale: presale.key(),
        lp_tokens: presale.lp_token_allocation,
        lp_sol: lp_sol_amount,
        ecosystem_tokens: presale.ecosystem_allocation,
        remaining_sol_to_treasury: remaining_sol,
    });

    Ok(())
}

