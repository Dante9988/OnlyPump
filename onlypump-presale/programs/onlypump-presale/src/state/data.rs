use anchor_lang::prelude::*;

// ========== Account Data Structures ==========

#[account]
pub struct PlatformConfig {
    pub owner: Pubkey,
    pub operator: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub bump: u8,
}

impl PlatformConfig {
    pub const LEN: usize = 32 + 32 + 32 + 2 + 1; // owner + operator + treasury + fee_bps + bump
}

#[account]
pub struct Presale {
    pub platform: Pubkey,
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub public_start_ts: i64,
    pub public_end_ts: i64,
    /// Token Generation Event timestamp (when creator is expected to launch)
    pub tge_ts: i64,
    pub public_token_cap: u64,              // 400M tokens
    pub lp_token_allocation: u64,           // 300M tokens
    pub ecosystem_allocation: u64,          // 100M tokens
    pub public_price_lamports_per_token: u64,
    /// Public presale hard cap (in lamports)
    pub hard_cap_lamports: u64,
    pub public_raised_lamports: u64,
    /// Total VIP raise reflected on-chain (optional, can be updated by admin)
    pub vip_raised_lamports: u64,
    pub is_finalized: bool,
    pub is_migrated: bool,
    /// Current presale phase (0 = Pending, 1 = PublicActive, 2 = Voting, 3 = Launchable, 4 = Refundable, 5 = Launched)
    pub phase: u8,
    /// Voting weights for launch vs refund decisions
    pub vote_yes_weight: u64,
    pub vote_no_weight: u64,
    /// Voting end timestamp
    pub voting_ends_ts: i64,
    /// Whether refunds are currently enabled
    pub refund_enabled: bool,
    /// Deadline by which creator must launch after presale succeeds
    pub launch_deadline_ts: i64,
    /// Vote outcome (0 = Undecided, 1 = Launch, 2 = Refund)
    pub outcome: u8,
    pub ecosystem_vault: Pubkey,
    pub lp_authority: Pubkey,
    pub bump: u8,
}

impl Presale {
    // 3 * Pubkey (platform, authority, mint)
    // 3 * i64 (public_start_ts, public_end_ts, tge_ts)
    // 4 * u64 (caps, price, hard cap, public_raised)
    // 1 * u64 (vip_raised_lamports)
    // 2 * bool (is_finalized, is_migrated)
    // 1 * u8 (phase)
    // 2 * u64 (vote_yes_weight, vote_no_weight)
    // 2 * i64 (voting_ends_ts, launch_deadline_ts)
    // 1 * bool (refund_enabled)
    // 1 * u8 (outcome)
    // 2 * Pubkey (ecosystem_vault, lp_authority)
    // 1 * u8 (bump)
    // Total bytes calculated explicitly:
    // 3*32 + 3*8 + 5*8 + 2*1 + 1 + 2*8 + 2*8 + 1 + 1 + 2*32 + 1 = 323 bytes
    pub const LEN: usize = 32  // platform
        + 32                   // authority
        + 32                   // mint
        + 8                    // public_start_ts
        + 8                    // public_end_ts
        + 8                    // tge_ts
        + 8                    // public_token_cap
        + 8                    // lp_token_allocation
        + 8                    // ecosystem_allocation
        + 8                    // public_price_lamports_per_token
        + 8                    // hard_cap_lamports
        + 8                    // public_raised_lamports
        + 8                    // vip_raised_lamports
        + 1                    // is_finalized
        + 1                    // is_migrated
        + 1                    // phase
        + 8                    // vote_yes_weight
        + 8                    // vote_no_weight
        + 8                    // voting_ends_ts
        + 1                    // refund_enabled
        + 8                    // launch_deadline_ts
        + 1                    // outcome
        + 32                   // ecosystem_vault
        + 32                   // lp_authority
        + 1;                   // bump
}

#[account]
pub struct UserPosition {
    pub presale: Pubkey,
    pub user: Pubkey,
    pub public_contribution_lamports: u64,
    pub tokens_allocated: u64,
    pub tokens_claimed: u64,
    pub refunded: bool,
    /// Whether this position has already voted in the current vote
    pub has_voted: bool,
    pub bump: u8,
}

impl UserPosition {
    pub const LEN: usize = 32 + 32 + 8 + 8 + 8 + 1 + 1 + 1;
}

#[account]
pub struct WhitelistEntry {
    pub presale: Pubkey,
    pub user: Pubkey,
    pub tier: u8,
    pub max_contribution_lamports: u64,
    pub bump: u8,
}

impl WhitelistEntry {
    pub const LEN: usize = 32 + 32 + 1 + 8 + 1;
}

// ========== VIP Structures (Placeholders for Future) ==========

#[account]
pub struct InfluencerConfig {
    pub creator: Pubkey,
    pub presale: Pubkey,
    pub creator_share_bps: u16,
    pub vip_share_from_creator_bps: u16,  // 10% = 1000
    pub vip_share_from_platform_bps: u16, // 10% = 1000
    pub bump: u8,
}

impl InfluencerConfig {
    pub const LEN: usize = 32 + 32 + 2 + 2 + 2 + 1;
}

#[account]
pub struct VipPool {
    pub presale: Pubkey,
    pub total_contributions: u64,
    pub bump: u8,
}

impl VipPool {
    pub const LEN: usize = 32 + 8 + 1;
}

#[account]
pub struct VipPosition {
    pub vip_pool: Pubkey,
    pub user: Pubkey,
    pub contribution_lamports: u64,
    pub rewards_earned: u64,
    pub bump: u8,
}

impl VipPosition {
    pub const LEN: usize = 32 + 32 + 8 + 8 + 1;
}

