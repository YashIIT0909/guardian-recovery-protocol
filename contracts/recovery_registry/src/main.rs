#![no_std]
#![no_main]

extern crate alloc;

use alloc::{string::String, vec::Vec};
// runtime: Interact with blockchain runtime (get arguments, caller info)
// storage: Read/write persistent data
// UnwrapOrRevert: Helper trait to unwrap or revert transaction on error
use casper_contract::{
    contract_api::{runtime, storage},
    unwrap_or_revert::UnwrapOrRevert,
};

// AccountHash: Unique identifier for accounts
// CLValue: Casper's serialized value type
// Key: Pointer to blockchain storage
// PublicKey: Cryptographic public key
// URef: Unforgeable reference (storage pointer with access rights)
// U256: 256-bit unsigned integer
use casper_types::{
    account::AccountHash, CLValue, Key, PublicKey, URef, U256,
};

/// --------------------
/// Errors
/// --------------------
#[repr(u16)]
enum Error {
    NotAccountOwner = 1,
    AlreadyInitialized,
    InvalidGuardianSet,
    InvalidThreshold,
    NotGuardian,
    RecoveryExists,
    RecoveryNotFound,
    AlreadyApproved,
    ThresholdNotMet,
}

/// --------------------
/// Recovery struct
/// --------------------
#[derive(Clone)]
struct Recovery {
    account: AccountHash,
    new_public_key: PublicKey,
    approvals: Vec<AccountHash>,
    approved: bool,
}

/// --------------------
/// Helpers
/// --------------------
fn key(name: &str) -> String {
    name.to_string()
}

fn uref<T: casper_types::CLTyped + casper_types::bytesrepr::ToBytes>(v: T) -> URef {
    storage::new_uref(v)
}

fn read<T: casper_types::CLTyped + casper_types::bytesrepr::FromBytes>(k: &str) -> Option<T> {
    runtime::get_key(k)
        .and_then(|k| k.into_uref())
        .and_then(|u| storage::read(u).ok().flatten())
}

/// --------------------
/// 1️⃣ Initialize guardians
/// --------------------
#[no_mangle]
pub extern "C" fn initialize_guardians() {
    let account: AccountHash = runtime::get_named_arg("account");
    let guardians: Vec<AccountHash> = runtime::get_named_arg("guardians");
    let threshold: u8 = runtime::get_named_arg("threshold");

    if runtime::get_caller() != account {
        runtime::revert(Error::NotAccountOwner);
    }

    if guardians.len() < 2 {
        runtime::revert(Error::InvalidGuardianSet);
    }

    if threshold == 0 || threshold as usize > guardians.len() {
        runtime::revert(Error::InvalidThreshold);
    }

    if read::<bool>(&format!("init_{}", account)).unwrap_or(false) {
        runtime::revert(Error::AlreadyInitialized);
    }

    runtime::put_key(
        &format!("guardians_{}", account),
        Key::URef(uref(guardians)),
    );
    runtime::put_key(
        &format!("threshold_{}", account),
        Key::URef(uref(threshold)),
    );
    runtime::put_key(
        &format!("init_{}", account),
        Key::URef(uref(true)),
    );
}

/// --------------------
/// 2️⃣ Initiate recovery
/// --------------------
#[no_mangle]
pub extern "C" fn initiate_recovery() {
    let account: AccountHash = runtime::get_named_arg("account");
    let new_key: PublicKey = runtime::get_named_arg("new_public_key");

    if read::<U256>(&format!("active_recovery_{}", account)).is_some() {
        runtime::revert(Error::RecoveryExists);
    }

    let id: U256 = read("recovery_counter").unwrap_or(U256::zero()) + 1.into();
    runtime::put_key("recovery_counter", Key::URef(uref(id)));

    let recovery = Recovery {
        account,
        new_public_key: new_key,
        approvals: Vec::new(),
        approved: false,
    };

    runtime::put_key(
        &format!("recovery_{}", id),
        Key::URef(uref(recovery)),
    );
    runtime::put_key(
        &format!("active_recovery_{}", account),
        Key::URef(uref(id)),
    );
}

/// --------------------
/// 3️⃣ Approve recovery
/// --------------------
#[no_mangle]
pub extern "C" fn approve_recovery() {
    let id: U256 = runtime::get_named_arg("recovery_id");
    let caller = runtime::get_caller();

    let mut recovery: Recovery =
        read(&format!("recovery_{}", id)).unwrap_or_revert_with(Error::RecoveryNotFound);

    let guardians: Vec<AccountHash> =
        read(&format!("guardians_{}", recovery.account))
            .unwrap_or_revert_with(Error::NotGuardian);

    if !guardians.contains(&caller) {
        runtime::revert(Error::NotGuardian);
    }

    if recovery.approvals.contains(&caller) {
        runtime::revert(Error::AlreadyApproved);
    }

    recovery.approvals.push(caller);

    let threshold: u8 =
        read(&format!("threshold_{}", recovery.account)).unwrap();

    if recovery.approvals.len() as u8 >= threshold {
        recovery.approved = true;
    }

    runtime::put_key(
        &format!("recovery_{}", id),
        Key::URef(uref(recovery)),
    );
}

/// --------------------
/// 4️⃣ Check threshold
/// --------------------
#[no_mangle]
pub extern "C" fn is_threshold_met() {
    let id: U256 = runtime::get_named_arg("recovery_id");

    let recovery: Recovery =
        read(&format!("recovery_{}", id)).unwrap_or_revert_with(Error::RecoveryNotFound);

    runtime::ret(CLValue::from_t(recovery.approved).unwrap());
}

/// --------------------
/// 5️⃣ Finalize (mark only)
/// --------------------
#[no_mangle]
pub extern "C" fn finalize_recovery() {
    let id: U256 = runtime::get_named_arg("recovery_id");

    let recovery: Recovery =
        read(&format!("recovery_{}", id)).unwrap_or_revert_with(Error::RecoveryNotFound);

    if !recovery.approved {
        runtime::revert(Error::ThresholdNotMet);
    }

    runtime::put_key(
        &format!("active_recovery_{}", recovery.account),
        Key::URef(uref(())),
    );
}

/// --------------------
/// Required entrypoint
/// --------------------
#[no_mangle]
pub extern "C" fn call() {}
