;; sovereignty-vault.clar
;;
;; Multi-vault, non-custodial treasury. ONE contract holds MANY independent
;; vaults, addressed by vault-id:  vault-id -> configuration + pools.
;; A user can create any number of vaults; each has its own owner, name,
;; purpose, supported assets, risk parameters, pools and receipt shares.
;;
;; ---- Ownership model ----------------------------------------------------
;;   vault OWNER   : configures the vault (risk params, autonomy, pause,
;;                   metadata). Can NEVER move other depositors' funds: no
;;                   function lets an owner withdraw anything except by
;;                   burning their OWN receipt shares.
;;   depositors    : anyone if the vault is `open-deposits`, else only the
;;                   owner. Depositors receive receipt shares and can
;;                   redeem them at any time (never blocked by any pause).
;;   AI executor   : can only submit bounded intents through
;;                   execution-engine-v7; it has no function here.
;;
;; ---- Accounting model ---------------------------------------------------
;; Per (vault, asset) POOL:
;;   idle-balance        : units held by this contract, redeemable now
;;   strategy-allocation : units deployed to a strategy (principal, at cost)
;;   total-balance       : idle + allocated = the pool's net asset value
;; The pool is credited ONLY by deposit functions and debited ONLY by
;; redemptions / rebalances. Raw token balances of this contract are never
;; read, so an unsolicited "donation" transfer to the contract can not move
;; the share price (see "Share pricing" below).
;;
;; STX and sBTC are separate share classes inside a vault: there is NO
;; verified on-chain STX/sBTC price source on Testnet, so the two pools are
;; never valued against each other, summed, or converted.
;;
;; ---- Share pricing ------------------------------------------------------
;; first deposit into an empty pool : shares = amount        (>= minimum)
;; every later deposit              : shares = floor(amount * supply / total)
;; redemption                       : payout = floor(shares * total / supply)
;; Rounding is always in the POOL's favour (floor for both mint and payout),
;; so rounding can never create free shares or free assets. Deposits that
;; would mint zero shares, and redemptions that would pay zero, are rejected.
;; First-depositor / inflation defences: (1) internal accounting, above;
;; (2) minimum first deposit per asset; (3) zero-share deposits rejected.
;; Strategy allocation moves value between idle and allocated but never
;; changes `total-balance` or the share supply: receipts = ownership,
;; allocation = deployment (two separate accounting dimensions).
;;
;; ---- Pause semantics ----------------------------------------------------
;; Protocol pause or vault pause stop new deposits and new allocations.
;; NOTHING stops redemption of idle funds - pausing can never trap users.
;;
;; ---- Testnet execution gate --------------------------------------------
;; execute-rebalance additionally requires risk-guard's
;; is-strategy-execution-enabled, which is false on Testnet by construction.

(use-trait sip-010-trait .sip-010-trait-v4.sip-010-trait)
(use-trait strategy-trait .strategy-trait-v4.strategy-trait)

(define-constant ASSET-STX "STX")
(define-constant ASSET-SBTC "SBTC")

;; assets modes
(define-constant ASSETS-STX-ONLY u1)
(define-constant ASSETS-SBTC-ONLY u2)
(define-constant ASSETS-BOTH u3)

;; purposes: 0 conservative, 1 aggressive, 2 business, 3 dao, 4 institutional, 5 custom
(define-constant PURPOSE-CUSTOM u5)

;; Minimum FIRST deposit into an empty pool (base units): 1 STX / 0.0001 sBTC.
(define-constant MIN-INITIAL-DEPOSIT-STX u1000000)
(define-constant MIN-INITIAL-DEPOSIT-SBTC u10000)

