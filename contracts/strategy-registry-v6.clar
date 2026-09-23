;; strategy-registry.clar
;;
;; Registry of destinations a vault's funds may be allocated to.
;;
;; Strategy id u0 is reserved and represents IDLE (funds held in the vault,
;; not deployed anywhere) - it is always valid and needs no registry entry,
;; for either supported asset.
;;
;; Every non-zero strategy id must be explicitly registered and activated
;; by the protocol admin before execution-engine.clar will allow any
;; vault to allocate funds to it. The execution engine and vault never
;; call an arbitrary contract; they only ever call the `strategy-contract`
;; principal recorded here, and only through strategy-trait.clar.
;;
;; Each strategy supports exactly one asset ("STX" or "SBTC"), explicitly
;; recorded and enforced by execution-engine.clar - an intent naming one
;; asset can never be routed into a strategy registered for the other.
;;
;; MVP STATUS: as of initial deployment this registry is seeded with ZERO
;; active strategies. No third-party Stacks Testnet yield protocol with a
;; verified, current interface was confirmed available at build time (see
;; docs/strategies.md). Registering a real strategy is a deliberate,
;; separate, auditable admin action - this contract will never be used to
;; paper over a missing integration with a fake one.

(define-constant ASSET-STX "STX")
(define-constant ASSET-SBTC "SBTC")

(define-constant ERR-NOT-ADMIN (err u400))
(define-constant ERR-ALREADY-EXISTS (err u401))
(define-constant ERR-NOT-FOUND (err u402))
(define-constant ERR-INVALID-PARAMS (err u403))
(define-constant ERR-INVALID-ASSET (err u404))

(define-data-var next-strategy-id uint u1)

(define-map strategies
  { strategy-id: uint }
  {
    name: (string-ascii 32),
    strategy-contract: principal,
    asset: (string-ascii 8),
    active: bool,
    max-allocation-bps: uint, ;; protocol-wide cap on % of a vault's holdings of `asset` that may sit in this strategy
    registered-at: uint
  })

(define-private (is-protocol-admin (who principal))
  (contract-call? .sovereignty-protocol-admin-v4 is-admin who))

(define-private (is-valid-asset (asset (string-ascii 8)))
  (or (is-eq asset ASSET-STX) (is-eq asset ASSET-SBTC)))

(define-read-only (get-strategy (strategy-id uint))
  (map-get? strategies { strategy-id: strategy-id }))

(define-read-only (get-strategy-asset (strategy-id uint))
  (get asset (map-get? strategies { strategy-id: strategy-id })))

(define-read-only (is-idle (strategy-id uint))
  (is-eq strategy-id u0))

;; A strategy id is usable by the execution engine if it is IDLE (u0) or a
;; registered, active entry.
(define-read-only (is-strategy-active (strategy-id uint))
  (if (is-idle strategy-id)
    true
    (default-to false (get active (map-get? strategies { strategy-id: strategy-id })))))

(define-read-only (get-strategy-contract (strategy-id uint))
  (get strategy-contract (map-get? strategies { strategy-id: strategy-id })))

(define-read-only (get-max-allocation-bps (strategy-id uint))
  (if (is-idle strategy-id)
    u10000
    (default-to u0 (get max-allocation-bps (map-get? strategies { strategy-id: strategy-id })))))

(define-public (register-strategy
    (name (string-ascii 32))
    (strategy-contract principal)
    (asset (string-ascii 8))
    (max-allocation-bps uint))
  (let ((strategy-id (var-get next-strategy-id)))
    (asserts! (is-protocol-admin tx-sender) ERR-NOT-ADMIN)
    (asserts! (is-valid-asset asset) ERR-INVALID-ASSET)
    (asserts! (and (> max-allocation-bps u0) (<= max-allocation-bps u10000)) ERR-INVALID-PARAMS)
    (map-set strategies { strategy-id: strategy-id }
      {
        name: name,
        strategy-contract: strategy-contract,
        asset: asset,
        active: false, ;; registered inactive; a separate activation call is required
        max-allocation-bps: max-allocation-bps,
        registered-at: stacks-block-height
      })
    (var-set next-strategy-id (+ strategy-id u1))
    (print { event: "strategy-registered", strategy-id: strategy-id, name: name, strategy-contract: strategy-contract, asset: asset })
    (ok strategy-id)))

(define-public (activate-strategy (strategy-id uint))
  (let ((entry (unwrap! (map-get? strategies { strategy-id: strategy-id }) ERR-NOT-FOUND)))
    (asserts! (is-protocol-admin tx-sender) ERR-NOT-ADMIN)
    (map-set strategies { strategy-id: strategy-id } (merge entry { active: true }))
    (print { event: "strategy-activated", strategy-id: strategy-id, admin: tx-sender })
    (ok true)))

(define-public (deactivate-strategy (strategy-id uint))
  (let ((entry (unwrap! (map-get? strategies { strategy-id: strategy-id }) ERR-NOT-FOUND)))
    (asserts! (is-protocol-admin tx-sender) ERR-NOT-ADMIN)
    (map-set strategies { strategy-id: strategy-id } (merge entry { active: false }))
    (print { event: "strategy-deactivated", strategy-id: strategy-id, admin: tx-sender })
    (ok true)))
