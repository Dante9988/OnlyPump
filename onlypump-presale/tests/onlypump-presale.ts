import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { OnlypumpPresale } from "../target/types/onlypump_presale";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createMint,
  mintTo,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { expect } from "chai";

describe("onlypump_presale", () => {
  // Configure the client to use the local cluster
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.onlypumpPresale as Program<OnlypumpPresale>;
  const provider = anchor.getProvider();

  // Test accounts
  let owner: Keypair;
  let operator: Keypair;
  let treasury: Keypair;
  let user: Keypair;
  let authority: Keypair; // Token authority for funding presale
  let tokenMint: PublicKey;
  let platformConfig: PublicKey;
  let presale: PublicKey;
  let tokenVault: PublicKey;
  let tokenVaultAuthority: PublicKey;
  let publicSolVault: PublicKey;
  let ecosystemVault: PublicKey;
  let ecosystemVaultAuthority: PublicKey;

  // Constants
  const TOKEN_DECIMALS = 6;
  const TOTAL_SUPPLY = 1_000_000_000; // 1B tokens
  const PRESALE_ALLOCATION = 400_000_000; // 400M tokens
  const LP_ALLOCATION = 300_000_000; // 300M tokens
  const VAULT_ALLOCATION = 100_000_000; // 100M tokens
  const TOTAL_PRESALE_TOKENS = PRESALE_ALLOCATION + LP_ALLOCATION + VAULT_ALLOCATION; // 800M

  before(async () => {
    // Initialize test keypairs
    owner = Keypair.generate();
    operator = Keypair.generate();
    treasury = Keypair.generate();
    user = Keypair.generate();
    authority = Keypair.generate();

    // Airdrop SOL to test accounts
    const airdropAmount = 10 * LAMPORTS_PER_SOL;
    await provider.connection.requestAirdrop(owner.publicKey, airdropAmount);
    await provider.connection.requestAirdrop(operator.publicKey, airdropAmount);
    await provider.connection.requestAirdrop(treasury.publicKey, airdropAmount);
    await provider.connection.requestAirdrop(user.publicKey, airdropAmount);
    await provider.connection.requestAirdrop(authority.publicKey, airdropAmount);

    // Wait for confirmations
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Create token mint
    tokenMint = await createMint(
      provider.connection,
      authority, // payer
      authority.publicKey, // mint authority
      null,
      TOKEN_DECIMALS
    );

    // Derive PDAs
    [platformConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("platform")],
      program.programId
    );

    [presale] = PublicKey.findProgramAddressSync(
      [Buffer.from("presale"), tokenMint.toBuffer()],
      program.programId
    );

    // tokenVault is a PDA token account (not an ATA)
    // It's derived from seeds: [b"token_vault", presale.key().as_ref()]
    // The authority is the same PDA
    [tokenVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_vault"), presale.toBuffer()],
      program.programId
    );
    tokenVaultAuthority = tokenVault; // Same PDA

    [publicSolVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("public_sol_vault"), presale.toBuffer()],
      program.programId
    );

    // ecosystemVault is also a PDA token account
    // The authority is the same PDA
    [ecosystemVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("ecosystem_vault"), presale.toBuffer()],
      program.programId
    );
    ecosystemVaultAuthority = ecosystemVault; // Same PDA
  });

  it("Initializes the platform", async () => {
    const feeBps = 100; // 1% fee

    const tx = await program.methods
      // Treat `authority` as the operator/admin who can fund the presale
      .initializePlatform(authority.publicKey, treasury.publicKey, feeBps)
      .accounts({
        owner: owner.publicKey,
      })
      .signers([owner])
      .rpc();

    console.log("Initialize platform tx:", tx);

    const platform = await program.account.platformConfig.fetch(platformConfig);
    expect(platform.owner.toString()).to.equal(owner.publicKey.toString());
    // Operator was set to `authority.publicKey` when initializing the platform
    expect(platform.operator.toString()).to.equal(authority.publicKey.toString());
    expect(platform.treasury.toString()).to.equal(treasury.publicKey.toString());
    expect(platform.feeBps).to.equal(feeBps);
  });

  it("Creates a presale", async () => {
    const now = Math.floor(Date.now() / 1000);
    const publicStartTs = new anchor.BN(now + 60); // Start in 1 minute
    const publicEndTs = new anchor.BN(now + 3600); // End in 1 hour
    const publicPriceLamportsPerToken = new anchor.BN(1_000_000); // 0.001 SOL per token (with 6 decimals)
    const hardCapLamports = new anchor.BN(400 * LAMPORTS_PER_SOL); // 400 SOL hard cap

    // Authorities are the same as the vaults (same PDAs)

    let tx: string;
    try {
      tx = await program.methods
        .createPresale(
          tokenMint,
          authority.publicKey,
          publicStartTs,
          publicEndTs,
          publicPriceLamportsPerToken,
          hardCapLamports
        )
        .accounts({
          admin: owner.publicKey,
          mint: tokenMint,
        })
        .signers([owner])
        .rpc();
      console.log("Create presale tx:", tx);
    } catch (error: any) {
      console.error("Error creating presale:", error);
      if (error.logs) {
        console.error("Program logs:", error.logs);
      }
      throw error;
    }

    // Wait a bit for the account to be fully written
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Try to fetch raw account data first to debug
    try {
      const accountInfo = await provider.connection.getAccountInfo(presale);
      if (!accountInfo) {
        throw new Error("Presale account does not exist");
      }
      console.log("Presale account data length:", accountInfo.data.length);
      console.log("Presale account owner:", accountInfo.owner.toString());
    } catch (error) {
      console.error("Error fetching account info:", error);
    }

    const presaleAccount = await program.account.presale.fetch(presale);
    expect(presaleAccount.mint.toString()).to.equal(tokenMint.toString());
    expect(presaleAccount.publicTokenCap.toString()).to.equal(
      (PRESALE_ALLOCATION * 10 ** TOKEN_DECIMALS).toString()
    );
    expect(presaleAccount.lpTokenAllocation.toString()).to.equal(
      (LP_ALLOCATION * 10 ** TOKEN_DECIMALS).toString()
    );
    expect(presaleAccount.ecosystemAllocation.toString()).to.equal(
      (VAULT_ALLOCATION * 10 ** TOKEN_DECIMALS).toString()
    );
    expect(presaleAccount.isFinalized).to.be.false;
    expect(presaleAccount.isMigrated).to.be.false;
  });

  it("Funds presale tokens", async () => {
    // Create authority's token account first
    const authorityTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      authority.publicKey
    );

    // Create the token account if it doesn't exist
    try {
      await getAccount(provider.connection, authorityTokenAccount);
    } catch {
      // Account doesn't exist, create it
      const createATA = await provider.sendAndConfirm(
        new anchor.web3.Transaction().add(
          createAssociatedTokenAccountInstruction(
            authority.publicKey,
            authorityTokenAccount,
            authority.publicKey,
            tokenMint
          )
        ),
        [authority]
      );
    }

    // Mint 800M tokens to authority
    const mintAmount = BigInt(TOTAL_PRESALE_TOKENS * 10 ** TOKEN_DECIMALS);
    await mintTo(
      provider.connection,
      authority,
      tokenMint,
      authorityTokenAccount,
      authority,
      mintAmount
    );

    // Fund presale
    const tx = await program.methods
      .fundPresaleTokens(new anchor.BN(mintAmount.toString()))
      .accounts({
        presale: presale, // Provide presale so Anchor can derive token_vault
        fromTokenAccount: authorityTokenAccount,
        authority: authority.publicKey,
      })
      .signers([authority])
      .rpc();

    console.log("Fund presale tokens tx:", tx);

    // Verify token vault has the tokens
    const vaultAccount = await getAccount(provider.connection, tokenVault);
    expect(vaultAccount.amount.toString()).to.equal(mintAmount.toString());
  });

  it("Whitelists a user", async () => {
    const [whitelist] = PublicKey.findProgramAddressSync(
      [Buffer.from("whitelist"), presale.toBuffer(), user.publicKey.toBuffer()],
      program.programId
    );

    const tier = 1; // Basic tier
    const maxContribution = new anchor.BN(10 * LAMPORTS_PER_SOL); // 10 SOL max

    const tx = await program.methods
      .whitelistUser(tier, maxContribution)
      .accounts({
        presale: presale, // Provide presale so Anchor can derive whitelist
        admin: owner.publicKey,
        user: user.publicKey,
      })
      .signers([owner])
      .rpc();

    console.log("Whitelist user tx:", tx);

    const whitelistAccount = await program.account.whitelistEntry.fetch(whitelist);
    expect(whitelistAccount.user.toString()).to.equal(user.publicKey.toString());
    expect(whitelistAccount.tier).to.equal(tier);
    expect(whitelistAccount.maxContributionLamports.toString()).to.equal(
      maxContribution.toString()
    );
  });

  it("User contributes to public presale", async () => {
    // Fast forward time to presale start (in a real test, you'd use a clockwork or adjust)
    // For now, we'll assume the presale has started

    const [userPosition] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), presale.toBuffer(), user.publicKey.toBuffer()],
      program.programId
    );

    const [whitelist] = PublicKey.findProgramAddressSync(
      [Buffer.from("whitelist"), presale.toBuffer(), user.publicKey.toBuffer()],
      program.programId
    );

    const contributionAmount = new anchor.BN(1 * LAMPORTS_PER_SOL); // 1 SOL

    const tx = await program.methods
      .contributePublic(contributionAmount)
      .accounts({
        presale: presale, // Provide presale so Anchor can derive publicSolVault and userPosition
        user: user.publicKey,
        // Provide whitelist so the optional account is available to the program
        whitelist: whitelist,
      })
      .signers([user])
      .rpc();

    console.log("Contribute public tx:", tx);

    const presaleAccount = await program.account.presale.fetch(presale);
    expect(presaleAccount.publicRaisedLamports.toString()).to.equal(
      contributionAmount.toString()
    );

    const position = await program.account.userPosition.fetch(userPosition);
    expect(position.user.toString()).to.equal(user.publicKey.toString());
    expect(position.publicContributionLamports.toString()).to.equal(
      contributionAmount.toString()
    );
    expect(position.tokensAllocated.toNumber()).to.be.greaterThan(0);
  });

  it("Finalizes the presale", async () => {
    // In a real test, you'd wait for the end time or use clockwork
    // For now, we'll call it directly (assuming admin can finalize early in dev)

    const tx = await program.methods
      .finalizePresale()
      .accounts({
        presale: presale, // Provide presale explicitly
        admin: owner.publicKey,
      })
      .signers([owner])
      .rpc();

    console.log("Finalize presale tx:", tx);

    const presaleAccount = await program.account.presale.fetch(presale);
    expect(presaleAccount.isFinalized).to.be.true;
  });

  it("Migrates presale and creates LP (stub)", async () => {
    // LP token account should be a regular token account (not PDA)
    // Use treasury's ATA for simplicity
    const lpTokenAccount = await getAssociatedTokenAddress(tokenMint, treasury.publicKey);
    
    // Create the ATA if it doesn't exist
    try {
      await getAccount(provider.connection, lpTokenAccount);
    } catch {
      const createATA = await provider.sendAndConfirm(
        new anchor.web3.Transaction().add(
          createAssociatedTokenAccountInstruction(
            treasury.publicKey,
            lpTokenAccount,
            treasury.publicKey,
            tokenMint
          )
        ),
        [treasury]
      );
    }
    
    const lpSolAccount = Keypair.generate();

    // Airdrop to LP SOL account
    await provider.connection.requestAirdrop(
      lpSolAccount.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const lpSolAmount = new anchor.BN(0.5 * LAMPORTS_PER_SOL); // 0.5 SOL for LP

    const tx = await program.methods
      .migrateAndCreateLp(lpSolAmount)
      .accounts({
        presale: presale, // Provide presale so Anchor can derive token_vault, ecosystem_vault, etc.
        lpTokenAccount: lpTokenAccount,
        lpSolAccount: lpSolAccount.publicKey,
        treasury: treasury.publicKey,
        admin: owner.publicKey,
      })
      .signers([owner])
      .rpc();

    console.log("Migrate and create LP tx:", tx);

    const presaleAccount = await program.account.presale.fetch(presale);
    expect(presaleAccount.isMigrated).to.be.true;

    // Verify ecosystem vault received tokens
    const ecosystemAccount = await getAccount(provider.connection, ecosystemVault);
    expect(ecosystemAccount.amount.toString()).to.equal(
      (VAULT_ALLOCATION * 10 ** TOKEN_DECIMALS).toString()
    );
  });

  it("User claims tokens", async () => {
    const [userPosition] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), presale.toBuffer(), user.publicKey.toBuffer()],
      program.programId
    );

    const userTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      user.publicKey
    );

    // Ensure the user's token account exists (create ATA if needed)
    try {
      await getAccount(provider.connection, userTokenAccount);
    } catch {
      const createATA = await provider.sendAndConfirm(
        new anchor.web3.Transaction().add(
          createAssociatedTokenAccountInstruction(
            user.publicKey, // payer
            userTokenAccount,
            user.publicKey, // owner
            tokenMint
          )
        ),
        [user]
      );
    }

    const positionBefore = await program.account.userPosition.fetch(userPosition);
    const tokensToClaim = positionBefore.tokensAllocated.sub(positionBefore.tokensClaimed);

    const tx = await program.methods
      .claimTokens()
      .accounts({
        presale: presale, // Provide presale so Anchor can derive token_vault and user_position
        user: user.publicKey,
        userTokenAccount: userTokenAccount,
      })
      .signers([user])
      .rpc();

    console.log("Claim tokens tx:", tx);

    // Verify user received tokens
    const userTokenAccountInfo = await getAccount(provider.connection, userTokenAccount);
    expect(userTokenAccountInfo.amount.toString()).to.equal(tokensToClaim.toString());

    // Verify position updated
    const positionAfter = await program.account.userPosition.fetch(userPosition);
    expect(positionAfter.tokensClaimed.toString()).to.equal(tokensToClaim.toString());
  });
});
