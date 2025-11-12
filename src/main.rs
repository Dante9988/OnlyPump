use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use pumpfun::{
    accounts::BondingCurveAccount,
    common::types::{Cluster, PriorityFee},
    utils::CreateTokenMetadata,
    PumpFun,
};
use serde::{Deserialize, Serialize};
use solana_sdk::{
    commitment_config::CommitmentConfig,
    native_token::LAMPORTS_PER_SOL,
    pubkey::Pubkey,
    signature::Keypair,
    signer::Signer,
};
use spl_token;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tracing::{info, warn};

#[derive(Clone)]
pub struct AppState {
    pub pump_client: Arc<PumpFun>,
    pub vanity_service: Arc<VanityService>,
}

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    cluster: String,
    vanity_pool_size: usize,
}

#[derive(Deserialize)]
struct CreateTokenRequest {
    name: String,
    symbol: String,
    description: String,
    image_path: Option<String>,
    twitter: Option<String>,
    telegram: Option<String>,
    website: Option<String>,
    track_volume: Option<bool>,
    use_vanity: Option<bool>,
}

#[derive(Deserialize)]
struct CreateAndBuyRequest {
    #[serde(flatten)]
    create: CreateTokenRequest,
    amount_sol: f64,
    slippage_bps: Option<u16>,
}

#[derive(Deserialize)]
struct BuyTokenRequest {
    mint: String,
    amount_sol: f64,
    track_volume: Option<bool>,
    slippage_bps: Option<u16>,
}

#[derive(Deserialize)]
struct SellTokenRequest {
    mint: String,
    amount_tokens: Option<u64>,
    sell_all: Option<bool>,
    slippage_bps: Option<u16>,
}

#[derive(Serialize)]
struct TransactionResponse {
    signature: String,
    mint: Option<String>,
}

#[derive(Serialize)]
struct CurveResponse {
    mint: String,
    curve: serde_json::Value,
}

// Vanity Address Service with MUCH FASTER generation
pub struct VanityService {
    pool: Arc<tokio::sync::RwLock<Vec<(String, String)>>>, // (seed, pubkey)
    suffix: String,
    pool_size: usize,
    authority_keypair: Keypair, // The keypair we control
}

impl VanityService {
    pub fn new(suffix: String, pool_size: usize) -> Self {
        let authority_keypair = Keypair::new();
        let service = Self {
            pool: Arc::new(tokio::sync::RwLock::new(Vec::new())),
            suffix,
            pool_size,
            authority_keypair,
        };
        
        // Start background generation
        let service_clone = service.clone();
        tokio::spawn(async move {
            service_clone.generate_pool().await;
        });
        
        service
    }
    
    pub async fn get_next_vanity(&self) -> Option<(String, String)> {
        let mut pool = self.pool.write().await;
        pool.pop()
    }
    
    pub async fn pool_size(&self) -> usize {
        self.pool.read().await.len()
    }
    
    async fn generate_pool(&self) {
        info!("Starting FAST vanity address generation for suffix: {}", self.suffix);
        info!("Authority pubkey: {}", self.authority_keypair.pubkey());
        
        loop {
            let current_size = self.pool.read().await.len();
            if current_size >= self.pool_size {
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                continue;
            }
            
            let needed = self.pool_size - current_size;
            info!("Generating {} vanity addresses...", needed);
            
            let new_vanity = self.generate_vanity_batch_fast(needed).await;
            
            {
                let mut pool = self.pool.write().await;
                pool.extend(new_vanity);
                info!("Vanity pool size: {}", pool.len());
            }
        }
    }
    
    // MUCH FASTER method using Pubkey::create_with_seed
    async fn generate_vanity_batch_fast(&self, count: usize) -> Vec<(String, String)> {
        use rayon::prelude::*;
        
        let suffix = self.suffix.clone();
        let authority_pubkey = self.authority_keypair.pubkey();
        let found: Arc<tokio::sync::Mutex<Vec<(String, String)>>> = Arc::new(tokio::sync::Mutex::new(Vec::new()));
        let found_clone = found.clone();
        
        rayon::spawn(move || {
            let mut attempts = 0;
            while found_clone.blocking_lock().len() < count && attempts < 10_000_000 {
                // Generate random seed
                let seed: String = rand::thread_rng()
                    .sample_iter(rand::distr::Alphanumeric)
                    .take(32)
                    .map(char::from)
                    .collect();
                
                // Create pubkey with seed - MUCH FASTER than Keypair::new()
                if let Ok(possible_token_addr) = Pubkey::create_with_seed(
                    &authority_pubkey,
                    &seed,
                    &spl_token::id()
                ) {
                    let pubkey_str = possible_token_addr.to_string();
                    if pubkey_str.ends_with(&suffix) {
                        found_clone.blocking_lock().push((seed, pubkey_str));
                        info!("Found vanity address: {}", pubkey_str);
                    }
                }
                
                attempts += 1;
                
                // Progress update every 100k attempts
                if attempts % 100_000 == 0 {
                    let found_count = found_clone.blocking_lock().len();
                    info!("Fast generation: {} attempts, {} found", attempts, found_count);
                }
            }
        });
        
        // Wait for completion
        tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
        
        // Extract the results from the mutex
        let mut pool = found.lock().await;
        std::mem::take(&mut *pool)
    }
    
