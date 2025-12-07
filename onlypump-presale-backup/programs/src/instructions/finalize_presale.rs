use anchor_lang::prelude::*;
use crate::state::accounts::FinalizePresale;
use crate::errors::PresaleError;
use crate::events::FinalizePresaleEvent;

/// Finalize the presale
/// Admin-only
/// Can only be called after public_end_ts
/// Sets is_finalized = true
pub fn finalize_presale(ctx: Context<FinalizePresale>) -> Result<()> {
    ctx.accounts.validate()?;

    let clock = Clock::get()?;
    let presale = &mut ctx.accounts.presale;

    require!(
        clock.unix_timestamp >= presale.public_end_ts,
        PresaleError::PresaleNotFinalized
    );
    require!(!presale.is_finalized, PresaleError::PresaleAlreadyFinalized);

    presale.is_finalized = true;

    emit!(FinalizePresaleEvent {
        presale: presale.key(),
        total_raised: presale.public_raised_lamports,
    });

    Ok(())
}

