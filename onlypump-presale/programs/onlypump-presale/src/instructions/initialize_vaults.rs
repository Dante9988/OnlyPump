use anchor_lang::prelude::*;
use crate::state::accounts::InitializeVaults;
use crate::instructions::vote::phase;
use crate::errors::PresaleError;

/// Initialize token vaults for a presale (call after token is created)
/// Admin-only (owner or operator)
/// Creates token_vault and ecosystem_vault token accounts
pub fn initialize_vaults(ctx: Context<InitializeVaults>) -> Result<()> {
    ctx.accounts.validate()?;

    // Update presale to store ecosystem_vault reference
    let presale = &mut ctx.accounts.presale;
    presale.ecosystem_vault = ctx.accounts.ecosystem_vault.key();

    // Once vaults exist, we consider the token "launched" for claiming purposes.
    // This keeps `claim_tokens` usable without requiring the (stubbed/heavy) migrate_and_create_lp flow.
    require!(
        presale.phase == phase::LAUNCHABLE || presale.phase == phase::LAUNCHED,
        PresaleError::PresaleNotFinalized
    );
    presale.phase = phase::LAUNCHED;

    Ok(())
}

