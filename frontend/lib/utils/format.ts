/**
 * Format a number for display
 * @param value Number to format
 * @param options Formatting options
 * @returns Formatted number string
 */
export function formatNumber(
  value: number,
  options: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    notation?: 'standard' | 'scientific' | 'engineering' | 'compact';
  } = {}
): string {
  const {
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
    notation = 'compact'
  } = options;
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits,
    maximumFractionDigits,
    notation
  }).format(value);
}

/**
 * Format a price for display
 * @param price Price to format
 * @returns Formatted price string
 */
export function formatPrice(price: number): string {
  if (price >= 1) {
    return price.toFixed(2);
  } else if (price >= 0.01) {
    return price.toFixed(4);
  } else if (price >= 0.0001) {
    return price.toFixed(6);
  } else {
    return price.toFixed(8);
  }
}

/**
 * Shorten an address for display
 * @param address Address to shorten
 * @param prefixLength Number of characters to show at the start
 * @param suffixLength Number of characters to show at the end
 * @returns Shortened address string
 */
export function shortenAddress(
  address: string,
  prefixLength = 4,
  suffixLength = 4
): string {
  if (!address) return '';
  if (address.length <= prefixLength + suffixLength) return address;
  
  return `${address.slice(0, prefixLength)}...${address.slice(-suffixLength)}`;
}

/**
 * Format a percentage for display
 * @param value Percentage value
 * @param options Formatting options
 * @returns Formatted percentage string
 */
export function formatPercent(
  value: number,
  options: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    includeSign?: boolean;
  } = {}
): string {
  const {
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
    includeSign = true
  } = options;
  
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits,
    maximumFractionDigits,
    style: 'percent',
    signDisplay: includeSign ? 'exceptZero' : 'auto'
  }).format(value / 100);
  
  return formatted;
}
