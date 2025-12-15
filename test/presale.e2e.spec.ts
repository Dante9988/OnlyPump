import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import axios from 'axios';
import nacl from 'tweetnacl';
import { Connection, Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';

function keypairFromJsonArrayString(raw: string, label: string): Keypair {
  const bytes = JSON.parse(raw) as number[];
  if (!Array.isArray(bytes) || bytes.length !== 64) {
    throw new Error(`Invalid ${label} (expected JSON array of 64 numbers)`);
  }
  return Keypair.fromSecretKey(new Uint8Array(bytes));
}

function loadKeypairFromSolanaIdJson(filePath = '/root/.config/solana/id.json'): Keypair {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  return keypairFromJsonArrayString(raw, `Solana id.json at ${filePath}`);
}

function loadPublicPresaleUserKeypair(): Keypair {
  const env = process.env.PUBLIC_PRESALE_USER;
  if (env && env.trim().length > 0) {
    return keypairFromJsonArrayString(env.trim(), 'PUBLIC_PRESALE_USER');
  }
  // Fallback for local dev if env var not provided
  return loadKeypairFromSolanaIdJson();
}

function parseAnchorU64(v: any): bigint {
  // Anchor accounts fetched on backend often serialize BN/u64 as a hex string (no 0x prefix),
  // e.g. "174876e800" == 0x174876e800 == 100_000_000_000.
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^[0-9a-f]+$/i.test(s) && /[a-f]/i.test(s)) {
      return BigInt(`0x${s}`);
    }
    return BigInt(s);
  }
  if (typeof v === 'number') {
    return BigInt(Math.trunc(v));
  }
  if (v && typeof v === 'object') {
    // Some serializers may wrap values (BN-like)
    if (typeof v.toString === 'function') {
      return parseAnchorU64(v.toString());
    }
  }
  throw new Error(`Unsupported u64 value: ${String(v)}`);
}

function buildSignatureHeader(
  walletPubkey: string,
  method: string,
  path: string,
  body: any,
  secretKey: Uint8Array,
): string {
  const timestamp = Date.now();
  const nonce = `${timestamp}-${Math.random().toString(36).slice(2)}`;
  const rawBody = body && Object.keys(body).length > 0 ? JSON.stringify(body) : '';
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');

  const canonicalMessage = [
    `method:${method.toUpperCase()}`,
    `path:${path}`,
    `timestamp:${timestamp}`,
    `nonce:${nonce}`,
    `bodyHash:${bodyHash}`,
  ].join('|');

  const signatureBytes = nacl.sign.detached(
    Buffer.from(canonicalMessage, 'utf8'),
    secretKey,
  );
  const signature = Buffer.from(signatureBytes).toString('base64');

  return JSON.stringify({
    wallet: walletPubkey,
    signature,
    timestamp,
    nonce,
    method,
    path,
    bodyHash,
  });
}

