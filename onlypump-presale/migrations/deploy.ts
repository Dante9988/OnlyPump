// Migrations are an early feature. Currently, they're nothing more than this
// single deploy script that's invoked from the CLI, injecting a provider
// configured from the workspace's Anchor.toml.

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { OnlypumpPresale } from "../target/types/onlypump_presale";

module.exports = async function (provider: anchor.AnchorProvider) {
  // Configure client to use the provider.
  anchor.setProvider(provider);

  // Verify the program is deployed
  const programId = new anchor.web3.PublicKey("BnFLfMvisKoXikZxvBUDvqfMT7iqVYEq4b65H6ThSfGN");
  
  try {
    const programInfo = await provider.connection.getAccountInfo(programId);
    if (programInfo) {
      console.log("✅ Program is already deployed");
    } else {
      console.log("⚠️  Program not found - ensure it's deployed with 'anchor deploy'");
    }
  } catch (error) {
    console.log("⚠️  Could not verify program deployment:", error.message);
  }

  // Add your deploy script here.
};
