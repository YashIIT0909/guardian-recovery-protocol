#![no_std]
#![no_main]

extern crate alloc;

use alloc::{format, vec::Vec};
use casper_contract::{
    contract_api::{runtime, storage},
    unwrap_or_revert::UnwrapOrRevert,
};
use casper_types::{
    account::AccountHash, ApiError, CLValue, Key, PublicKey, URef, U256,
};

// ============================================================================
// Error Codes
// ============================================================================
#[repr(u16)]
enum Error {
    NotAccountOwner = 1,
    AlreadyInitialized = 2,
    InvalidGuardianSet = 3,
    InvalidThreshold = 4,
    NotGuardian = 5,
    RecoveryExists = 6,
    RecoveryNotFound = 7,
    AlreadyApproved = 8,
    ThresholdNotMet = 9,
    NotInitialized = 10,
    InvalidAction = 11,
}

impl From<Error> for ApiError {
    fn from(error: Error) -> Self {
        ApiError::User(error as u16)
    }
}

// ============================================================================
// Storage Helpers
// ============================================================================
fn uref<T: casper_types::CLTyped + casper_types::bytesrepr::ToBytes>(v: T) -> URef {
    storage::new_uref(v)
}

fn read<T: casper_types::CLTyped + casper_types::bytesrepr::FromBytes>(k: &str) -> Option<T> {
    runtime::get_key(k)
        .and_then(|key| key.into_uref())
        .and_then(|uref| storage::read(uref).ok().flatten())
}

fn write<T: casper_types::CLTyped + casper_types::bytesrepr::ToBytes>(k: &str, v: T) {
    let uref = uref(v);
    runtime::put_key(k, Key::URef(uref));
}

// ============================================================================
// Session WASM Entry Point - Action-based dispatch
// Actions:
//   1 = initialize_guardians
//   2 = initiate_recovery  
//   3 = approve_recovery
//   4 = is_threshold_met (returns bool)
//   5 = finalize_recovery
//   6 = get_guardians (returns Vec<AccountHash>)
//   7 = get_threshold (returns u8)
//   8 = has_guardians (returns bool)
// ============================================================================
#[no_mangle]
pub extern "C" fn call() {
    let action: u8 = runtime::get_named_arg("action");
    
    match action {
        1 => action_initialize_guardians(),
        2 => action_initiate_recovery(),
        3 => action_approve_recovery(),
        4 => action_is_threshold_met(),
        5 => action_finalize_recovery(),
        6 => action_get_guardians(),
        7 => action_get_threshold(),
        8 => action_has_guardians(),
        _ => runtime::revert(Error::InvalidAction),
    }
}

// ============================================================================
// Action 1: Initialize guardians
// Args: account (AccountHash), guardians (Vec<AccountHash>), threshold (u8)
// ============================================================================
fn action_initialize_guardians() {
    let account: AccountHash = runtime::get_named_arg("account");
    let guardians: Vec<AccountHash> = runtime::get_named_arg("guardians");
    let threshold: u8 = runtime::get_named_arg("threshold");

    // Caller must be the account owner
    if runtime::get_caller() != account {
        runtime::revert(Error::NotAccountOwner);
    }

    // Minimum 2 guardians
    if guardians.len() < 2 {
        runtime::revert(Error::InvalidGuardianSet);
    }

    // Threshold validation
    if threshold == 0 || threshold as usize > guardians.len() {
        runtime::revert(Error::InvalidThreshold);
    }

    // Check if already initialized
    let init_key = format!("grp_init_{}", account);
    if read::<bool>(&init_key).unwrap_or(false) {
        runtime::revert(Error::AlreadyInitialized);
    }

    // Store guardians
    write(&format!("grp_guardians_{}", account), guardians);
    write(&format!("grp_threshold_{}", account), threshold);
    write(&init_key, true);
}

// ============================================================================
// Action 2: Initiate recovery
// Args: account (AccountHash), new_public_key (PublicKey)
// ============================================================================
fn action_initiate_recovery() {
    let account: AccountHash = runtime::get_named_arg("account");
    let new_key: PublicKey = runtime::get_named_arg("new_public_key");

    // Check account is initialized
    let init_key = format!("grp_init_{}", account);
    if !read::<bool>(&init_key).unwrap_or(false) {
        runtime::revert(Error::NotInitialized);
    }

    // Check no active recovery
    let active_key = format!("grp_active_{}", account);
    if read::<U256>(&active_key).is_some() {
        runtime::revert(Error::RecoveryExists);
    }

    // Generate recovery ID
    let counter_key = "grp_counter";
    let id: U256 = read(counter_key).unwrap_or(U256::zero()) + U256::one();
    write(counter_key, id);

    // Store recovery data
    write(&format!("grp_rec_{}_account", id), account);
    write(&format!("grp_rec_{}_new_key", id), new_key);
    write(&format!("grp_rec_{}_approval_count", id), 0u8);
    write(&format!("grp_rec_{}_approved", id), false);

    // Mark as active recovery for this account
    write(&active_key, id);
}

