use anchor_lang::prelude::*;
use crate::state::data::PlatformConfig;
use crate::errors::PresaleError;

/// Helper function to check if signer is admin (owner or operator)
pub fn assert_admin(platform: &PlatformConfig, signer: &Pubkey) -> Result<()> {
    require!(
        *signer == platform.owner || *signer == platform.operator,
        PresaleError::Unauthorized
    );
    Ok(())
}

