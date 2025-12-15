use anchor_lang::prelude::*;
use crate::state::accounts::CreatePresale;

/// Create a new presale for a token (token doesn't need to exist yet)
/// Admin-only (owner or operator)
/// Creates Presale PDA and public_sol_vault (SOL vault only)
/// Token vaults will be created later via initialize_vaults after token exists
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
    // For now, default TGE to public_end_ts; backend can adjust via future admin instruction.
    presale.tge_ts = public_end_ts;
    presale.public_token_cap = 400_000_000_000_000; // 400M tokens (assuming 6 decimals)
    presale.lp_token_allocation = 300_000_000_000_000; // 300M tokens
    presale.ecosystem_allocation = 100_000_000_000_000; // 100M tokens
    presale.public_price_lamports_per_token = public_price_lamports_per_token;
    presale.hard_cap_lamports = hard_cap_lamports;
    presale.public_raised_lamports = 0;
    presale.vip_raised_lamports = 0;
    presale.is_finalized = false;
    presale.is_migrated = false;
    // Start directly in public active phase; VIP/voting handled off-chain/admin-triggered.
    presale.phase = crate::instructions::vote::phase::PUBLIC_ACTIVE;
    presale.vote_yes_weight = 0;
    presale.vote_no_weight = 0;
    presale.voting_ends_ts = 0;
    presale.refund_enabled = false;
    presale.launch_deadline_ts = 0;
    presale.outcome = crate::instructions::vote::outcome::UNDECIDED;
    presale.bump = ctx.bumps.presale;

    // ecosystem_vault and lp_authority will be set by initialize_vaults
    presale.ecosystem_vault = Pubkey::default();
    
    // Derive lp_authority PDA (will be same after initialize_vaults)
    let (lp_authority, _) = Pubkey::find_program_address(
        &[b"lp_authority", presale.key().as_ref()],
        ctx.program_id,
    );
    presale.lp_authority = lp_authority;

    Ok(())
}

