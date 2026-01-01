//! Error types for Guardian Recovery Protocol.

use casper_types::ApiError;

/// Errors for recovery_registry contract
#[repr(u16)]
pub enum GuardianError {
    /// Invalid guardian setup (less than 2 guardians or duplicates)
    InvalidGuardianSetup = 1,
    /// Guardians already initialized for this account
    AlreadyInitialized = 2,
    /// Account not found in registry
    AccountNotFound = 3,
    /// Invalid threshold value
    InvalidThreshold = 4,
}

impl From<GuardianError> for ApiError {
    fn from(error: GuardianError) -> Self {
        ApiError::User(error as u16)
    }
}