// ============================================================================
// Action 3: Approve recovery
// Args: recovery_id (U256)
// ============================================================================
fn action_approve_recovery() {
    let id: U256 = runtime::get_named_arg("recovery_id");
    let caller = runtime::get_caller();

    // Get recovery account
    let account: AccountHash = read(&format!("grp_rec_{}_account", id))
        .unwrap_or_revert_with(Error::RecoveryNotFound);

    // Check caller is a guardian
    let guardians: Vec<AccountHash> = read(&format!("grp_guardians_{}", account))
        .unwrap_or_revert_with(Error::NotGuardian);

    if !guardians.contains(&caller) {
        runtime::revert(Error::NotGuardian);
    }

    // Check not already approved by this guardian
    let approver_key = format!("grp_rec_{}_approver_{}", id, caller);
    if read::<bool>(&approver_key).unwrap_or(false) {
        runtime::revert(Error::AlreadyApproved);
    }

    // Mark this guardian as approved
    write(&approver_key, true);

    // Increment approval count
    let count_key = format!("grp_rec_{}_approval_count", id);
    let current_count: u8 = read(&count_key).unwrap_or(0);
    let new_count = current_count + 1;
    write(&count_key, new_count);

    // Check if threshold met
    let threshold: u8 = read(&format!("grp_threshold_{}", account)).unwrap_or(2);
    if new_count >= threshold {
        write(&format!("grp_rec_{}_approved", id), true);
    }
}

// ============================================================================
// Action 4: Check if threshold is met
// Args: recovery_id (U256)
// Returns: bool
// ============================================================================
fn action_is_threshold_met() {
    let id: U256 = runtime::get_named_arg("recovery_id");

    // Check recovery exists
    let _account: AccountHash = read(&format!("grp_rec_{}_account", id))
        .unwrap_or_revert_with(Error::RecoveryNotFound);

    let approved: bool = read(&format!("grp_rec_{}_approved", id)).unwrap_or(false);
    runtime::ret(CLValue::from_t(approved).unwrap_or_revert());
}

// ============================================================================
// Action 5: Finalize recovery (mark complete, clear active)
// Args: recovery_id (U256)
// ============================================================================
fn action_finalize_recovery() {
    let id: U256 = runtime::get_named_arg("recovery_id");

    let account: AccountHash = read(&format!("grp_rec_{}_account", id))
        .unwrap_or_revert_with(Error::RecoveryNotFound);

    let approved: bool = read(&format!("grp_rec_{}_approved", id)).unwrap_or(false);
    if !approved {
        runtime::revert(Error::ThresholdNotMet);
    }

    // Clear active recovery
    let active_key = format!("grp_active_{}", account);
    runtime::remove_key(&active_key);
}

// ============================================================================
// Action 6: Get guardians
// Args: account (AccountHash)
// Returns: Vec<AccountHash>
// ============================================================================
fn action_get_guardians() {
    let account: AccountHash = runtime::get_named_arg("account");
    let guardians: Vec<AccountHash> = read(&format!("grp_guardians_{}", account))
        .unwrap_or_revert_with(Error::NotInitialized);
    runtime::ret(CLValue::from_t(guardians).unwrap_or_revert());
}

// ============================================================================
// Action 7: Get threshold
// Args: account (AccountHash)
// Returns: u8
// ============================================================================
fn action_get_threshold() {
    let account: AccountHash = runtime::get_named_arg("account");
    let threshold: u8 = read(&format!("grp_threshold_{}", account))
        .unwrap_or_revert_with(Error::NotInitialized);
    runtime::ret(CLValue::from_t(threshold).unwrap_or_revert());
}

// ============================================================================
// Action 8: Has guardians
// Args: account (AccountHash)
// Returns: bool
// ============================================================================
fn action_has_guardians() {
    let account: AccountHash = runtime::get_named_arg("account");
    let has: bool = read::<bool>(&format!("grp_init_{}", account)).unwrap_or(false);
    runtime::ret(CLValue::from_t(has).unwrap_or_revert());
}
