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
    pub public_token_cap: u64,              // 400M tokens
    pub lp_token_allocation: u64,           // 300M tokens
    pub ecosystem_allocation: u64,          // 100M tokens
    pub public_price_lamports_per_token: u64,
    pub hard_cap_lamports: u64,
    pub public_raised_lamports: u64,
    pub is_finalized: bool,
    pub is_migrated: bool,
    pub ecosystem_vault: Pubkey,
    pub lp_authority: Pubkey,
    pub bump: u8,
}

impl Presale {
    pub const LEN: usize = 32 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 1 + 32 + 32 + 1;
}

#[account]
pub struct UserPosition {
    pub presale: Pubkey,
    pub user: Pubkey,
    pub public_contribution_lamports: u64,
    pub tokens_allocated: u64,
    pub tokens_claimed: u64,
    pub refunded: bool,
    pub bump: u8,
}

impl UserPosition {
    pub const LEN: usize = 32 + 32 + 8 + 8 + 8 + 1 + 1;
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

