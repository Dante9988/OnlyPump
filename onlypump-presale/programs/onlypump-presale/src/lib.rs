use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use state::accounts::*;

// NOTE: This must match the program ID used when deploying (see Anchor.toml)
declare_id!("5zqdoDng2LnQ7JbiemiRwzTaPnnEU4eMXMfCCF3P4xQQ");

#[program]
pub mod onlypump_presale {
    use super::*;

    /// Initialize the platform with owner, operator, treasury, and fee configuration
    pub fn initialize_platform(
        ctx: Context<InitializePlatform>,
        operator: Pubkey,
        treasury: Pubkey,
        fee_bps: u16,
    ) -> Result<()> {
        instructions::initialize_platform::initialize_platform(ctx, operator, treasury, fee_bps)
    }

    /// Create a new presale for a token (token doesn't need to exist yet)
    pub fn create_presale(
        ctx: Context<CreatePresale>,
        mint: Pubkey,
        authority: Pubkey,
        public_start_ts: i64,
        public_end_ts: i64,
        public_price_lamports_per_token: u64,
        hard_cap_lamports: u64,
    ) -> Result<()> {
        instructions::create_presale::create_presale(
            ctx,
            mint,
            authority,
            public_start_ts,
            public_end_ts,
            public_price_lamports_per_token,
            hard_cap_lamports,
        )
    }

    /// Initialize token vaults for a presale (call after token is created)
    pub fn initialize_vaults(ctx: Context<InitializeVaults>) -> Result<()> {
        instructions::initialize_vaults::initialize_vaults(ctx)
    }

    /// Fund the presale token vault with the required tokens (800M total)
    pub fn fund_presale_tokens(ctx: Context<FundPresaleTokens>, amount: u64) -> Result<()> {
        instructions::fund_presale_tokens::fund_presale_tokens(ctx, amount)
    }

    /// Withdraw collected SOL from presale to authority for token launch
    pub fn withdraw_for_launch(ctx: Context<WithdrawForLaunch>) -> Result<()> {
        instructions::withdraw_for_launch::withdraw_for_launch(ctx)
    }

    /// Whitelist a user for a presale
    pub fn whitelist_user(
        ctx: Context<WhitelistUser>,
        tier: u8,
        max_contribution_lamports: u64,
    ) -> Result<()> {
        instructions::whitelist_user::whitelist_user(ctx, tier, max_contribution_lamports)
    }

    /// User contributes SOL to the public presale
    pub fn contribute_public(ctx: Context<ContributePublic>, amount_lamports: u64) -> Result<()> {
        instructions::contribute_public::contribute_public(ctx, amount_lamports)
    }

    /// Finalize the presale
    pub fn finalize_presale(ctx: Context<FinalizePresale>) -> Result<()> {
        instructions::finalize_presale::finalize_presale(ctx)
    }

    /// Migrate presale and create LP
    pub fn migrate_and_create_lp(
        ctx: Context<MigrateAndCreateLp>,
        lp_sol_amount: u64,
    ) -> Result<()> {
        instructions::migrate_and_create_lp::migrate_and_create_lp(ctx, lp_sol_amount)
    }

    /// User claims their allocated tokens after migration
    pub fn claim_tokens(ctx: Context<ClaimTokens>) -> Result<()> {
        instructions::claim_tokens::claim_tokens(ctx)
    }

    /// Start a community vote for a presale (admin-triggered)
    pub fn start_vote(ctx: Context<StartVote>, voting_ends_ts: i64) -> Result<()> {
        instructions::vote::start_vote(ctx, voting_ends_ts)
    }

    /// Cast a vote to either launch or refund (stake-weighted)
    pub fn cast_vote(ctx: Context<CastVote>, support_launch: bool) -> Result<()> {
        instructions::vote::cast_vote(ctx, support_launch)
    }

    /// Resolve an ended vote, setting presale phase to Launchable or Refundable
    pub fn resolve_vote(ctx: Context<ResolveVote>) -> Result<()> {
        instructions::vote::resolve_vote(ctx)
    }

    /// If creator missed launch deadline, enable refunds
    pub fn enable_refunds_if_deadline_passed(
        ctx: Context<EnableRefundsIfDeadlinePassed>,
    ) -> Result<()> {
        instructions::vote::enable_refunds_if_deadline_passed(ctx)
    }

    /// Allow a user to reclaim their SOL when refunds are enabled
    pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
        instructions::vote::claim_refund(ctx)
    }
}
