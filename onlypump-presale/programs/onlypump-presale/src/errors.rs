use anchor_lang::prelude::*;

#[error_code]
pub enum PresaleError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Presale not active")]
    PresaleNotActive,
    #[msg("Presale not finalized")]
    PresaleNotFinalized,
    #[msg("Presale already finalized")]
    PresaleAlreadyFinalized,
    #[msg("Presale already migrated")]
    PresaleAlreadyMigrated,
    #[msg("Presale not migrated")]
    PresaleNotMigrated,
    #[msg("Hard cap exceeded")]
    HardCapExceeded,
    #[msg("Token cap exceeded")]
    TokenCapExceeded,
    #[msg("Contribution too large")]
    ContributionTooLarge,
    #[msg("Not whitelisted")]
    NotWhitelisted,
    #[msg("Nothing to claim")]
    NothingToClaim,
    #[msg("Insufficient funds")]
    InsufficientFunds,
}

