;; risk-guard.clar
;;
;; The deterministic on-chain enforcement layer: "AI proposes, Clarity
;; enforces." It does not know or care how an execution intent was
;; produced (an AI model, a script, a human) - it independently recomputes
;; every guardrail from first principles and rejects anything that
;; violates them.
;;
;; This contract does NOT prove an intent is economically sound. It only
;; proves an intent stays within the deterministic bounds the protocol and
;; the vault owner configured in advance.
;;
;; ---- TESTNET EXECUTION GATE (first-class protocol state) ----
;; Strategy execution is only ever possible when BOTH
;;   (a) the chain is Stacks MAINNET (`chain-id` == u1), and
;;   (b) governance has explicitly armed mainnet execution.
;; (a) is read from the chain itself, not from a flag: no admin key, no
;; transaction and no frontend can enable strategy execution on Testnet.
;; (b) defaults to false, so even a mainnet deployment fails CLOSED.
;; Analysis, recommendation, intent generation and risk validation are all
;; unaffected - see `check-intent` (pure validation) below.
;;
;; Vault-config-mutating functions may only be called by
;; sovereignty-vault-v7.clar (contract-caller check) - the vault itself is
;; responsible for verifying tx-sender is the vault owner before calling
;; in. Intent recording may only be called by execution-engine-v7.clar.
;;
;; Exposure, slippage, cooldown, min-idle and the autonomous-mode switch
;; are shared vault-wide across both assets (they are relative/behavioral
;; settings); maximum transaction size is tracked separately per asset
;; since it is an absolute amount and STX/sBTC have different unit scales.
;;
;; Semantics of the two allocation limits:
;;   max-exposure-bps : per-STRATEGY concentration cap - no single strategy
;;                      may hold more than this share of the vault's pool
;;                      of that asset.
;;   min-idle-bps     : AGGREGATE liquidity floor - after any allocation at
;;                      least this share of the pool must stay idle (i.e.
;;                      immediately redeemable by receipt holders).

(define-constant ASSET-STX "STX")
(define-constant ASSET-SBTC "SBTC")
(define-constant MAINNET-CHAIN-ID u1)

(define-constant ERR-NOT-ADMIN (err u300))
(define-constant ERR-NOT-VAULT-CONTRACT (err u301))
(define-constant ERR-NOT-EXECUTION-ENGINE (err u302))
(define-constant ERR-PROTOCOL-PAUSED (err u303))
(define-constant ERR-VAULT-NOT-CONFIGURED (err u304))
(define-constant ERR-VAULT-ALREADY-CONFIGURED (err u305))
(define-constant ERR-AUTONOMOUS-DISABLED (err u306))
(define-constant ERR-INTENT-EXPIRED (err u307))
(define-constant ERR-INVALID-NONCE (err u308))
(define-constant ERR-COOLDOWN-ACTIVE (err u309))
(define-constant ERR-ZERO-AMOUNT (err u310))
(define-constant ERR-TX-AMOUNT-EXCEEDED (err u311))
(define-constant ERR-EXPOSURE-EXCEEDED (err u312))
(define-constant ERR-PROTOCOL-EXPOSURE-EXCEEDED (err u313))
(define-constant ERR-SLIPPAGE-EXCEEDED (err u314))
(define-constant ERR-INSUFFICIENT-SOURCE-BALANCE (err u315))
(define-constant ERR-MIN-LIQUIDITY-VIOLATED (err u316))
(define-constant ERR-INVALID-PARAMS (err u317))
(define-constant ERR-DIVISION-ERROR (err u318))
(define-constant ERR-INVALID-ASSET (err u319))
(define-constant ERR-TESTNET-EXECUTION-DISABLED (err u320))
(define-constant ERR-MAINNET-ONLY (err u321))

(define-constant BPS-DENOMINATOR u10000)

;; ---- Protocol-wide ceilings (admin-configurable, bound every vault) ----
(define-data-var protocol-max-slippage-bps uint u1000)   ;; 10% hard ceiling
(define-data-var protocol-max-exposure-bps uint u5000)   ;; 50% hard ceiling
(define-data-var protocol-min-cooldown-blocks uint u1)   ;; floor on vault cooldown
(define-data-var protocol-min-liquidity-bps uint u500)   ;; 5% of pool must stay liquid post-rebalance
(define-data-var approved-sbtc-asset (optional principal) none)
(define-data-var mainnet-execution-armed bool false)

