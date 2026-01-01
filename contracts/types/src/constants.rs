//! Constants for Guardian Recovery Protocol.

/// Minimum required guardians for an account
pub const MIN_GUARDIANS: usize = 2;

/// Storage key prefixes
pub mod storage_keys {
    /// Prefix for guardian list storage
    pub const GUARDIANS_PREFIX: &str = "guardians_";
    /// Prefix for threshold storage
    pub const THRESHOLD_PREFIX: &str = "threshold_";
    /// Prefix for initialization flag
    pub const INITIALIZED_PREFIX: &str = "init_";
}

/// Runtime argument names
pub mod runtime_args {
    pub const ARG_ACCOUNT_HASH: &str = "account_hash";
    pub const ARG_GUARDIANS: &str = "guardians";
    pub const ARG_THRESHOLD: &str = "threshold";
    pub const ARG_PUBLIC_KEY: &str = "public_key";
}
