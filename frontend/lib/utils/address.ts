/**
 * Shortens a Solana address for display
 * @param address Full Solana address
 * @param startChars Number of characters to show at the start
 * @param endChars Number of characters to show at the end
 * @returns Shortened address with ellipsis
 */
export function shortenAddress(
  address: string,
  startChars = 4,
  endChars = 4
): string {
  if (!address) {
    return '';
  }

  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Validates a Solana address
 * @param address Address to validate
 * @returns True if the address is valid
 */
export function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}