;; ---- Per-vault risk configuration ----
(define-map vault-config
  { vault-id: uint }
  {
    max-exposure-bps: uint,
    max-stx-tx-amount: uint,
    max-sbtc-tx-amount: uint,
    max-slippage-bps: uint,
    min-idle-bps: uint,
    autonomous-enabled: bool,
    cooldown-blocks: uint,
    last-used-nonce: uint,
    last-execution-height: uint
  })

(define-private (is-protocol-admin (who principal))
  (contract-call? .sovereignty-protocol-admin-v4 is-admin who))

(define-private (is-vault-contract)
  (is-eq contract-caller .sovereignty-vault-v7))

(define-private (is-execution-engine)
  (is-eq contract-caller .execution-engine-v7))

(define-private (is-valid-asset (asset (string-ascii 8)))
  (or (is-eq asset ASSET-STX) (is-eq asset ASSET-SBTC)))

(define-private (max-tx-amount-for (cfg {
      max-exposure-bps: uint, max-stx-tx-amount: uint, max-sbtc-tx-amount: uint,
      max-slippage-bps: uint, min-idle-bps: uint, autonomous-enabled: bool,
      cooldown-blocks: uint, last-used-nonce: uint, last-execution-height: uint
    }) (asset (string-ascii 8)))
  (if (is-eq asset ASSET-STX) (get max-stx-tx-amount cfg) (get max-sbtc-tx-amount cfg)))

;; ---- Reads ----

(define-read-only (get-vault-config (vault-id uint))
  (map-get? vault-config { vault-id: vault-id }))

(define-read-only (get-protocol-limits)
  {
    max-slippage-bps: (var-get protocol-max-slippage-bps),
    max-exposure-bps: (var-get protocol-max-exposure-bps),
    min-cooldown-blocks: (var-get protocol-min-cooldown-blocks),
    min-liquidity-bps: (var-get protocol-min-liquidity-bps),
    approved-sbtc-asset: (var-get approved-sbtc-asset)
  })

(define-read-only (get-approved-sbtc-asset)
  (var-get approved-sbtc-asset))

(define-read-only (is-mainnet-chain)
  (is-eq chain-id MAINNET-CHAIN-ID))

;; The single source of truth for "may any vault fund enter a strategy
;; right now". Fails closed: false on Testnet regardless of any admin action.
(define-read-only (is-strategy-execution-enabled)
  (and (is-mainnet-chain) (var-get mainnet-execution-armed)))

(define-read-only (get-execution-environment)
  {
    network: (if (is-mainnet-chain) "MAINNET" "TESTNET"),
    chain-id: chain-id,
    mainnet-execution-armed: (var-get mainnet-execution-armed),
    strategy-execution-enabled: (is-strategy-execution-enabled)
  })

;; ---- Admin: protocol ceilings ----

(define-public (set-approved-sbtc-asset (asset principal))
  (begin
    (asserts! (is-protocol-admin tx-sender) ERR-NOT-ADMIN)
    (var-set approved-sbtc-asset (some asset))
    (print { event: "approved-sbtc-asset-set", asset: asset })
    (ok true)))

(define-public (set-protocol-limits
    (max-slippage-bps uint)
    (max-exposure-bps uint)
    (min-cooldown-blocks uint)
    (min-liquidity-bps uint))
  (begin
    (asserts! (is-protocol-admin tx-sender) ERR-NOT-ADMIN)
    (asserts! (and (> max-slippage-bps u0) (<= max-slippage-bps BPS-DENOMINATOR)) ERR-INVALID-PARAMS)
    (asserts! (and (> max-exposure-bps u0) (<= max-exposure-bps BPS-DENOMINATOR)) ERR-INVALID-PARAMS)
    (asserts! (<= min-liquidity-bps BPS-DENOMINATOR) ERR-INVALID-PARAMS)
    (var-set protocol-max-slippage-bps max-slippage-bps)
    (var-set protocol-max-exposure-bps max-exposure-bps)
    (var-set protocol-min-cooldown-blocks min-cooldown-blocks)
    (var-set protocol-min-liquidity-bps min-liquidity-bps)
    (print { event: "protocol-limits-updated", max-slippage-bps: max-slippage-bps, max-exposure-bps: max-exposure-bps, min-cooldown-blocks: min-cooldown-blocks, min-liquidity-bps: min-liquidity-bps })
    (ok true)))

