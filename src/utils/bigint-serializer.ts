/**
 * Custom serializer for BigInt values
 * This is needed because JSON.stringify cannot serialize BigInt values by default
 */

// Add BigInt serialization support
export function setupBigIntSerialization() {
  // Add a custom toJSON method to BigInt prototype
  // @ts-ignore - TypeScript doesn't know about BigInt.prototype.toJSON
  BigInt.prototype.toJSON = function() {
    return this.toString();
  };

  return () => {
    // Return a cleanup function that removes the method
    // @ts-ignore - TypeScript doesn't know about BigInt.prototype.toJSON
    delete BigInt.prototype.toJSON;
  };
}

// Custom replacer function for JSON.stringify
export function bigIntReplacer(key: string, value: any) {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

// Use this function when you need to manually stringify objects containing BigInt
export function safeStringify(obj: any): string {
  return JSON.stringify(obj, bigIntReplacer);
}