(define-constant ERR-NOT-OWNER (err u100))
(define-constant ERR-VAULT-NOT-FOUND (err u101))
(define-constant ERR-PROTOCOL-PAUSED (err u102))
(define-constant ERR-WRONG-ASSET (err u103))
(define-constant ERR-ZERO-AMOUNT (err u104))
(define-constant ERR-INSUFFICIENT-IDLE-BALANCE (err u105))
(define-constant ERR-TRANSFER-FAILED (err u106))
(define-constant ERR-NOT-EXECUTION-ENGINE (err u107))
(define-constant ERR-STRATEGY-CONTRACT-MISMATCH (err u108))
(define-constant ERR-NO-APPROVED-ASSET (err u109))
(define-constant ERR-INVALID-ASSET (err u110))
(define-constant ERR-ASSET-NOT-SUPPORTED (err u111))
(define-constant ERR-VAULT-PAUSED (err u112))
(define-constant ERR-DEPOSITS-RESTRICTED (err u113))
(define-constant ERR-BELOW-MIN-INITIAL-DEPOSIT (err u114))
(define-constant ERR-ZERO-SHARES (err u115))
(define-constant ERR-VAULT-INSOLVENT (err u116))
(define-constant ERR-INSUFFICIENT-SHARES (err u117))
(define-constant ERR-ZERO-REDEMPTION (err u118))
(define-constant ERR-INVALID-NAME (err u119))
(define-constant ERR-INVALID-PURPOSE (err u120))
(define-constant ERR-INVALID-ASSET-MODE (err u121))
(define-constant ERR-ALREADY-PAUSED (err u122))
(define-constant ERR-NOT-PAUSED (err u123))
(define-constant ERR-TESTNET-EXECUTION-DISABLED (err u124))

(define-data-var next-vault-id uint u1)

(define-map vaults
  { vault-id: uint }
  {
    owner: principal,
    name: (string-utf8 48),
    purpose: uint,
    assets: uint,
    open-deposits: bool,
    paused: bool,
    created-at: uint
  })

;; On-chain discovery indexes (so no off-chain database/localStorage is
;; needed to answer "which vaults are mine" / "where do I hold shares").
(define-map owner-vault-count principal uint)
(define-map owner-vaults { owner: principal, index: uint } uint)
(define-map holder-vault-count principal uint)
(define-map holder-vaults { holder: principal, index: uint } uint)
(define-map holder-registered { holder: principal, vault-id: uint } bool)

(define-map idle-balances { vault-id: uint, asset: (string-ascii 8) } uint)
(define-map total-balances { vault-id: uint, asset: (string-ascii 8) } uint)
(define-map strategy-allocations { vault-id: uint, strategy-id: uint, asset: (string-ascii 8) } uint)

;; ---- Reads ----

(define-read-only (get-vault (vault-id uint))
  (map-get? vaults { vault-id: vault-id }))

(define-read-only (get-vault-owner (vault-id uint))
  (get owner (map-get? vaults { vault-id: vault-id })))

(define-read-only (get-vault-count)
  (- (var-get next-vault-id) u1))

(define-read-only (get-owner-vault-count (owner principal))
  (default-to u0 (map-get? owner-vault-count owner)))

(define-read-only (get-owner-vault-id (owner principal) (index uint))
  (map-get? owner-vaults { owner: owner, index: index }))

(define-read-only (get-holder-vault-count (holder principal))
  (default-to u0 (map-get? holder-vault-count holder)))

(define-read-only (get-holder-vault-id (holder principal) (index uint))
  (map-get? holder-vaults { holder: holder, index: index }))

(define-read-only (get-idle-balance (vault-id uint) (asset (string-ascii 8)))
  (default-to u0 (map-get? idle-balances { vault-id: vault-id, asset: asset })))

;; The pool's net asset value (idle + allocated principal).
(define-read-only (get-total-balance (vault-id uint) (asset (string-ascii 8)))
  (default-to u0 (map-get? total-balances { vault-id: vault-id, asset: asset })))

(define-read-only (get-strategy-allocation (vault-id uint) (strategy-id uint) (asset (string-ascii 8)))
  (default-to u0 (map-get? strategy-allocations { vault-id: vault-id, strategy-id: strategy-id, asset: asset })))