;; Arming can only ever be done on MAINNET. On Testnet this always fails,
;; so the "armed" flag can never be true there either.
(define-public (set-mainnet-execution-armed (armed bool))
  (begin
    (asserts! (is-protocol-admin tx-sender) ERR-NOT-ADMIN)
    (asserts! (is-mainnet-chain) ERR-MAINNET-ONLY)
    (var-set mainnet-execution-armed armed)
    (print { event: "mainnet-execution-armed-set", armed: armed })
    (ok true)))

;; ---- Vault-only: config lifecycle ----

(define-private (params-valid
    (max-exposure-bps uint)
    (max-stx-tx-amount uint)
    (max-sbtc-tx-amount uint)
    (max-slippage-bps uint)
    (min-idle-bps uint)
    (cooldown-blocks uint))
  (and
    (> max-exposure-bps u0)
    (<= max-exposure-bps (var-get protocol-max-exposure-bps))
    (> max-slippage-bps u0)
    (<= max-slippage-bps (var-get protocol-max-slippage-bps))
    (>= min-idle-bps (var-get protocol-min-liquidity-bps))
    (<= min-idle-bps BPS-DENOMINATOR)
    (>= cooldown-blocks (var-get protocol-min-cooldown-blocks))
    (> max-stx-tx-amount u0)
    (> max-sbtc-tx-amount u0)))

;; Called exactly once by sovereignty-vault.clar when a vault is created,
;; with the parameters the owner chose in the creation flow. Nothing here is
;; defaulted on the owner's behalf: whatever preset the UI proposed, the
;; owner reviewed and signed these exact numbers.
(define-public (init-vault-config
    (vault-id uint)
    (max-exposure-bps uint)
    (max-stx-tx-amount uint)
    (max-sbtc-tx-amount uint)
    (max-slippage-bps uint)
    (min-idle-bps uint)
    (autonomous-enabled bool)
    (cooldown-blocks uint))
  (begin
    (asserts! (is-vault-contract) ERR-NOT-VAULT-CONTRACT)
    (asserts! (is-none (map-get? vault-config { vault-id: vault-id })) ERR-VAULT-ALREADY-CONFIGURED)
    (asserts! (params-valid max-exposure-bps max-stx-tx-amount max-sbtc-tx-amount max-slippage-bps min-idle-bps cooldown-blocks)
      ERR-INVALID-PARAMS)
    (map-set vault-config { vault-id: vault-id }
      {
        max-exposure-bps: max-exposure-bps,
        max-stx-tx-amount: max-stx-tx-amount,
        max-sbtc-tx-amount: max-sbtc-tx-amount,
        max-slippage-bps: max-slippage-bps,
        min-idle-bps: min-idle-bps,
        autonomous-enabled: autonomous-enabled,
        cooldown-blocks: cooldown-blocks,
        last-used-nonce: u0,
        last-execution-height: u0
      })
    (ok true)))

(define-public (set-vault-risk-config
    (vault-id uint)
    (max-exposure-bps uint)
    (max-stx-tx-amount uint)
    (max-sbtc-tx-amount uint)
    (max-slippage-bps uint)
    (min-idle-bps uint)
    (autonomous-enabled bool)
    (cooldown-blocks uint))
  (let ((existing (unwrap! (map-get? vault-config { vault-id: vault-id }) ERR-VAULT-NOT-CONFIGURED)))
    (asserts! (is-vault-contract) ERR-NOT-VAULT-CONTRACT)
    (asserts! (params-valid max-exposure-bps max-stx-tx-amount max-sbtc-tx-amount max-slippage-bps min-idle-bps cooldown-blocks)
      ERR-INVALID-PARAMS)
    (map-set vault-config { vault-id: vault-id }
      (merge existing
        {
          max-exposure-bps: max-exposure-bps,
          max-stx-tx-amount: max-stx-tx-amount,
          max-sbtc-tx-amount: max-sbtc-tx-amount,
          max-slippage-bps: max-slippage-bps,
          min-idle-bps: min-idle-bps,
          autonomous-enabled: autonomous-enabled,
          cooldown-blocks: cooldown-blocks
        }))
    (ok true)))

(define-public (set-autonomous-enabled (vault-id uint) (enabled bool))
  (let ((existing (unwrap! (map-get? vault-config { vault-id: vault-id }) ERR-VAULT-NOT-CONFIGURED)))
    (asserts! (is-vault-contract) ERR-NOT-VAULT-CONTRACT)
    (map-set vault-config { vault-id: vault-id } (merge existing { autonomous-enabled: enabled }))
    (ok true)))

