/**
 * Validation utilities for Casper addresses and public keys
 */

/**
 * Validates a Casper public key
 * Casper public keys are hex strings that start with:
 * - "01" for Ed25519 keys (followed by 64 hex chars = 32 bytes)
 * - "02" for Secp256k1 keys (followed by 66 hex chars = 33 bytes)
 * 
 * Total length: 66 or 68 characters
 */
export function isValidCasperPublicKey(key: string): boolean {
  if (!key) return false
  
  // Remove any whitespace
  const cleanKey = key.trim()
  
  // Check if it's a valid hex string
  const hexRegex = /^[0-9a-fA-F]+$/
  if (!hexRegex.test(cleanKey)) return false
  
  // Ed25519: 01 + 64 hex chars (32 bytes)
  if (cleanKey.startsWith('01') && cleanKey.length === 66) {
    return true
  }
  
  // Secp256k1: 02 + 66 hex chars (33 bytes)
  if (cleanKey.startsWith('02') && cleanKey.length === 68) {
    return true
  }
  
  return false
}

/**
 * Validates a Casper account hash
 * Account hashes are hex strings prefixed with "account-hash-"
 */
export function isValidCasperAccountHash(accountHash: string): boolean {
  if (!accountHash) return false
  
  const cleanHash = accountHash.trim()
  
  // Check for account-hash prefix
  if (!cleanHash.startsWith('account-hash-')) return false
  
  // Extract the hash part
  const hashPart = cleanHash.substring(13)
  
  // Should be 64 hex characters (32 bytes)
  const hexRegex = /^[0-9a-fA-F]{64}$/
  return hexRegex.test(hashPart)
}

/**
 * Validates a Casper address (either public key or account hash)
 */
export function isValidCasperAddress(address: string): boolean {
  return isValidCasperPublicKey(address) || isValidCasperAccountHash(address)
}

/**
 * Get validation error message for an address
 */
export function getAddressValidationError(address: string): string | null {
  if (!address || address.trim().length === 0) {
    return "Address is required"
  }
  
  const cleanAddress = address.trim()
  
  if (!isValidCasperAddress(cleanAddress)) {
    if (cleanAddress.startsWith('account-hash-')) {
      return "Invalid account hash format. Expected: account-hash-[64 hex characters]"
    } else if (cleanAddress.startsWith('01')) {
      return "Invalid Ed25519 public key. Expected: 01[64 hex characters] (66 total)"
    } else if (cleanAddress.startsWith('02')) {
      return "Invalid Secp256k1 public key. Expected: 02[66 hex characters] (68 total)"
    } else {
      return "Invalid Casper address. Must be a public key (01... or 02...) or account hash (account-hash-...)"
    }
  }
  
  return null
}
