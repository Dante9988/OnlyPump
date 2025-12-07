use anchor_lang::prelude::*;

#[event]
pub struct ContributePublicEvent {
    pub user: Pubkey,
    pub presale: Pubkey,
    pub amount_lamports: u64,
    pub tokens_allocated: u64,
    pub total_raised: u64,
}

#[event]
pub struct FinalizePresaleEvent {
    pub presale: Pubkey,
    pub total_raised: u64,
}

#[event]
pub struct MigrateAndCreateLpEvent {
    pub presale: Pubkey,
    pub lp_tokens: u64,
    pub lp_sol: u64,
    pub ecosystem_tokens: u64,
    pub remaining_sol_to_treasury: u64,
}

#[event]
pub struct ClaimTokensEvent {
    pub user: Pubkey,
    pub presale: Pubkey,
    pub tokens_claimed: u64,
}

