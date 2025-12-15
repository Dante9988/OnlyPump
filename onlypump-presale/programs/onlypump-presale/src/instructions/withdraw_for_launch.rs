use anchor_lang::prelude::*;
use crate::state::accounts::WithdrawForLaunch;
use crate::errors::PresaleError;

/// Withdraw collected SOL from presale to authority for launching token
/// Authority-only (presale.authority)
/// Transfers all SOL from public_sol_vault to authority
/// Can only be called after presale voting is complete and outcome is Launch
pub fn withdraw_for_launch(ctx: Context<WithdrawForLaunch>) -> Result<()> {
    ctx.accounts.validate()?;

    let presale = &ctx.accounts.presale;

    // Verify presale state allows withdrawal
    require!(presale.is_finalized, PresaleError::PresaleNotFinalized);
    require!(
        presale.outcome == crate::instructions::vote::outcome::LAUNCH,
        PresaleError::Unauthorized
    );

    // Get balance from public_sol_vault
    let vault_balance = ctx.accounts.public_sol_vault.lamports();
    
    if vault_balance == 0 {
        return Err(PresaleError::InsufficientFunds.into());
    }

    // Transfer all SOL from vault to authority
    **ctx.accounts.public_sol_vault.try_borrow_mut_lamports()? -= vault_balance;
    **ctx.accounts.authority.try_borrow_mut_lamports()? += vault_balance;

    msg!("Withdrawn {} lamports from presale to authority", vault_balance);

    Ok(())
}

