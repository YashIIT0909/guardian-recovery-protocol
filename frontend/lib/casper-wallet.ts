// Casper Wallet Integration Helper
// Timeout (in ms) for requests to the extension [DEFAULT: 30 min]
const REQUESTS_TIMEOUT_MS = 30 * 60 * 1000;

// Extend Window interface to include Casper Wallet types
declare global {
  interface Window {
    CasperWalletProvider?: (options?: { timeout?: number }) => CasperWalletProvider;
    CasperWalletEventTypes?: {
      Connected: string;
      Disconnected: string;
      TabChanged: string;
      ActiveKeyChanged: string;
      Locked: string;
      Unlocked: string;
    };
  }
}

export interface CasperWalletProvider {
  requestConnection: () => Promise<boolean>;
  disconnectFromSite: () => Promise<boolean>;
  isConnected: () => Promise<boolean>;
  getActivePublicKey: () => Promise<string>;
  signMessage: (message: string, signingPublicKeyHex: string) => Promise<string>;
  signDeploy: (deploy: unknown, signingPublicKeyHex: string) => Promise<{ deploy: unknown }>;
}

/**
 * Get the Casper Wallet provider instance
 * Returns undefined if the Casper Wallet extension is not installed
 */
export const getProvider = (): CasperWalletProvider | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const providerConstructor = window.CasperWalletProvider;
  if (providerConstructor === undefined) {
    return undefined;
  }

  const provider = providerConstructor({
    timeout: REQUESTS_TIMEOUT_MS,
  });

  return provider;
};

/**
 * Check if Casper Wallet extension is installed
 */
export const isCasperWalletInstalled = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.CasperWalletProvider !== undefined;
};

/**
 * Connect to the Casper Wallet
 * @returns The public key of the connected account, or null if connection failed
 */
export const connectWallet = async (): Promise<string | null> => {
  const provider = getProvider();

  if (!provider) {
    throw new Error('Casper Wallet extension is not installed. Please install it from https://www.casperwallet.io/');
  }

  try {
    const connected = await provider.requestConnection();

    if (!connected) {
      throw new Error('Connection request was rejected');
    }

    const publicKey = await provider.getActivePublicKey();
    return publicKey;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to connect to Casper Wallet');
  }
};

/**
 * Disconnect from the Casper Wallet
 * @returns true if disconnected successfully
 */
export const disconnectWallet = async (): Promise<boolean> => {
  const provider = getProvider();

  if (!provider) {
    throw new Error('Casper Wallet extension is not installed');
  }

  try {
    const disconnected = await provider.disconnectFromSite();
    return disconnected;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to disconnect from Casper Wallet');
  }
};

/**
 * Check if wallet is currently connected
 */
export const isWalletConnected = async (): Promise<boolean> => {
  const provider = getProvider();

  if (!provider) {
    return false;
  }

  try {
    return await provider.isConnected();
  } catch {
    return false;
  }
};

/**
 * Get the active public key from the connected wallet
 */
export const getActivePublicKey = async (): Promise<string | null> => {
  const provider = getProvider();

  if (!provider) {
    return null;
  }

  try {
    const isConnected = await provider.isConnected();
    if (!isConnected) {
      return null;
    }
    return await provider.getActivePublicKey();
  } catch {
    return null;
  }
};

/**
 * Format a public key for display (truncated)
 */
export const formatPublicKey = (publicKey: string, startChars = 8, endChars = 6): string => {
  if (publicKey.length <= startChars + endChars) {
    return publicKey;
  }
  return `${publicKey.slice(0, startChars)}...${publicKey.slice(-endChars)}`;
};
