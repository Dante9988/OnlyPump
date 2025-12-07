use anchor_lang::prelude::*;
use crate::state::accounts::CreatePresale;

/// Create a new presale for a token
/// Admin-only (owner or operator)
/// Creates Presale PDA and all vault PDAs (token_vault, public_sol_vault, ecosystem_vault)
/// PDA seeds: ["presale", mint_pubkey]
pub fn create_presale(
    ctx: Context<CreatePresale>,
    mint: Pubkey,
    authority: Pubkey,
    public_start_ts: i64,
    public_end_ts: i64,
    public_price_lamports_per_token: u64,
    hard_cap_lamports: u64,
) -> Result<()> {
    ctx.accounts.validate()?;

    let presale = &mut ctx.accounts.presale;
    presale.platform = ctx.accounts.platform.key();
    presale.authority = authority;
    presale.mint = mint;
    presale.public_start_ts = public_start_ts;
    presale.public_end_ts = public_end_ts;
    presale.public_token_cap = 400_000_000_000_000; // 400M tokens (assuming 6 decimals)
    presale.lp_token_allocation = 300_000_000_000_000; // 300M tokens
    presale.ecosystem_allocation = 100_000_000_000_000; // 100M tokens
    presale.public_price_lamports_per_token = public_price_lamports_per_token;
    presale.hard_cap_lamports = hard_cap_lamports;
    presale.public_raised_lamports = 0;
    presale.is_finalized = false;
    presale.is_migrated = false;
    presale.bump = ctx.bumps.presale;

    // Set ecosystem_vault and lp_authority from the accounts created
    presale.ecosystem_vault = ctx.accounts.ecosystem_vault.key();
    
    // Derive lp_authority PDA
    let (lp_authority, _) = Pubkey::find_program_address(
        &[b"lp_authority", presale.key().as_ref()],
        ctx.program_id,
    );
    presale.lp_authority = lp_authority;

    Ok(())
}

