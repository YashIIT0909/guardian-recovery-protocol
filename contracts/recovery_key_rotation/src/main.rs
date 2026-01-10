//! Recovery Key Rotation Contract
//!
//! This contract performs a complete account key rotation for recovery:
//! 1. Adds a new associated key with specified weight
//! 2. Updates thresholds to give the new key control
//! 3. Removes the old (lost) associated key
//!
//! All operations happen in a single deploy, requiring multi-sig from guardians.

#![no_std]
#![no_main]

#[cfg(not(target_arch = "wasm32"))]
compile_error!("target arch should be wasm32: compile with '--target wasm32-unknown-unknown'");

extern crate alloc;

use casper_contract::contract_api::{account, runtime};
use casper_contract::unwrap_or_revert::UnwrapOrRevert;
use casper_types::account::{ActionType, Weight};
use casper_types::{ApiError, Key};

// Runtime argument names
const ARG_NEW_KEY: &str = "new_key";
const ARG_NEW_KEY_WEIGHT: &str = "new_key_weight";
const ARG_OLD_KEY: &str = "old_key";
const ARG_DEPLOYMENT_THRESHOLD: &str = "deployment_threshold";
const ARG_KEY_MANAGEMENT_THRESHOLD: &str = "key_management_threshold";

// Custom errors
#[repr(u16)]
enum RecoveryError {
    InvalidNewKey = 1,
    InvalidOldKey = 2,
    AddKeyFailed = 3,
    UpdateThresholdsFailed = 4,
    RemoveKeyFailed = 5,
}

impl From<RecoveryError> for ApiError {
    fn from(error: RecoveryError) -> Self {
        ApiError::User(error as u16)
    }
}

#[no_mangle]
pub extern "C" fn call() {
    // 1. Get runtime arguments
    let new_key: Key = runtime::get_named_arg(ARG_NEW_KEY);
    let new_key_weight: u8 = runtime::get_named_arg(ARG_NEW_KEY_WEIGHT);
    let old_key: Key = runtime::get_named_arg(ARG_OLD_KEY);
    let deployment_threshold: u8 = runtime::get_named_arg(ARG_DEPLOYMENT_THRESHOLD);
    let key_management_threshold: u8 = runtime::get_named_arg(ARG_KEY_MANAGEMENT_THRESHOLD);

    // 2. Validate keys are account hashes
    let new_account_hash = match new_key {
        Key::Account(hash) => hash,
        _ => runtime::revert(RecoveryError::InvalidNewKey),
    };

    let old_account_hash = match old_key {
        Key::Account(hash) => hash,
        _ => runtime::revert(RecoveryError::InvalidOldKey),
    };

    // Step 1: Add the new key with specified weight
    // This gives the new key permission to participate in account operations
    account::add_associated_key(new_account_hash, Weight::new(new_key_weight))
        .unwrap_or_revert_with(RecoveryError::AddKeyFailed);

    // Step 2: Update thresholds
    // Lower the thresholds so the new key has control
    // Do key management first, then deployment
    account::set_action_threshold(ActionType::KeyManagement, Weight::new(key_management_threshold))
        .unwrap_or_revert_with(RecoveryError::UpdateThresholdsFailed);
    
    account::set_action_threshold(ActionType::Deployment, Weight::new(deployment_threshold))
        .unwrap_or_revert_with(RecoveryError::UpdateThresholdsFailed);

    // Step 3: Remove the old key
    // The old (lost) key is removed from the account
    // Note: Using try pattern as removal might fail if key doesn't exist
    let _ = account::remove_associated_key(old_account_hash);
}