    // Get the authority keypair for creating tokens
    pub fn get_authority_keypair(&self) -> &Keypair {
        &self.authority_keypair
    }
}

impl Clone for VanityService {
    fn clone(&self) -> Self {
        Self {
            pool: self.pool.clone(),
            suffix: self.suffix.clone(),
            pool_size: self.pool_size,
            authority_keypair: self.authority_keypair.insecure_clone(),
        }
    }
}

#[tokio::main]
async fn main() {
    // Load environment variables
    dotenv::dotenv().ok();
    
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    
    info!("Starting OnlyPump Backend with FAST vanity generation...");
    
    // Load configuration
    let cluster = std::env::var("SOLANA_CLUSTER").unwrap_or_else(|_| "devnet".to_string());
    let _rpc_url = std::env::var("RPC_URL").unwrap_or_else(|_| "https://api.devnet.solana.com".to_string());
    let vanity_suffix = std::env::var("VANITY_SUFFIX").unwrap_or_else(|_| "pump".to_string());
    let vanity_pool_size = std::env::var("VANITY_POOL_SIZE")
        .unwrap_or_else(|_| "120".to_string())
        .parse()
        .unwrap_or(120);
    
    // Create vanity service first
    let vanity_service = Arc::new(VanityService::new(vanity_suffix, vanity_pool_size));
    
    // Use the authority keypair from vanity service as payer
    let payer = Arc::new(vanity_service.get_authority_keypair().insecure_clone());
    info!("Authority/Payer public key: {}", payer.pubkey());
    
    // Create PumpFun client
    let cluster_config = match cluster.as_str() {
        "mainnet" => Cluster::mainnet(CommitmentConfig::confirmed(), PriorityFee::default()),
        "devnet" => Cluster::devnet(CommitmentConfig::confirmed(), PriorityFee::default()),
        "testnet" => Cluster::testnet(CommitmentConfig::confirmed(), PriorityFee::default()),
        _ => Cluster::devnet(CommitmentConfig::confirmed(), PriorityFee::default()),
    };
    
    let pump_client = Arc::new(PumpFun::new(payer, cluster_config));
    info!("PumpFun client initialized for cluster: {}", cluster);
    
    // Create app state
    let state = AppState {
        pump_client,
        vanity_service,
    };
    
    // Build router
    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/tx/create", post(create_token_handler))
        .route("/tx/create-and-buy", post(create_and_buy_handler))
        .route("/tx/buy", post(buy_token_handler))
        .route("/tx/sell", post(sell_token_handler))
        .route("/token/:mint/curve", get(get_curve_handler))
        .route("/vanity/stats", get(vanity_stats_handler))
        .layer(CorsLayer::permissive())
        .with_state(state);
    
    // Start server
    let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = std::env::var("PORT").unwrap_or_else(|_| "3001".to_string()).parse().unwrap_or(3001);
    
    let listener = tokio::net::TcpListener::bind(format!("{}:{}", host, port))
        .await
        .expect("Failed to bind to address");
    
    info!("Server running on {}:{}", host, port);
    axum::serve(listener, app).await.expect("Server failed to start");
}

async fn health_handler(State(state): State<AppState>) -> Result<Json<HealthResponse>, StatusCode> {
    let vanity_pool_size = state.vanity_service.pool_size().await;
    
    Ok(Json(HealthResponse {
        status: "healthy".to_string(),
        cluster: "devnet".to_string(),
        vanity_pool_size,
    }))
}