(define-read-only (get-share-balance (vault-id uint) (asset (string-ascii 8)) (holder principal))
  (contract-call? .receipt-token-v7 get-balance vault-id asset holder))

(define-read-only (get-share-supply (vault-id uint) (asset (string-ascii 8)))
  (contract-call? .receipt-token-v7 get-total-supply vault-id asset))

(define-read-only (is-vault-paused (vault-id uint))
  (default-to false (get paused (map-get? vaults { vault-id: vault-id }))))

(define-read-only (supports-asset (vault-id uint) (asset (string-ascii 8)))
  (match (map-get? vaults { vault-id: vault-id })
    vault (asset-in-mode (get assets vault) asset)
    false))

(define-read-only (get-pool (vault-id uint) (asset (string-ascii 8)))
  {
    idle: (get-idle-balance vault-id asset),
    total: (get-total-balance vault-id asset),
    supply: (get-share-supply vault-id asset)
  })

;; Everything a holder's UI needs about one position, derived from
;; authoritative on-chain state in a single read.
;;   ownership-bps : floor(shares * 10000 / supply)   (display precision only)
;;   claim         : floor(shares * total / supply)   (entitlement, all assets incl. deployed)
;;   redeemable    : min(claim, idle)                  (what can be redeemed right now)
(define-read-only (get-position (vault-id uint) (asset (string-ascii 8)) (holder principal))
  (let (
      (shares (get-share-balance vault-id asset holder))
      (supply (get-share-supply vault-id asset))
      (total (get-total-balance vault-id asset))
      (idle (get-idle-balance vault-id asset))
      (claim (if (is-eq supply u0) u0 (/ (* shares total) supply)))
    )
    {
      shares: shares,
      supply: supply,
      total-assets: total,
      idle: idle,
      ownership-bps: (if (is-eq supply u0) u0 (/ (* shares u10000) supply)),
      claim: claim,
      redeemable: (if (< claim idle) claim idle)
    }))

(define-read-only (preview-deposit (vault-id uint) (asset (string-ascii 8)) (amount uint))
  (compute-deposit-shares
    (get-share-supply vault-id asset)
    (get-total-balance vault-id asset)
    amount
    (min-initial-deposit-for asset)))

(define-read-only (preview-redeem (vault-id uint) (asset (string-ascii 8)) (shares uint))
  (compute-redeem-assets shares (get-share-supply vault-id asset) (get-total-balance vault-id asset)))

;; ---- Private helpers ----

(define-private (asset-in-mode (mode uint) (asset (string-ascii 8)))
  (if (is-eq asset ASSET-STX)
    (or (is-eq mode ASSETS-STX-ONLY) (is-eq mode ASSETS-BOTH))
    (if (is-eq asset ASSET-SBTC)
      (or (is-eq mode ASSETS-SBTC-ONLY) (is-eq mode ASSETS-BOTH))
      false)))

(define-private (min-initial-deposit-for (asset (string-ascii 8)))
  (if (is-eq asset ASSET-STX) MIN-INITIAL-DEPOSIT-STX MIN-INITIAL-DEPOSIT-SBTC))

(define-private (is-execution-engine)
  (is-eq contract-caller .execution-engine-v7))

(define-private (is-valid-asset (asset (string-ascii 8)))
  (or (is-eq asset ASSET-STX) (is-eq asset ASSET-SBTC)))

