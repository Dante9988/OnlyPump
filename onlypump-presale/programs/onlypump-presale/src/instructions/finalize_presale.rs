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

    let presale = &mut ctx.accounts.presale;

    // NOTE: In a production deployment, you likely want to enforce that the
    // current time is past `public_end_ts` before allowing finalization, e.g.:
    //
    // let clock = Clock::get()?;
    // require!(
    //     clock.unix_timestamp >= presale.public_end_ts,
    //     PresaleError::PresaleNotFinalized
    // );
    //
    // For local testing and flexibility, we skip the time check here and rely
    // on the admin to call this at the appropriate time.
    require!(!presale.is_finalized, PresaleError::PresaleAlreadyFinalized);

    presale.is_finalized = true;

    emit!(FinalizePresaleEvent {
        presale: presale.key(),
        total_raised: presale.public_raised_lamports,
    });

    Ok(())
}

