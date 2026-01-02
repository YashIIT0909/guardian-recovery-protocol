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
        .and_then(|k| k.into_uref())
        .and_then(|u| storage::read(u).ok().flatten())
}

fn write<T: casper_types::CLTyped + casper_types::bytesrepr::ToBytes>(k: &str, v: T) {
    runtime::put_key(k, Key::URef(uref(v)));
}

// ============================================================================
// 1️⃣ Initialize guardians
// ============================================================================
#[no_mangle]
pub extern "C" fn initialize_guardians() {
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
    let init_key = format!("init_{}", account);
    if read::<bool>(&init_key).unwrap_or(false) {
        runtime::revert(Error::AlreadyInitialized);
    }

    // Store guardians
    write(&format!("guardians_{}", account), guardians);
    write(&format!("threshold_{}", account), threshold);
    write(&init_key, true);
}

// ============================================================================
// 2️⃣ Initiate recovery
// ============================================================================
#[no_mangle]
pub extern "C" fn initiate_recovery() {
    let account: AccountHash = runtime::get_named_arg("account");
    let new_key: PublicKey = runtime::get_named_arg("new_public_key");

    // Check account is initialized
    let init_key = format!("init_{}", account);
    if !read::<bool>(&init_key).unwrap_or(false) {
        runtime::revert(Error::NotInitialized);
    }

    // Check no active recovery
    let active_key = format!("active_recovery_{}", account);
    if read::<U256>(&active_key).is_some() {
        runtime::revert(Error::RecoveryExists);
    }

    // Generate recovery ID
    let counter_key = "recovery_counter";
    let id: U256 = read(counter_key).unwrap_or(U256::zero()) + U256::one();
    write(counter_key, id);

    // Store recovery data (as separate fields since we can't store custom structs)
    write(&format!("rec_{}_account", id), account);
    write(&format!("rec_{}_new_key", id), new_key);
    write(&format!("rec_{}_approval_count", id), 0u8);
    write(&format!("rec_{}_approved", id), false);

    // Mark as active recovery for this account
    write(&active_key, id);
}

// ============================================================================
// 3️⃣ Approve recovery
// ============================================================================
#[no_mangle]
pub extern "C" fn approve_recovery() {
    let id: U256 = runtime::get_named_arg("recovery_id");
    let caller = runtime::get_caller();

    // Get recovery account
    let account: AccountHash = read(&format!("rec_{}_account", id))
        .unwrap_or_revert_with(Error::RecoveryNotFound);

    // Check caller is a guardian
    let guardians: Vec<AccountHash> = read(&format!("guardians_{}", account))
        .unwrap_or_revert_with(Error::NotGuardian);

    if !guardians.contains(&caller) {
        runtime::revert(Error::NotGuardian);
    }

    // Check not already approved by this guardian
    let approver_key = format!("rec_{}_approver_{}", id, caller);
    if read::<bool>(&approver_key).unwrap_or(false) {
        runtime::revert(Error::AlreadyApproved);
    }

    // Mark this guardian as approved
    write(&approver_key, true);

    // Increment approval count
    let count_key = format!("rec_{}_approval_count", id);
    let current_count: u8 = read(&count_key).unwrap_or(0);
    let new_count = current_count + 1;
    write(&count_key, new_count);

    // Check if threshold met
    let threshold: u8 = read(&format!("threshold_{}", account)).unwrap_or(2);
    if new_count >= threshold {
        write(&format!("rec_{}_approved", id), true);
    }
}

// ============================================================================
// 4️⃣ Check if threshold is met
// ============================================================================
#[no_mangle]
pub extern "C" fn is_threshold_met() {
    let id: U256 = runtime::get_named_arg("recovery_id");

    // Check recovery exists
    let _account: AccountHash = read(&format!("rec_{}_account", id))
        .unwrap_or_revert_with(Error::RecoveryNotFound);

    let approved: bool = read(&format!("rec_{}_approved", id)).unwrap_or(false);

    runtime::ret(CLValue::from_t(approved).unwrap_or_revert());
}

// ============================================================================
// 5️⃣ Get recovery info
// ============================================================================
#[no_mangle]
pub extern "C" fn get_recovery_info() {
    let id: U256 = runtime::get_named_arg("recovery_id");

    let account: AccountHash = read(&format!("rec_{}_account", id))
        .unwrap_or_revert_with(Error::RecoveryNotFound);
    let approval_count: u8 = read(&format!("rec_{}_approval_count", id)).unwrap_or(0);
    let approved: bool = read(&format!("rec_{}_approved", id)).unwrap_or(false);

    // Return as tuple
    runtime::ret(CLValue::from_t((account, approval_count, approved)).unwrap_or_revert());
}

// ============================================================================
// 6️⃣ Finalize recovery (mark complete, clear active)
// ============================================================================
#[no_mangle]
pub extern "C" fn finalize_recovery() {
    let id: U256 = runtime::get_named_arg("recovery_id");

    let account: AccountHash = read(&format!("rec_{}_account", id))
        .unwrap_or_revert_with(Error::RecoveryNotFound);

    let approved: bool = read(&format!("rec_{}_approved", id)).unwrap_or(false);
    if !approved {
        runtime::revert(Error::ThresholdNotMet);
    }

    // Clear active recovery
    let active_key = format!("active_recovery_{}", account);
    runtime::remove_key(&active_key);
}

// ============================================================================
// Query: Get guardians
// ============================================================================
#[no_mangle]
pub extern "C" fn get_guardians() {
    let account: AccountHash = runtime::get_named_arg("account");
    let guardians: Vec<AccountHash> = read(&format!("guardians_{}", account))
        .unwrap_or_revert_with(Error::NotInitialized);
    runtime::ret(CLValue::from_t(guardians).unwrap_or_revert());
}

// ============================================================================
// Query: Get threshold
// ============================================================================
#[no_mangle]
pub extern "C" fn get_threshold() {
    let account: AccountHash = runtime::get_named_arg("account");
    let threshold: u8 = read(&format!("threshold_{}", account))
        .unwrap_or_revert_with(Error::NotInitialized);
    runtime::ret(CLValue::from_t(threshold).unwrap_or_revert());
}

// ============================================================================
// Query: Has guardians
// ============================================================================
#[no_mangle]
pub extern "C" fn has_guardians() {
    let account: AccountHash = runtime::get_named_arg("account");
    let has: bool = read::<bool>(&format!("init_{}", account)).unwrap_or(false);
    runtime::ret(CLValue::from_t(has).unwrap_or_revert());
}

// ============================================================================
// Required entry point
// ============================================================================
#[no_mangle]
pub extern "C" fn call() {}
