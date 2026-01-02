//! SentinelX - Shared Types (Simplified)
//!
//! Minimal shared types for the recovery_registry contract.
//! Session WASMs don't need this library - they're self-contained.

#![cfg_attr(not(feature = "std"), no_std)]

extern crate alloc;

pub mod constants;
pub mod errors;

pub use constants::*;
pub use errors::*;