;; ---- Intent validation ----
;;
;; PURE VALIDATION. Recomputes every guardrail independently from the raw
;; numbers gathered from the vault and strategy registry; never trusts a
;; pre-computed "is this valid" flag from any off-chain caller. Read-only,
;; so the AI agent and the frontend can obtain a genuine on-chain verdict
;; without submitting a transaction - this is what the "risk validation:
;; PASSED" status in the UI is derived from.
(define-read-only (check-intent
    (vault-id uint)
    (asset (string-ascii 8))
    (amount uint)
    (requested-slippage-bps uint)
    (nonce uint)
    (deadline uint)
    (caller-is-owner bool)
    (source-available-balance uint)
    (vault-total-balance uint)
    (dest-current-allocation uint)
    (dest-protocol-max-allocation-bps uint))
  (let ((cfg (unwrap! (map-get? vault-config { vault-id: vault-id }) ERR-VAULT-NOT-CONFIGURED)))
    (asserts! (is-valid-asset asset) ERR-INVALID-ASSET)
    (asserts! (not (contract-call? .sovereignty-protocol-admin-v4 is-paused)) ERR-PROTOCOL-PAUSED)
    (asserts! (or caller-is-owner (get autonomous-enabled cfg)) ERR-AUTONOMOUS-DISABLED)
    (asserts! (>= deadline stacks-block-height) ERR-INTENT-EXPIRED)
    (asserts! (> nonce (get last-used-nonce cfg)) ERR-INVALID-NONCE)
    (asserts! (or (is-eq (get last-execution-height cfg) u0)
                  (>= stacks-block-height (+ (get last-execution-height cfg) (get cooldown-blocks cfg))))
      ERR-COOLDOWN-ACTIVE)
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (asserts! (<= amount (max-tx-amount-for cfg asset)) ERR-TX-AMOUNT-EXCEEDED)
    (asserts! (<= amount source-available-balance) ERR-INSUFFICIENT-SOURCE-BALANCE)
    (asserts! (> vault-total-balance u0) ERR-INVALID-PARAMS)
    (asserts! (<= requested-slippage-bps (get max-slippage-bps cfg)) ERR-SLIPPAGE-EXCEEDED)
    (let (
        (resulting-allocation-bps (/ (* (+ dest-current-allocation amount) BPS-DENOMINATOR) vault-total-balance))
        (resulting-idle-bps (/ (* (- source-available-balance amount) BPS-DENOMINATOR) vault-total-balance))
        (idle-floor-bps (get min-idle-bps cfg))
      )
      (asserts! (<= resulting-allocation-bps (get max-exposure-bps cfg)) ERR-EXPOSURE-EXCEEDED)
      (asserts! (<= resulting-allocation-bps dest-protocol-max-allocation-bps) ERR-PROTOCOL-EXPOSURE-EXCEEDED)
      (asserts! (>= resulting-idle-bps idle-floor-bps) ERR-MIN-LIQUIDITY-VIOLATED)
      (ok true))))

;; Execution-engine-only: validate AND record (consumes the nonce, starts
;; the cooldown). The testnet gate is checked only AFTER every risk check
;; has passed, so a blocked-on-testnet result always means "this intent
;; was otherwise valid"; any real rule violation still surfaces with its
;; own specific error code first. Because the gate failure reverts the
;; whole transaction, nothing is recorded on Testnet.
(define-public (validate-and-record-intent
    (vault-id uint)
    (asset (string-ascii 8))
    (amount uint)
    (requested-slippage-bps uint)
    (nonce uint)
    (deadline uint)
    (caller-is-owner bool)
    (source-available-balance uint)
    (vault-total-balance uint)
    (dest-current-allocation uint)
    (dest-protocol-max-allocation-bps uint))
  (let ((cfg (unwrap! (map-get? vault-config { vault-id: vault-id }) ERR-VAULT-NOT-CONFIGURED)))
    (asserts! (is-execution-engine) ERR-NOT-EXECUTION-ENGINE)
    (try! (check-intent vault-id asset amount requested-slippage-bps nonce deadline caller-is-owner
      source-available-balance vault-total-balance dest-current-allocation dest-protocol-max-allocation-bps))
    (asserts! (is-strategy-execution-enabled) ERR-TESTNET-EXECUTION-DISABLED)
    (map-set vault-config { vault-id: vault-id }
      (merge cfg { last-used-nonce: nonce, last-execution-height: stacks-block-height }))
    (ok true)))