describe('Presale API (integration, devnet)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    const server = app.getHttpServer();
    const address = server.address() as any;
    const port = typeof address === 'string' ? 80 : address.port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('POST /api/presale/pricing/preview computes migration & public pricing on backend', async () => {
    const payload = {
      vipCapSol: 85,
      lpTokenAmount: 200_000_000,
      publicTokenAmount: 400_000_000,
      publicPriceMultiple: 1.0,
    };

    const res = await axios.post(
      `${baseUrl}/api/presale/pricing/preview`,
      payload,
    );

    expect(res.status).toBe(201);

    // Basic sanity checks on pricing math
    expect(res.data).toHaveProperty('migrationPriceSolPerToken');
    expect(res.data).toHaveProperty('migrationPriceLamportsPerToken');
    expect(res.data).toHaveProperty('publicPriceSolPerToken');
    expect(res.data).toHaveProperty('publicPriceLamportsPerToken');
    expect(res.data).toHaveProperty('publicHardCapSol');
    expect(res.data).toHaveProperty('publicHardCapLamports');

    // Migration price should be vipCapSol / lpTokenAmount
    const expectedMigration = payload.vipCapSol / payload.lpTokenAmount;
    expect(res.data.migrationPriceSolPerToken).toBeCloseTo(expectedMigration);
  });

  it('POST /api/presale (create presale) sends a real transaction to devnet', async () => {
    // Use the funded devnet keypair for testing
    // In a real scenario, this would be the user's wallet (e.g., Phantom)
    const fundedKeypairBytes = JSON.parse(
      process.env.PRESALE_ADMIN_KEYPAIR ||
      '[]'
    );
    if (fundedKeypairBytes.length === 0) {
      throw new Error('PRESALE_ADMIN_KEYPAIR not configured in .env');
    }
    const kp = Keypair.fromSecretKey(new Uint8Array(fundedKeypairBytes));

    // Connect to devnet
    const rpcUrl =
      process.env.SOLANA_DEVNET_RPC_URL ||
      'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    // Use a reserved vanity address (token doesn't exist yet)
    // Use timestamp-based index to ensure each test run gets a unique address
    const vanityAddressesPath = path.join(__dirname, '../src/common/live_fan_addresses.json');
    const vanityData = JSON.parse(fs.readFileSync(vanityAddressesPath, 'utf8'));
    const timestamp1 = Date.now();
    const testIndex = Math.floor((timestamp1 % 1000000) / 100) % vanityData.keypairs.length;
    const vanityAddress = vanityData.keypairs[testIndex];
    
    console.log(`Test 1: Using vanity index ${testIndex} of ${vanityData.keypairs.length} available`);
    console.log('Using reserved vanity address:', vanityAddress.public_key);
    console.log('Note: Token will be created later via Pump.fun');
    
    // Use unique names for each test run to avoid conflicts
    const uniqueSuffix = timestamp1.toString().slice(-6);
    
    const body = {
      name: `Test Presale ${uniqueSuffix}`,
      symbol: `TST${uniqueSuffix}`,
      description: `Integration test presale ${uniqueSuffix} - token to be created after funding`,
      mint: vanityAddress.public_key, // Reserved address, token doesn't exist yet
      authority: kp.publicKey.toBase58(), // Creator who will launch the token
      publicStartTs: Math.floor(Date.now() / 1000) + 60,
      publicEndTs: Math.floor(Date.now() / 1000) + 3600,
      publicPriceLamportsPerToken: 1_000_000,
      hardCapLamports: 400 * 1_000_000_000,
    };
    const header = buildSignatureHeader(
      kp.publicKey.toBase58(),
      'POST',
      '/api/presale',
      body,
      kp.secretKey,
    );

    let res;
    try {
      res = await axios.post(`${baseUrl}/api/presale`, body, {
        headers: {
          'x-request-signature': header,
        },
      });
    } catch (error: any) {
      // Log the error details for debugging
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      throw error;
    }

    expect(res.status).toBe(201);

    // The API now returns an unsigned transaction that we need to sign and send
    const { transaction, presale, publicSolVault } = res.data;
    expect(typeof transaction).toBe('string');
    expect(typeof presale).toBe('string');
    expect(presale.length).toBeGreaterThan(40);
    expect(typeof publicSolVault).toBe('string');
    expect(publicSolVault.length).toBeGreaterThan(40);
    
    console.log('Presale PDA:', presale);
    console.log('Public SOL Vault:', publicSolVault);

    // Deserialize the transaction
    const txBuffer = Buffer.from(transaction, 'base64');
    const tx = Transaction.from(txBuffer);

    // Sign the transaction with the test wallet
    tx.sign(kp);
    
    const txSig = await connection.sendRawTransaction(tx.serialize());
    
    // Log devnet Explorer link for manual inspection
    // eslint-disable-next-line no-console
    console.log(`Devnet presale create tx: ${txSig}`);
    // eslint-disable-next-line no-console
    console.log(`Solscan (devnet): https://solscan.io/tx/${txSig}?cluster=devnet`);

    // Wait for confirmation (using newer API)
    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature: txSig,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });

    // Verify transaction signature
    expect(typeof txSig).toBe('string');
    expect(txSig.length).toBeGreaterThan(40);

    // Extra safety: confirm on-chain status
    const status = await connection.getSignatureStatus(txSig);

    // eslint-disable-next-line no-console
    console.log('On-chain status for presale create tx:', status.value);
    expect(status.value).not.toBeNull();
    expect(status.value?.err).toBeNull();
  });

  it('Full presale flow: contribute → vote → launch', async () => {
    // Use the funded devnet keypair
    const fundedKeypairBytes = JSON.parse(process.env.PRESALE_ADMIN_KEYPAIR || '[]');
    const creatorKp = Keypair.fromSecretKey(new Uint8Array(fundedKeypairBytes));

    // Connect to devnet
    const rpcUrl = process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    // Load vanity address (use different offset to avoid conflicts with test 1)
    const vanityAddressesPath = path.join(__dirname, '../src/common/live_fan_addresses.json');
    const vanityData = JSON.parse(fs.readFileSync(vanityAddressesPath, 'utf8'));
    const timestamp2 = Date.now();
    const testIndex2 = (Math.floor((timestamp2 % 1000000) / 100) + 500) % vanityData.keypairs.length;
    const vanityAddress = vanityData.keypairs[testIndex2];
    
    console.log(`Test 2: Using vanity index ${testIndex2} of ${vanityData.keypairs.length} available`);

    const timestamp = Date.now();
    const uniqueSuffix = timestamp.toString().slice(-6);

    // Step 1: Create presale (already tested above, but let's do it again)
    console.log('\n=== Step 1: Create Presale ===');
    const createBody = {
      name: `Full Flow ${uniqueSuffix}`,
      symbol: `FF${uniqueSuffix}`,
      description: `Full flow test ${uniqueSuffix}`,
      mint: vanityAddress.public_key,
      authority: creatorKp.publicKey.toBase58(),
      publicStartTs: Math.floor(Date.now() / 1000) - 60, // Started 1 min ago
      publicEndTs: Math.floor(Date.now() / 1000) + 3600,
      publicPriceLamportsPerToken: 1_000_000,
      hardCapLamports: 1 * 1_000_000_000, // 1 SOL hard cap
    };

    const createHeader = buildSignatureHeader(
      creatorKp.publicKey.toBase58(),
      'POST',
      '/api/presale',
      createBody,
      creatorKp.secretKey,
    );

    const createRes = await axios.post(`${baseUrl}/api/presale`, createBody, {
      headers: { 'x-request-signature': createHeader },
    });

    const createTx = Transaction.from(Buffer.from(createRes.data.transaction, 'base64'));
    createTx.sign(creatorKp);
    const createSig = await connection.sendRawTransaction(createTx.serialize());
    const createBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: createSig, ...createBlockhash });
    console.log('✅ Presale created:', createRes.data.presale);

    // Step 2: Whitelist creator for VIP presale (admin whitelists themselves)
    console.log('\n=== Step 2: Whitelist Creator (VIP Tier 1) ===');
    const whitelistBody = {
      user: creatorKp.publicKey.toBase58(),
      tier: 1, // VIP tier 1
      maxContributionLamports: 1 * 1_000_000_000, // 1 SOL max
    };

    const whitelistHeader = buildSignatureHeader(
      creatorKp.publicKey.toBase58(),
      'POST',
      `/api/presale/${vanityAddress.public_key}/whitelist`,
      whitelistBody,
      creatorKp.secretKey,
    );

    const whitelistRes = await axios.post(
      `${baseUrl}/api/presale/${vanityAddress.public_key}/whitelist`,
      whitelistBody,
      { headers: { 'x-request-signature': whitelistHeader } }
    );

    const whitelistTx = Transaction.from(Buffer.from(whitelistRes.data.transaction, 'base64'));
    whitelistTx.sign(creatorKp);
    const whitelistSig = await connection.sendRawTransaction(whitelistTx.serialize());
    const whitelistBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: whitelistSig, ...whitelistBlockhash });
    console.log('✅ Creator whitelisted (VIP Tier 1), tx:', whitelistSig);

    // Step 3: Contribute 0.05 SOL (as whitelisted VIP)
    console.log('\n=== Step 3: Contribute 0.05 SOL (VIP) ===');
    const contributeBody = {
      amountLamports: 0.05 * 1_000_000_000,
    };

    const contributeHeader = buildSignatureHeader(
      creatorKp.publicKey.toBase58(),
      'POST',
      `/api/presale/${vanityAddress.public_key}/contribute`,
      contributeBody,
      creatorKp.secretKey,
    );

    let contributeRes;
    try {
      contributeRes = await axios.post(
        `${baseUrl}/api/presale/${vanityAddress.public_key}/contribute`,
        contributeBody,
        { headers: { 'x-request-signature': contributeHeader } }
      );
    } catch (error: any) {
      console.error('Contribute error:', error.response?.data);
      throw error;
    }

    const contributeTx = Transaction.from(Buffer.from(contributeRes.data.transaction, 'base64'));
    contributeTx.sign(creatorKp);
    const contributeSig = await connection.sendRawTransaction(contributeTx.serialize());
    const contributeBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: contributeSig, ...contributeBlockhash });
    console.log('✅ Contributed 0.05 SOL (VIP contribution), tx:', contributeSig);

    // Step 3b: Public user contributes 0.1 SOL (no whitelist required)
    console.log('\n=== Step 3b: Fund & Contribute 0.1 SOL (PUBLIC, no whitelist) ===');
    const publicUserKp = loadPublicPresaleUserKeypair();
    const minBalanceLamports = 100_000_000; // 0.1 SOL
    const topUpLamports = 500_000_000; // 0.5 SOL

    const balBefore = await connection.getBalance(publicUserKp.publicKey);
    if (balBefore < minBalanceLamports) {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const topUpTx = new Transaction({
        feePayer: creatorKp.publicKey,
        blockhash,
        lastValidBlockHeight,
      }).add(
        SystemProgram.transfer({
          fromPubkey: creatorKp.publicKey,
          toPubkey: publicUserKp.publicKey,
          lamports: topUpLamports,
        }),
      );
      topUpTx.sign(creatorKp);
      const topUpSig = await connection.sendRawTransaction(topUpTx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });
      const topUpBh = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: topUpSig, ...topUpBh });
      console.log('✅ Topped up public user with 0.5 SOL, tx:', topUpSig);
    } else {
      console.log(`Public user already >= 0.1 SOL: ${(balBefore / 1e9).toFixed(4)} SOL`);
    }

    // Sanity: public user should NOT be whitelisted
    const whitelistCheck = await axios.get(
      `${baseUrl}/api/presale/${vanityAddress.public_key}/whitelist/${publicUserKp.publicKey.toBase58()}`,
    );
    expect(whitelistCheck.status).toBe(200);
    // Nest may respond with empty body when controller returns null; axios surfaces that as "".
    // Treat both as "no whitelist entry".
    expect(whitelistCheck.data === null || whitelistCheck.data === '').toBe(true);

    const publicContributeBody = {
      amountLamports: 0.1 * 1_000_000_000,
    };
    const publicContributeHeader = buildSignatureHeader(
      publicUserKp.publicKey.toBase58(),
      'POST',
      `/api/presale/${vanityAddress.public_key}/contribute`,
      publicContributeBody,
      publicUserKp.secretKey,
    );
    let publicContributeRes;
    try {
      publicContributeRes = await axios.post(
        `${baseUrl}/api/presale/${vanityAddress.public_key}/contribute`,
        publicContributeBody,
        { headers: { 'x-request-signature': publicContributeHeader } },
      );
    } catch (error: any) {
      console.error('Public contribute error:', error.response?.data);
      console.error('Public contribute status:', error.response?.status);
      throw error;
    }
    expect(publicContributeRes.status).toBe(201);
    const publicContributeTx = Transaction.from(
      Buffer.from(publicContributeRes.data.transaction, 'base64'),
    );
    publicContributeTx.sign(publicUserKp);
    const publicContributeSig = await connection.sendRawTransaction(publicContributeTx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    const publicContributeBh = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: publicContributeSig, ...publicContributeBh });
    console.log('✅ Public user contributed 0.1 SOL, tx:', publicContributeSig);

    // Verify tokens_allocated math matches on-chain formula:
    // tokens = (amountLamports * 1e9) / publicPriceLamportsPerToken
    const posRes = await axios.get(
      `${baseUrl}/api/presale/${vanityAddress.public_key}/position/${publicUserKp.publicKey.toBase58()}`,
    );
    expect(posRes.status).toBe(200);
    expect(posRes.data).toBeDefined();
    const expectedTokens =
      (BigInt(publicContributeBody.amountLamports) * 1_000_000_000n) /
      BigInt(createBody.publicPriceLamportsPerToken);
    const actualTokensAllocated = parseAnchorU64(
      posRes.data.tokensAllocated ?? posRes.data.tokens_allocated,
    );
    expect(actualTokensAllocated).toBe(expectedTokens);

    // Step 4: Finalize presale
    console.log('\n=== Step 4: Finalize Presale ===');
    const finalizeHeader = buildSignatureHeader(
      creatorKp.publicKey.toBase58(),
      'POST',
      `/api/presale/${vanityAddress.public_key}/finalize`,
      {},
      creatorKp.secretKey,
    );

    const finalizeRes = await axios.post(
      `${baseUrl}/api/presale/${vanityAddress.public_key}/finalize`,
      {},
      { headers: { 'x-request-signature': finalizeHeader } }
    );

    const finalizeTx = Transaction.from(Buffer.from(finalizeRes.data.transaction, 'base64'));
    finalizeTx.sign(creatorKp);
    const finalizeSig = await connection.sendRawTransaction(finalizeTx.serialize());
    const finalizeBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: finalizeSig, ...finalizeBlockhash });
    console.log('✅ Presale finalized, tx:', finalizeSig);

    // Step 5: Start vote
    console.log('\n=== Step 5: Start Vote ===');
    const voteEndsTs = Math.floor(Date.now() / 1000) + 30; // Vote ends in 30 seconds
    const startVoteBody = { votingEndsTs: voteEndsTs };
    const startVoteHeader = buildSignatureHeader(
      creatorKp.publicKey.toBase58(),
      'POST',
      `/api/presale/${vanityAddress.public_key}/start-vote`,
      startVoteBody,
      creatorKp.secretKey,
    );

    const startVoteRes = await axios.post(
      `${baseUrl}/api/presale/${vanityAddress.public_key}/start-vote`,
      startVoteBody,
      { headers: { 'x-request-signature': startVoteHeader } }
    );

    const startVoteTx = Transaction.from(Buffer.from(startVoteRes.data.transaction, 'base64'));
    startVoteTx.sign(creatorKp);
    const startVoteSig = await connection.sendRawTransaction(startVoteTx.serialize());
    const startVoteBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: startVoteSig, ...startVoteBlockhash }, 'finalized');
    console.log('✅ Vote started, tx:', startVoteSig);

    // Step 6: Cast YES vote (creator votes to LAUNCH)
    console.log('\n=== Step 6: Cast Vote (LAUNCH) ===');
    const castVoteBody = { supportLaunch: true };
    const castVoteHeader = buildSignatureHeader(
      creatorKp.publicKey.toBase58(),
      'POST',
      `/api/presale/${vanityAddress.public_key}/cast-vote`,
      castVoteBody,
      creatorKp.secretKey,
    );

    const castVoteRes = await axios.post(
      `${baseUrl}/api/presale/${vanityAddress.public_key}/cast-vote`,
      castVoteBody,
      { headers: { 'x-request-signature': castVoteHeader } }
    );

    const castVoteTx = Transaction.from(Buffer.from(castVoteRes.data.transaction, 'base64'));
    castVoteTx.sign(creatorKp);
    const castVoteSig = await connection.sendRawTransaction(castVoteTx.serialize());
    const castVoteBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: castVoteSig, ...castVoteBlockhash });
    console.log('✅ Voted YES for LAUNCH, tx:', castVoteSig);
    
    // Wait for voting period to end
    console.log(`Voting period will end at timestamp: ${voteEndsTs}`);
    console.log(`Current time: ${Math.floor(Date.now() / 1000)}`);
    console.log('Waiting 32 seconds for voting period to end...');
    await new Promise(resolve => setTimeout(resolve, 32000)); // Wait 32 seconds to ensure voting has ended

    // Step 7: Resolve vote (should result in LAUNCH since we voted YES)
    console.log('\n=== Step 7: Resolve Vote (outcome should be LAUNCH) ===');
    const finalizeVoteHeader = buildSignatureHeader(
      creatorKp.publicKey.toBase58(),
      'POST',
      `/api/presale/${vanityAddress.public_key}/finalize-vote`,
      {},
      creatorKp.secretKey,
    );

    let finalizeVoteRes;
    try {
      finalizeVoteRes = await axios.post(
        `${baseUrl}/api/presale/${vanityAddress.public_key}/finalize-vote`,
        {},
        { headers: { 'x-request-signature': finalizeVoteHeader } }
      );
    } catch (error: any) {
      console.error('Finalize vote error:', error.response?.data);
      throw error;
    }

    const finalizeVoteTx = Transaction.from(Buffer.from(finalizeVoteRes.data.transaction, 'base64'));
    finalizeVoteTx.sign(creatorKp);
    const finalizeVoteSig = await connection.sendRawTransaction(finalizeVoteTx.serialize());
    const finalizeVoteBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: finalizeVoteSig, ...finalizeVoteBlockhash });
    console.log('✅ Vote finalized, tx:', finalizeVoteSig);

    console.log('\n✅ Full presale flow completed successfully!');
    console.log('Presale is now ready for token launch!');

    // Wait for all transactions to be fully finalized on-chain
    console.log('Waiting for on-chain state to finalize...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 8: Prepare to launch token (get withdraw transaction)
    console.log('\n=== Step 8: Prepare Token Launch (Withdraw Presale Funds) ===');
    const launchBody = {
      mint: vanityAddress.public_key,
      uri: 'https://example.com/metadata.json',
      name: `Full Flow ${uniqueSuffix}`,
      symbol: `FF${uniqueSuffix}`,
      description: `Presale-funded token ${uniqueSuffix}`,
      buyAmountSol: 0.05, // Use the contributed SOL to buy initial tokens
    };

    const launchHeader = buildSignatureHeader(
      creatorKp.publicKey.toBase58(),
      'POST',
      `/api/presale/${vanityAddress.public_key}/launch`,
      launchBody,
      creatorKp.secretKey,
    );

    let launchRes;
    try {
      launchRes = await axios.post(
        `${baseUrl}/api/presale/${vanityAddress.public_key}/launch`,
        launchBody,
        { headers: { 'x-request-signature': launchHeader } }
      );
    } catch (error: any) {
      console.error('Launch error:', error.response?.data);
      throw error;
    }

    console.log('✅ Launch preparation successful!');
    console.log('Withdraw transaction ready:', launchRes.data.withdrawTransaction ? 'Yes' : 'No');
    console.log('Available SOL:', launchRes.data.availableSol);
    console.log('\nNext steps:');
    console.log('1. Sign and send withdraw transaction');
    console.log('2. Sign and send create+buy transaction (Pump.fun)');
    console.log('3. Sign and send initialize-vaults transaction');
    console.log('4. Sign and send fund-presale transaction (50% tokens)');

    expect(launchRes.data.withdrawTransaction).toBeDefined();
    expect(launchRes.data.createAndBuyTransaction).toBeDefined();
    expect(launchRes.data.initializeVaultsTransaction).toBeDefined();
    expect(launchRes.data.fundPresaleTransaction).toBeDefined();
    expect(launchRes.data.availableSol).toBeGreaterThan(0);
    expect(launchRes.data.presaleAddress).toBeDefined();

    // ======== Execute Step 1: Withdraw ========
    console.log('\n=== Step 9: Execute Withdraw Transaction ===');
    const withdrawTx = Transaction.from(Buffer.from(launchRes.data.withdrawTransaction, 'base64'));
    withdrawTx.sign(creatorKp);
    const withdrawSig = await connection.sendRawTransaction(withdrawTx.serialize(), { skipPreflight: false, maxRetries: 3 });
    const withdrawBh = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: withdrawSig, ...withdrawBh });
    console.log('✅ Withdraw sent, tx:', withdrawSig);
    console.log(`Solscan (devnet): https://solscan.io/tx/${withdrawSig}?cluster=devnet`);

    // ======== Execute Step 2: Create+Buy ========
    console.log('\n=== Step 10: Execute Create+Buy Transaction ===');
    const createAndBuyTx = Transaction.from(Buffer.from(launchRes.data.createAndBuyTransaction, 'base64'));
    // Mint is already partially signed by backend; creator signs as fee payer / user
    createAndBuyTx.partialSign(creatorKp);
    const createAndBuySig = await connection.sendRawTransaction(createAndBuyTx.serialize(), { skipPreflight: false, maxRetries: 3 });
    const createAndBuyBh = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: createAndBuySig, ...createAndBuyBh });
    console.log('✅ Create+buy sent, tx:', createAndBuySig);
    console.log(`Solscan (devnet): https://solscan.io/tx/${createAndBuySig}?cluster=devnet`);

    // Optional: fetch bonding curve completion estimate for UI
    const curveRes = await axios.get(
      `${baseUrl}/api/presale/${vanityAddress.public_key}/bonding-curve`,
    );
    expect(curveRes.status).toBe(200);
    expect(curveRes.data).toHaveProperty('complete');
    expect(curveRes.data).toHaveProperty('solToCompleteLamports');

    // ======== Execute Step 3: Initialize Vaults ========
    console.log('\n=== Step 11: Execute Initialize Vaults Transaction ===');
    const initVaultsTx = Transaction.from(Buffer.from(launchRes.data.initializeVaultsTransaction, 'base64'));
    initVaultsTx.sign(creatorKp);
    const initVaultsSig = await connection.sendRawTransaction(initVaultsTx.serialize(), { skipPreflight: false, maxRetries: 3 });
    const initVaultsBh = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: initVaultsSig, ...initVaultsBh });
    console.log('✅ Initialize vaults sent, tx:', initVaultsSig);
    console.log(`Solscan (devnet): https://solscan.io/tx/${initVaultsSig}?cluster=devnet`);

    // ======== Execute Step 4: Fund Presale (50% tokens) ========
    console.log('\n=== Step 12: Execute Fund Presale Transaction (50% tokens) ===');
    const fundTx = Transaction.from(Buffer.from(launchRes.data.fundPresaleTransaction, 'base64'));
    fundTx.sign(creatorKp);
    const fundSig = await connection.sendRawTransaction(fundTx.serialize(), { skipPreflight: false, maxRetries: 3 });
    const fundBh = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: fundSig, ...fundBh });
    console.log('✅ Fund presale sent, tx:', fundSig);
    console.log(`Solscan (devnet): https://solscan.io/tx/${fundSig}?cluster=devnet`);

    console.log('\n✅ Complete presale flow + launch + vaults + funding verified!');
  }, 300000); // 5 minute timeout for this comprehensive test
});