;; Deterministic share minting. FLOOR rounding (pool's favour).
(define-read-only (compute-deposit-shares (supply uint) (total uint) (amount uint) (min-initial uint))
  (begin
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (if (is-eq supply u0)
      (begin
        (asserts! (is-eq total u0) ERR-VAULT-INSOLVENT)
        (asserts! (>= amount min-initial) ERR-BELOW-MIN-INITIAL-DEPOSIT)
        (ok amount))
      (begin
        (asserts! (> total u0) ERR-VAULT-INSOLVENT)
        (let ((shares (/ (* amount supply) total)))
          (asserts! (> shares u0) ERR-ZERO-SHARES)
          (ok shares))))))

;; Proportional redemption. FLOOR rounding (pool's favour).
(define-read-only (compute-redeem-assets (shares uint) (supply uint) (total uint))
  (begin
    (asserts! (> shares u0) ERR-ZERO-AMOUNT)
    (asserts! (> supply u0) ERR-INSUFFICIENT-SHARES)
    (asserts! (<= shares supply) ERR-INSUFFICIENT-SHARES)
    (let ((payout (/ (* shares total) supply)))
      (asserts! (> payout u0) ERR-ZERO-REDEMPTION)
      (ok payout))))

(define-private (register-holder (holder principal) (vault-id uint))
  (if (default-to false (map-get? holder-registered { holder: holder, vault-id: vault-id }))
    true
    (let ((index (get-holder-vault-count holder)))
      (map-set holder-registered { holder: holder, vault-id: vault-id } true)
      (map-set holder-vaults { holder: holder, index: index } vault-id)
      (map-set holder-vault-count holder (+ index u1))
      true)))

;; ---- Vault lifecycle ----

;; Creates a vault AND its risk configuration atomically, from exactly the
;; parameters the owner reviewed in the creation flow.
(define-public (create-vault
    (name (string-utf8 48))
    (purpose uint)
    (assets uint)
    (open-deposits bool)
    (max-exposure-bps uint)
    (max-stx-tx-amount uint)
    (max-sbtc-tx-amount uint)
    (max-slippage-bps uint)
    (min-idle-bps uint)
    (autonomous-enabled bool)
    (cooldown-blocks uint))
  (let (
      (vault-id (var-get next-vault-id))
      (owner-index (get-owner-vault-count tx-sender))
    )
    (asserts! (not (contract-call? .sovereignty-protocol-admin-v4 is-paused)) ERR-PROTOCOL-PAUSED)
    (asserts! (> (len name) u0) ERR-INVALID-NAME)
    (asserts! (<= purpose PURPOSE-CUSTOM) ERR-INVALID-PURPOSE)
    (asserts! (and (>= assets ASSETS-STX-ONLY) (<= assets ASSETS-BOTH)) ERR-INVALID-ASSET-MODE)
    (map-set vaults { vault-id: vault-id }
      {
        owner: tx-sender,
        name: name,
        purpose: purpose,
        assets: assets,
        open-deposits: open-deposits,
        paused: false,
        created-at: stacks-block-height
      })
    (map-set owner-vaults { owner: tx-sender, index: owner-index } vault-id)
    (map-set owner-vault-count tx-sender (+ owner-index u1))
    (var-set next-vault-id (+ vault-id u1))
    (try! (contract-call? .risk-guard-v7 init-vault-config
      vault-id max-exposure-bps max-stx-tx-amount max-sbtc-tx-amount max-slippage-bps min-idle-bps autonomous-enabled cooldown-blocks))
    (print { event: "vault-created", vault-id: vault-id, owner: tx-sender, name: name, purpose: purpose, assets: assets, open-deposits: open-deposits })
    (ok vault-id)))

;; Metadata only. Purpose and supported assets are immutable after creation:
;; depositors rely on them.
(define-public (set-vault-config (vault-id uint) (name (string-utf8 48)) (open-deposits bool))
  (let ((vault (unwrap! (map-get? vaults { vault-id: vault-id }) ERR-VAULT-NOT-FOUND)))
    (asserts! (is-eq tx-sender (get owner vault)) ERR-NOT-OWNER)
    (asserts! (> (len name) u0) ERR-INVALID-NAME)
    (map-set vaults { vault-id: vault-id } (merge vault { name: name, open-deposits: open-deposits }))
    (print { event: "vault-config-updated", vault-id: vault-id, owner: tx-sender, name: name, open-deposits: open-deposits })
    (ok true)))

(define-public (set-risk-config
    (vault-id uint)
    (max-exposure-bps uint)
    (max-stx-tx-amount uint)
    (max-sbtc-tx-amount uint)
    (max-slippage-bps uint)
    (min-idle-bps uint)
    (autonomous-enabled bool)
    (cooldown-blocks uint))
  (let ((vault (unwrap! (map-get? vaults { vault-id: vault-id }) ERR-VAULT-NOT-FOUND)))
    (asserts! (is-eq tx-sender (get owner vault)) ERR-NOT-OWNER)
    (try! (contract-call? .risk-guard-v7 set-vault-risk-config
      vault-id max-exposure-bps max-stx-tx-amount max-sbtc-tx-amount max-slippage-bps min-idle-bps autonomous-enabled cooldown-blocks))
    (print { event: "risk-config-updated", vault-id: vault-id, owner: tx-sender, autonomous-enabled: autonomous-enabled })
    (ok true)))

(define-public (set-autonomous-mode (vault-id uint) (enabled bool))
  (let ((vault (unwrap! (map-get? vaults { vault-id: vault-id }) ERR-VAULT-NOT-FOUND)))
    (asserts! (is-eq tx-sender (get owner vault)) ERR-NOT-OWNER)
    (try! (contract-call? .risk-guard-v7 set-autonomous-enabled vault-id enabled))
    (print { event: "autonomous-mode-updated", vault-id: vault-id, owner: tx-sender, autonomous-enabled: enabled })
    (ok true)))

(define-public (pause-vault (vault-id uint))
  (let ((vault (unwrap! (map-get? vaults { vault-id: vault-id }) ERR-VAULT-NOT-FOUND)))
    (asserts! (is-eq tx-sender (get owner vault)) ERR-NOT-OWNER)
    (asserts! (not (get paused vault)) ERR-ALREADY-PAUSED)
    (map-set vaults { vault-id: vault-id } (merge vault { paused: true }))
    (print { event: "vault-paused", vault-id: vault-id, owner: tx-sender })
    (ok true)))

(define-public (unpause-vault (vault-id uint))
  (let ((vault (unwrap! (map-get? vaults { vault-id: vault-id }) ERR-VAULT-NOT-FOUND)))
    (asserts! (is-eq tx-sender (get owner vault)) ERR-NOT-OWNER)
    (asserts! (get paused vault) ERR-NOT-PAUSED)
    (map-set vaults { vault-id: vault-id } (merge vault { paused: false }))
    (print { event: "vault-unpaused", vault-id: vault-id, owner: tx-sender })
    (ok true)))

;; ---- Deposits: transfer -> pool accounting -> mint receipt shares ----

(define-public (deposit-stx (vault-id uint) (amount uint))
  (let (
      (vault (unwrap! (map-get? vaults { vault-id: vault-id }) ERR-VAULT-NOT-FOUND))
      (depositor tx-sender)
      (total (get-total-balance vault-id ASSET-STX))
      (shares (try! (preview-deposit vault-id ASSET-STX amount)))
    )
    (asserts! (asset-in-mode (get assets vault) ASSET-STX) ERR-ASSET-NOT-SUPPORTED)
    (asserts! (not (contract-call? .sovereignty-protocol-admin-v4 is-paused)) ERR-PROTOCOL-PAUSED)
    (asserts! (not (get paused vault)) ERR-VAULT-PAUSED)
    (asserts! (or (is-eq depositor (get owner vault)) (get open-deposits vault)) ERR-DEPOSITS-RESTRICTED)
    (unwrap! (stx-transfer? amount depositor (as-contract tx-sender)) ERR-TRANSFER-FAILED)
    (map-set idle-balances { vault-id: vault-id, asset: ASSET-STX } (+ (get-idle-balance vault-id ASSET-STX) amount))
    (map-set total-balances { vault-id: vault-id, asset: ASSET-STX } (+ total amount))
    (try! (contract-call? .receipt-token-v7 mint vault-id ASSET-STX shares depositor))
    (register-holder depositor vault-id)
    (print { event: "deposit", vault-id: vault-id, depositor: depositor, asset: ASSET-STX, amount: amount, shares: shares })
    (ok shares)))

(define-public (deposit-sbtc (vault-id uint) (amount uint) (asset <sip-010-trait>))
  (let (
      (vault (unwrap! (map-get? vaults { vault-id: vault-id }) ERR-VAULT-NOT-FOUND))
      (approved (unwrap! (contract-call? .risk-guard-v7 get-approved-sbtc-asset) ERR-NO-APPROVED-ASSET))
      (depositor tx-sender)
      (total (get-total-balance vault-id ASSET-SBTC))
      (shares (try! (preview-deposit vault-id ASSET-SBTC amount)))
    )
    (asserts! (asset-in-mode (get assets vault) ASSET-SBTC) ERR-ASSET-NOT-SUPPORTED)
    (asserts! (not (contract-call? .sovereignty-protocol-admin-v4 is-paused)) ERR-PROTOCOL-PAUSED)
    (asserts! (not (get paused vault)) ERR-VAULT-PAUSED)
    (asserts! (or (is-eq depositor (get owner vault)) (get open-deposits vault)) ERR-DEPOSITS-RESTRICTED)
    (asserts! (is-eq (contract-of asset) approved) ERR-WRONG-ASSET)
    (unwrap! (contract-call? asset transfer amount depositor (as-contract tx-sender) none) ERR-TRANSFER-FAILED)
    (map-set idle-balances { vault-id: vault-id, asset: ASSET-SBTC } (+ (get-idle-balance vault-id ASSET-SBTC) amount))
    (map-set total-balances { vault-id: vault-id, asset: ASSET-SBTC } (+ total amount))
    (try! (contract-call? .receipt-token-v7 mint vault-id ASSET-SBTC shares depositor))
    (register-holder depositor vault-id)
    (print { event: "deposit", vault-id: vault-id, depositor: depositor, asset: ASSET-SBTC, amount: amount, shares: shares })
    (ok shares)))

;; ---- Redemption: burn receipt shares -> proportional payout ----
;; Only the share holder can redeem their own shares (burn is always from
;; tx-sender), and the payout always goes back to that same holder. Never
;; gated by protocol or vault pause. Only IDLE funds can be paid out; if a
;; holder's claim exceeds idle liquidity they must redeem fewer shares.

(define-public (redeem-stx (vault-id uint) (shares uint))
  (let (
      (vault (unwrap! (map-get? vaults { vault-id: vault-id }) ERR-VAULT-NOT-FOUND))
      (holder tx-sender)
      (supply (get-share-supply vault-id ASSET-STX))
      (total (get-total-balance vault-id ASSET-STX))
      (idle (get-idle-balance vault-id ASSET-STX))
      (payout (try! (compute-redeem-assets shares supply total)))
    )
    (asserts! (asset-in-mode (get assets vault) ASSET-STX) ERR-ASSET-NOT-SUPPORTED)
    (asserts! (<= shares (get-share-balance vault-id ASSET-STX holder)) ERR-INSUFFICIENT-SHARES)
    (asserts! (<= payout idle) ERR-INSUFFICIENT-IDLE-BALANCE)
    (try! (contract-call? .receipt-token-v7 burn vault-id ASSET-STX shares holder))
    (map-set idle-balances { vault-id: vault-id, asset: ASSET-STX } (- idle payout))
    (map-set total-balances { vault-id: vault-id, asset: ASSET-STX } (- total payout))
    (unwrap! (as-contract (stx-transfer? payout tx-sender holder)) ERR-TRANSFER-FAILED)
    (print { event: "redeem", vault-id: vault-id, holder: holder, asset: ASSET-STX, shares: shares, amount: payout })
    (ok payout)))

(define-public (redeem-sbtc (vault-id uint) (shares uint) (asset <sip-010-trait>))
  (let (
      (vault (unwrap! (map-get? vaults { vault-id: vault-id }) ERR-VAULT-NOT-FOUND))
      (approved (unwrap! (contract-call? .risk-guard-v7 get-approved-sbtc-asset) ERR-NO-APPROVED-ASSET))
      (holder tx-sender)
      (supply (get-share-supply vault-id ASSET-SBTC))
      (total (get-total-balance vault-id ASSET-SBTC))
      (idle (get-idle-balance vault-id ASSET-SBTC))
      (payout (try! (compute-redeem-assets shares supply total)))
    )
    (asserts! (asset-in-mode (get assets vault) ASSET-SBTC) ERR-ASSET-NOT-SUPPORTED)
    (asserts! (is-eq (contract-of asset) approved) ERR-WRONG-ASSET)
    (asserts! (<= shares (get-share-balance vault-id ASSET-SBTC holder)) ERR-INSUFFICIENT-SHARES)
    (asserts! (<= payout idle) ERR-INSUFFICIENT-IDLE-BALANCE)
    (try! (contract-call? .receipt-token-v7 burn vault-id ASSET-SBTC shares holder))
    (map-set idle-balances { vault-id: vault-id, asset: ASSET-SBTC } (- idle payout))
    (map-set total-balances { vault-id: vault-id, asset: ASSET-SBTC } (- total payout))
    (unwrap! (as-contract (contract-call? asset transfer payout tx-sender holder none)) ERR-TRANSFER-FAILED)
    (print { event: "redeem", vault-id: vault-id, holder: holder, asset: ASSET-SBTC, shares: shares, amount: payout })
    (ok payout)))

;; ---- Strategy allocation (execution-engine only; Testnet-gated) ----
;; Moves `amount` of `asset` from the pool's IDLE balance into an approved
;; strategy. Share supply and total-balance are UNCHANGED: only the split
;; between idle and deployed capital moves. Reachable only via
;; execution-engine-v7 after risk-guard-v7 approved the exact same tuple,
;; and only when risk-guard says strategy execution is enabled - which is
;; never the case on Testnet. The strategy contract reference is verified
;; against strategy-registry before any funds move.
(define-public (execute-rebalance
    (vault-id uint)
    (dest-strategy-id uint)
    (asset (string-ascii 8))
    (amount uint)
    (strategy <strategy-trait>))
  (let (
      (idle (get-idle-balance vault-id asset))
      (registered-contract (contract-call? .strategy-registry-v6 get-strategy-contract dest-strategy-id))
    )
    (asserts! (is-execution-engine) ERR-NOT-EXECUTION-ENGINE)
    (asserts! (contract-call? .risk-guard-v7 is-strategy-execution-enabled) ERR-TESTNET-EXECUTION-DISABLED)
    (asserts! (is-valid-asset asset) ERR-INVALID-ASSET)
    (asserts! (is-some (map-get? vaults { vault-id: vault-id })) ERR-VAULT-NOT-FOUND)
    (asserts! (not (is-vault-paused vault-id)) ERR-VAULT-PAUSED)
    (asserts! (>= idle amount) ERR-INSUFFICIENT-IDLE-BALANCE)
    (asserts! (is-eq (some (contract-of strategy)) registered-contract) ERR-STRATEGY-CONTRACT-MISMATCH)
    (map-set idle-balances { vault-id: vault-id, asset: asset } (- idle amount))
    (unwrap! (as-contract (contract-call? strategy deposit amount)) ERR-TRANSFER-FAILED)
    (map-set strategy-allocations { vault-id: vault-id, strategy-id: dest-strategy-id, asset: asset }
      (+ (get-strategy-allocation vault-id dest-strategy-id asset) amount))
    (print { event: "rebalance-executed", vault-id: vault-id, dest-strategy-id: dest-strategy-id, asset: asset, amount: amount })
    (ok true)))