async fn create_token_handler(
    State(state): State<AppState>,
    Json(request): Json<CreateTokenRequest>,
) -> Result<Json<TransactionResponse>, StatusCode> {
    info!("Creating token: {} ({})", request.name, request.symbol);
    
    // Get vanity seed and pubkey
    let (seed, vanity_pubkey) = if request.use_vanity.unwrap_or(true) {
        state.vanity_service.get_next_vanity().await
            .unwrap_or_else(|| {
                warn!("No vanity keypairs available, using random keypair");
                let random_keypair = Keypair::new();
                ("random".to_string(), random_keypair.pubkey().to_string())
            })
    } else {
        let random_keypair = Keypair::new();
        ("random".to_string(), random_keypair.pubkey().to_string())
    };
    
    let mint_pubkey = vanity_pubkey.parse::<Pubkey>()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    // Create metadata
    let metadata = CreateTokenMetadata {
        name: request.name,
        symbol: request.symbol,
        description: request.description,
        file: request.image_path.unwrap_or_else(|| "".to_string()),
        twitter: request.twitter,
        telegram: request.telegram,
        website: request.website,
    };
    
    // Create token using the vanity pubkey
    match state.pump_client.create(mint_pubkey, metadata, None).await {
        Ok(signature) => {
            info!("Token created successfully: {} with vanity address: {}", signature, vanity_pubkey);
            Ok(Json(TransactionResponse {
                signature: signature.to_string(),
                mint: Some(vanity_pubkey),
            }))
        }
        Err(e) => {
            warn!("Failed to create token: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn create_and_buy_handler(
    State(state): State<AppState>,
    Json(request): Json<CreateAndBuyRequest>,
) -> Result<Json<TransactionResponse>, StatusCode> {
    info!("Creating and buying token: {} ({})", request.create.name, request.create.symbol);
    
    // Get vanity seed and pubkey
    let (seed, vanity_pubkey) = if request.create.use_vanity.unwrap_or(true) {
        state.vanity_service.get_next_vanity().await
            .unwrap_or_else(|| {
                warn!("No vanity keypairs available, using random keypair");
                let random_keypair = Keypair::new();
                ("random".to_string(), random_keypair.pubkey().to_string())
            })
    } else {
        let random_keypair = Keypair::new();
        ("random".to_string(), random_keypair.pubkey().to_string())
    };
    
    let mint_pubkey = vanity_pubkey.parse::<Pubkey>()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    // Create metadata
    let metadata = CreateTokenMetadata {
        name: request.create.name,
        symbol: request.create.symbol,
        description: request.create.description,
        file: request.create.image_path.unwrap_or_else(|| "".to_string()),
        twitter: request.create.twitter,
        telegram: request.create.telegram,
        website: request.create.website,
    };
    
    // Convert SOL to lamports
    let lamports = (request.amount_sol * LAMPORTS_PER_SOL as f64) as u64;
    
    // Create and buy token using the vanity pubkey
    match state.pump_client.create_and_buy(
        mint_pubkey,
        metadata,
        lamports,
        request.create.track_volume,
        None, // slippage
        None, // priority fee
    ).await {
        Ok(signature) => {
            info!("Token created and bought successfully: {} with vanity address: {}", signature, vanity_pubkey);
            Ok(Json(TransactionResponse {
                signature: signature.to_string(),
                mint: Some(vanity_pubkey),
            }))
        }
        Err(e) => {
            warn!("Failed to create and buy token: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn buy_token_handler(
    State(state): State<AppState>,
    Json(request): Json<BuyTokenRequest>,
) -> Result<Json<TransactionResponse>, StatusCode> {
    info!("Buying token: {}", request.mint);
    
    let mint_pubkey = request.mint.parse()
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    
    let lamports = (request.amount_sol * LAMPORTS_PER_SOL as f64) as u64;
    
    match state.pump_client.buy(
        mint_pubkey,
        lamports,
        request.track_volume,
        None, // slippage
        None, // priority fee
    ).await {
        Ok(signature) => {
            info!("Token bought successfully: {}", signature);
            Ok(Json(TransactionResponse {
                signature: signature.to_string(),
                mint: None,
            }))
        }
        Err(e) => {
            warn!("Failed to buy token: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn sell_token_handler(
    State(state): State<AppState>,
    Json(request): Json<SellTokenRequest>,
) -> Result<Json<TransactionResponse>, StatusCode> {
    info!("Selling token: {}", request.mint);
    
    let mint_pubkey = request.mint.parse()
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    
    let amount = if request.sell_all.unwrap_or(false) {
        None
    } else {
        request.amount_tokens
    };
    
    match state.pump_client.sell(
        mint_pubkey,
        amount,
        None, // slippage
        None, // priority fee
    ).await {
        Ok(signature) => {
            info!("Token sold successfully: {}", signature);
            Ok(Json(TransactionResponse {
                signature: signature.to_string(),
                mint: None,
            }))
        }
        Err(e) => {
            warn!("Failed to sell token: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn get_curve_handler(
    State(state): State<AppState>,
    axum::extract::Path(mint): axum::extract::Path<String>,
) -> Result<Json<CurveResponse>, StatusCode> {
    let mint_pubkey = mint.parse()
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    
    match state.pump_client.get_bonding_curve_account(&mint_pubkey).await {
        Ok(curve) => {
            // Convert BondingCurveAccount to JSON
            let curve_json = serde_json::to_value(&curve)
                .unwrap_or_else(|_| serde_json::json!({"error": "Failed to serialize curve"}));
            
            Ok(Json(CurveResponse {
                mint,
                curve: curve_json,
            }))
        }
        Err(e) => {
            warn!("Failed to get bonding curve: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn vanity_stats_handler(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let pool_size = state.vanity_service.pool_size().await;
    
    Ok(Json(serde_json::json!({
        "pool_size": pool_size,
        "suffix": "pump",
        "authority_pubkey": state.vanity_service.get_authority_keypair().pubkey().to_string(),
        "method": "create_with_seed_fast"
    })))
}
