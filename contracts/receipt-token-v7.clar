;; receipt-token.clar
;;
;; Vault receipt shares. A receipt share is an ACCOUNTING CLAIM on one
;; specific vault's pool of one specific asset - not a speculative token,
;; not a governance token, not a profit token.
;;
;; One contract, many vaults. A balance is identified by the triple
;;   (vault-id, asset, holder)
;; so shares of vault #1 and vault #2 (or STX shares and sBTC shares of
;; the same vault) live in completely separate map entries and can never be
;; mixed, summed or confused. STX and sBTC shares are deliberately
;; SEPARATE SHARE CLASSES: there is no verified on-chain STX/sBTC price
;; source on Testnet, so this contract (and the vault) never converts
;; between them.
;;
;; Semantics are SIP-013 (semi-fungible) shaped - a token class is
;; (vault-id, asset) - but this contract does not claim SIP-013 trait
;; conformance: shares are non-transferable in the MVP and no verified
;; SIP-013 trait deployment is referenced.
;;
;; SECURITY INVARIANTS (tested in tests/receipt-token.test.ts):
;;   - only sovereignty-vault-v7 can mint or burn (contract-caller check).
;;     There is no admin, owner or AI path to mint. Users cannot mint.
;;   - mint and burn keep balances and supply in lock-step, so for every
;;     class: sum(balances) == supply.
;;   - shares are NON-TRANSFERABLE in the MVP. `transfer` always fails.
;;     This keeps "who may redeem" identical to "who deposited" and removes
;;     an entire class of accounting/permission edge cases. Ownership of a
;;     vault (permissions) is never represented by these shares.

(define-constant ASSET-STX "STX")
(define-constant ASSET-SBTC "SBTC")

(define-constant ERR-NOT-VAULT (err u700))
(define-constant ERR-INVALID-ASSET (err u701))
(define-constant ERR-ZERO-AMOUNT (err u702))
(define-constant ERR-INSUFFICIENT-BALANCE (err u703))
(define-constant ERR-NON-TRANSFERABLE (err u704))

(define-map balances { vault-id: uint, asset: (string-ascii 8), holder: principal } uint)
(define-map supplies { vault-id: uint, asset: (string-ascii 8) } uint)

(define-private (is-vault-contract)
  (is-eq contract-caller .sovereignty-vault-v7))

(define-private (is-valid-asset (asset (string-ascii 8)))
  (or (is-eq asset ASSET-STX) (is-eq asset ASSET-SBTC)))

;; ---- Reads (authoritative on-chain state; the frontend never trusts a database for these) ----

(define-read-only (get-balance (vault-id uint) (asset (string-ascii 8)) (holder principal))
  (default-to u0 (map-get? balances { vault-id: vault-id, asset: asset, holder: holder })))

(define-read-only (get-total-supply (vault-id uint) (asset (string-ascii 8)))
  (default-to u0 (map-get? supplies { vault-id: vault-id, asset: asset })))

;; Shares carry the same number of decimals as the underlying asset
;; (initial deposits mint shares 1:1 in base units).
(define-read-only (get-decimals (asset (string-ascii 8)))
  (if (is-eq asset ASSET-STX) (some u6) (if (is-eq asset ASSET-SBTC) (some u8) none)))

(define-read-only (get-name)
  "SovereigntyAI Vault Receipt")

(define-read-only (get-symbol)
  "svAI")

(define-read-only (is-transferable)
  false)

;; ---- Vault-only writes ----

(define-public (mint (vault-id uint) (asset (string-ascii 8)) (amount uint) (recipient principal))
  (let (
      (balance (get-balance vault-id asset recipient))
      (supply (get-total-supply vault-id asset))
    )
    (asserts! (is-vault-contract) ERR-NOT-VAULT)
    (asserts! (is-valid-asset asset) ERR-INVALID-ASSET)
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (map-set balances { vault-id: vault-id, asset: asset, holder: recipient } (+ balance amount))
    (map-set supplies { vault-id: vault-id, asset: asset } (+ supply amount))
    (print { event: "receipts-minted", vault-id: vault-id, asset: asset, holder: recipient, amount: amount, new-supply: (+ supply amount) })
    (ok true)))

(define-public (burn (vault-id uint) (asset (string-ascii 8)) (amount uint) (holder principal))
  (let (
      (balance (get-balance vault-id asset holder))
      (supply (get-total-supply vault-id asset))
    )
    (asserts! (is-vault-contract) ERR-NOT-VAULT)
    (asserts! (is-valid-asset asset) ERR-INVALID-ASSET)
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (asserts! (>= balance amount) ERR-INSUFFICIENT-BALANCE)
    (map-set balances { vault-id: vault-id, asset: asset, holder: holder } (- balance amount))
    (map-set supplies { vault-id: vault-id, asset: asset } (- supply amount))
    (print { event: "receipts-burned", vault-id: vault-id, asset: asset, holder: holder, amount: amount, new-supply: (- supply amount) })
    (ok true)))

;; Present so wallets/integrations get a deterministic, documented answer
;; instead of "unknown function". Always fails in the MVP.
(define-public (transfer (vault-id uint) (asset (string-ascii 8)) (amount uint) (sender principal) (recipient principal))
  ERR-NON-TRANSFERABLE)
