use anchor_lang::prelude::*;
use crate::state::accounts::*;
use crate::errors::PresaleError;

// Phase constants for Presale.phase
pub mod phase {
    pub const PENDING: u8 = 0;
    pub const PUBLIC_ACTIVE: u8 = 1;
    pub const VOTING: u8 = 2;
    pub const LAUNCHABLE: u8 = 3;
    pub const REFUNDABLE: u8 = 4;
    pub const LAUNCHED: u8 = 5;
}

// Outcome constants for Presale.outcome
pub mod outcome {
    pub const UNDECIDED: u8 = 0;
    pub const LAUNCH: u8 = 1;
    pub const REFUND: u8 = 2;
}

/// Start a community vote for a presale.
/// Admin-controlled: backend decides when to trigger based on VIP/public state.
pub fn start_vote(ctx: Context<StartVote>, voting_ends_ts: i64) -> Result<()> {
    ctx.accounts.validate()?;

    let clock = Clock::get()?;
    require!(
        voting_ends_ts > clock.unix_timestamp,
        PresaleError::PresaleNotActive
    );

    let presale = &mut ctx.accounts.presale;
    presale.phase = phase::VOTING;
    presale.vote_yes_weight = 0;
    presale.vote_no_weight = 0;
    presale.voting_ends_ts = voting_ends_ts;
    presale.outcome = outcome::UNDECIDED;

    Ok(())
}

/// Cast a vote to either launch or refund.
/// Weight is equal to the user's public contribution lamports.
pub fn cast_vote(ctx: Context<CastVote>, support_launch: bool) -> Result<()> {
    let presale = &mut ctx.accounts.presale;
    let user_position = &mut ctx.accounts.user_position;

    require!(presale.phase == phase::VOTING, PresaleError::PresaleNotActive);

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp <= presale.voting_ends_ts,
        PresaleError::PresaleNotActive
    );

    // Ensure the signer matches the recorded user
    require_keys_eq!(
        user_position.user,
        ctx.accounts.voter.key(),
        PresaleError::Unauthorized
    );

    // Prevent double-voting
    require!(!user_position.has_voted, PresaleError::Unauthorized);

    let weight = user_position.public_contribution_lamports;
    require!(weight > 0, PresaleError::NothingToClaim);

    if support_launch {
        presale.vote_yes_weight = presale
            .vote_yes_weight
            .checked_add(weight)
            .ok_or(PresaleError::HardCapExceeded)?;
    } else {
        presale.vote_no_weight = presale
            .vote_no_weight
            .checked_add(weight)
            .ok_or(PresaleError::HardCapExceeded)?;
    }

    user_position.has_voted = true;

    Ok(())
}

/// Resolve the vote after voting_ends_ts has passed.
/// If yes > no → Launchable; otherwise → Refundable.
pub fn resolve_vote(ctx: Context<ResolveVote>) -> Result<()> {
    let presale = &mut ctx.accounts.presale;
    let clock = Clock::get()?;

    require!(presale.phase == phase::VOTING, PresaleError::PresaleNotActive);
    require!(
        clock.unix_timestamp >= presale.voting_ends_ts,
        PresaleError::PresaleNotActive
    );

    if presale.vote_yes_weight > presale.vote_no_weight {
        presale.outcome = outcome::LAUNCH;
        presale.phase = phase::LAUNCHABLE;
        // Give creator 24h after max(tge_ts, now) to launch
        let base_ts = if clock.unix_timestamp > presale.tge_ts {
            clock.unix_timestamp
        } else {
            presale.tge_ts
        };
        presale.launch_deadline_ts = base_ts + 24 * 60 * 60;
        presale.refund_enabled = false;
    } else {
        presale.outcome = outcome::REFUND;
        presale.phase = phase::REFUNDABLE;
        presale.refund_enabled = true;
    }

    Ok(())
}

/// If a presale is launchable but the creator failed to launch before the deadline,
/// enable refunds.
pub fn enable_refunds_if_deadline_passed(
    ctx: Context<EnableRefundsIfDeadlinePassed>,
) -> Result<()> {
    let presale = &mut ctx.accounts.presale;
    let clock = Clock::get()?;

    require!(presale.phase == phase::LAUNCHABLE, PresaleError::PresaleNotActive);
    require!(
        clock.unix_timestamp > presale.launch_deadline_ts,
        PresaleError::PresaleNotActive
    );

    presale.phase = phase::REFUNDABLE;
    presale.refund_enabled = true;
    presale.outcome = outcome::REFUND;

    Ok(())
}

/// Allow users to reclaim their SOL contributions when refunds are enabled.
pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
    let presale = &mut ctx.accounts.presale;
    let public_sol_vault = &mut ctx.accounts.public_sol_vault;
    let user_position = &mut ctx.accounts.user_position;
    let user = &mut ctx.accounts.user;

    require!(presale.refund_enabled, PresaleError::PresaleNotMigrated);
    require!(
        presale.phase == phase::REFUNDABLE,
        PresaleError::PresaleNotMigrated
    );

    // Ensure the signer matches the recorded user
    require_keys_eq!(
        user_position.user,
        user.key(),
        PresaleError::Unauthorized
    );

    require!(!user_position.refunded, PresaleError::NothingToClaim);

    let amount = user_position.public_contribution_lamports;
    require!(amount > 0, PresaleError::NothingToClaim);

    // Transfer lamports from vault back to user
    **public_sol_vault.to_account_info().try_borrow_mut_lamports()? = public_sol_vault
        .to_account_info()
        .lamports()
        .checked_sub(amount)
        .ok_or(PresaleError::InsufficientFunds)?;

    **user.to_account_info().try_borrow_mut_lamports()? = user
        .to_account_info()
        .lamports()
        .checked_add(amount)
        .ok_or(PresaleError::InsufficientFunds)?;

    user_position.refunded = true;

    Ok(())
}


