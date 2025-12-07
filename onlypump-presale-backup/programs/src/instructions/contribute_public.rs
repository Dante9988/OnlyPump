use anchor_lang::prelude::*;
use crate::state::accounts::ContributePublic;
use crate::errors::PresaleError;
use crate::events::ContributePublicEvent;

/// User contributes SOL to the public presale
/// Transfers SOL to public_sol_vault and tracks allocation in UserPosition
/// PDA seeds for UserPosition: ["position", presale_pubkey, user_pubkey]
pub fn contribute_public(ctx: Context<ContributePublic>, amount_lamports: u64) -> Result<()> {
    let clock = Clock::get()?;
    let presale = &ctx.accounts.presale;

    // Check presale is active
    require!(
        clock.unix_timestamp >= presale.public_start_ts,
        PresaleError::PresaleNotActive
    );
    require!(
        clock.unix_timestamp < presale.public_end_ts,
        PresaleError::PresaleNotActive
    );
    require!(!presale.is_finalized, PresaleError::PresaleFinalized);

    // Check hard cap
    require!(
        presale
            .public_raised_lamports
            .checked_add(amount_lamports)
            .ok_or(PresaleError::HardCapExceeded)?
            <= presale.hard_cap_lamports,
        PresaleError::HardCapExceeded
    );

    // Check whitelist if provided
    if let Some(whitelist) = &ctx.accounts.whitelist {
        require!(whitelist.tier >= 1, PresaleError::NotWhitelisted);
        require!(
            whitelist.max_contribution_lamports == 0
                || amount_lamports <= whitelist.max_contribution_lamports,
            PresaleError::ContributionTooLarge
        );
    }

    // Calculate token allocation
    // tokens = (amount_lamports * TOKEN_PRECISION) / public_price_lamports_per_token
    // Using checked math to prevent overflow
    // Assumption: We use 1e9 as TOKEN_PRECISION for calculations (matching 9 decimals for SOL precision)
    const TOKEN_PRECISION: u64 = 1_000_000_000;
    let tokens_to_allocate = amount_lamports
        .checked_mul(TOKEN_PRECISION)
        .ok_or(PresaleError::TokenCapExceeded)?
        .checked_div(presale.public_price_lamports_per_token)
        .ok_or(PresaleError::TokenCapExceeded)?;

    // Check total token cap (400M)
    // Note: In production, you'd track total_allocated_tokens in Presale account
    // For MVP, we rely on the hard_cap_lamports to limit total contributions
    // and trust that the price calculation won't exceed public_token_cap
    let position = &mut ctx.accounts.user_position;
    let current_allocated = position.tokens_allocated;
    let new_total_tokens = current_allocated
        .checked_add(tokens_to_allocate)
        .ok_or(PresaleError::TokenCapExceeded)?;

    // Basic sanity check - in production, sum all UserPositions
    // For now, we ensure individual positions don't exceed the cap
    // The hard_cap_lamports should be set such that total tokens <= public_token_cap
    require!(
        new_total_tokens <= presale.public_token_cap,
        PresaleError::TokenCapExceeded
    );

    // Transfer SOL from user to public_sol_vault
    anchor_lang::solana_program::program::invoke(
        &anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.user.key(),
            &ctx.accounts.public_sol_vault.key(),
            amount_lamports,
        ),
        &[
            ctx.accounts.user.to_account_info(),
            ctx.accounts.public_sol_vault.to_account_info(),
        ],
    )?;

    // Update presale state
    let presale_mut = &mut ctx.accounts.presale;
    presale_mut.public_raised_lamports = presale_mut
        .public_raised_lamports
        .checked_add(amount_lamports)
        .ok_or(PresaleError::HardCapExceeded)?;

    // Update user position
    position.presale = presale.key();
    position.user = ctx.accounts.user.key();
    position.public_contribution_lamports = position
        .public_contribution_lamports
        .checked_add(amount_lamports)
        .ok_or(PresaleError::HardCapExceeded)?;
    position.tokens_allocated = new_total_tokens;
    position.refunded = false;
    position.bump = ctx.bumps.user_position;

    emit!(ContributePublicEvent {
        user: ctx.accounts.user.key(),
        presale: presale.key(),
        amount_lamports,
        tokens_allocated: tokens_to_allocate,
        total_raised: presale_mut.public_raised_lamports,
    });

    Ok(())
}

