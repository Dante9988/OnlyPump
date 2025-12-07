use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Token, TokenAccount},
};
use crate::state::data::*;
use crate::utils::assert_admin;

// ========== Account Structures ==========

#[derive(Accounts)]
pub struct InitializePlatform<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + PlatformConfig::LEN,
        seeds = [b"platform"],
        bump
    )]
    pub platform: Account<'info, PlatformConfig>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreatePresale<'info> {
    #[account(
        seeds = [b"platform"],
        bump = platform.bump
    )]
    pub platform: Account<'info, PlatformConfig>,
    #[account(
        init,
        payer = admin,
        space = 8 + Presale::LEN,
        seeds = [b"presale", mint.key().as_ref()],
        bump
    )]
    pub presale: Account<'info, Presale>,
    #[account(
        init,
        payer = admin,
        space = 8 + 165, // TokenAccount size
        seeds = [b"token_vault", presale.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = token_vault_authority,
    )]
    pub token_vault: Account<'info, TokenAccount>,
    #[account(
        seeds = [b"token_vault", presale.key().as_ref()],
        bump
    )]
    /// CHECK: Token vault authority PDA (same as token_vault for PDA-owned accounts)
    pub token_vault_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + 165, // TokenAccount size
        seeds = [b"ecosystem_vault", presale.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = ecosystem_vault_authority,
    )]
    pub ecosystem_vault: Account<'info, TokenAccount>,
    #[account(
        seeds = [b"ecosystem_vault", presale.key().as_ref()],
        bump
    )]
    /// CHECK: Ecosystem vault authority PDA
    pub ecosystem_vault_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = admin,
        space = 8,
        seeds = [b"public_sol_vault", presale.key().as_ref()],
        bump
    )]
    /// CHECK: Public SOL vault PDA
    pub public_sol_vault: UncheckedAccount<'info>,
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: Token mint
    pub mint: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> CreatePresale<'info> {
    pub fn validate(&self) -> Result<()> {
        assert_admin(&self.platform, &self.admin.key())?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct FundPresaleTokens<'info> {
    #[account(
        seeds = [b"platform"],
        bump = platform.bump
    )]
    pub platform: Account<'info, PlatformConfig>,
    #[account(mut)]
    pub presale: Account<'info, Presale>,
    #[account(
        mut,
        seeds = [b"token_vault", presale.key().as_ref()],
        bump
    )]
    pub token_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub from_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

impl<'info> FundPresaleTokens<'info> {
    pub fn validate(&self) -> Result<()> {
        assert_admin(&self.platform, &self.authority.key())?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct WhitelistUser<'info> {
    #[account(
        seeds = [b"platform"],
        bump = platform.bump
    )]
    pub platform: Account<'info, PlatformConfig>,
    #[account(mut)]
    pub presale: Account<'info, Presale>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + WhitelistEntry::LEN,
        seeds = [b"whitelist", presale.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub whitelist: Account<'info, WhitelistEntry>,
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: User to whitelist
    pub user: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

impl<'info> WhitelistUser<'info> {
    pub fn validate(&self) -> Result<()> {
        assert_admin(&self.platform, &self.admin.key())?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct ContributePublic<'info> {
    #[account(mut)]
    pub presale: Account<'info, Presale>,
    #[account(
        mut,
        seeds = [b"public_sol_vault", presale.key().as_ref()],
        bump
    )]
    /// CHECK: Public SOL vault
    pub public_sol_vault: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserPosition::LEN,
        seeds = [b"position", presale.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub user_position: Account<'info, UserPosition>,
    #[account(mut)]
    pub user: Signer<'info>,
    /// CHECK: Optional whitelist entry
    pub whitelist: Option<Account<'info, WhitelistEntry>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizePresale<'info> {
    #[account(
        seeds = [b"platform"],
        bump = platform.bump
    )]
    pub platform: Account<'info, PlatformConfig>,
    #[account(mut)]
    pub presale: Account<'info, Presale>,
    pub admin: Signer<'info>,
}

impl<'info> FinalizePresale<'info> {
    pub fn validate(&self) -> Result<()> {
        assert_admin(&self.platform, &self.admin.key())?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct MigrateAndCreateLp<'info> {
    #[account(
        seeds = [b"platform"],
        bump = platform.bump
    )]
    pub platform: Account<'info, PlatformConfig>,
    #[account(mut)]
    pub presale: Account<'info, Presale>,
    #[account(
        mut,
        seeds = [b"token_vault", presale.key().as_ref()],
        bump
    )]
    pub token_vault: Account<'info, TokenAccount>,
    #[account(
        seeds = [b"token_vault", presale.key().as_ref()],
        bump
    )]
    /// CHECK: Token vault authority PDA
    pub token_vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"public_sol_vault", presale.key().as_ref()],
        bump
    )]
    /// CHECK: Public SOL vault
    pub public_sol_vault: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"ecosystem_vault", presale.key().as_ref()],
        bump
    )]
    pub ecosystem_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    /// CHECK: LP token account (temporary, for LP creation)
    pub lp_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    /// CHECK: LP SOL account (temporary, for LP creation)
    pub lp_sol_account: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: Treasury account
    pub treasury: UncheckedAccount<'info>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> MigrateAndCreateLp<'info> {
    pub fn validate(&self) -> Result<()> {
        assert_admin(&self.platform, &self.admin.key())?;
        require!(
            self.treasury.key() == self.platform.treasury,
            crate::errors::PresaleError::Unauthorized
        );
        Ok(())
    }
}

#[derive(Accounts)]
pub struct ClaimTokens<'info> {
    #[account(mut)]
    pub presale: Account<'info, Presale>,
    #[account(
        mut,
        seeds = [b"token_vault", presale.key().as_ref()],
        bump
    )]
    pub token_vault: Account<'info, TokenAccount>,
    #[account(
        seeds = [b"token_vault", presale.key().as_ref()],
        bump
    )]
    /// CHECK: Token vault authority PDA
    pub token_vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"position", presale.key().as_ref(), user.key().as_ref()],
        bump = user_position.bump
    )]
    pub user_position: Account<'info, UserPosition>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

