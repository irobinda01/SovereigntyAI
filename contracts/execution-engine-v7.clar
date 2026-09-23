;; execution-engine.clar
;;
;; Single entry point for turning a structured execution intent (produced
;; off-chain by the AI agent, or issued directly by a vault owner) into a
;; fund movement. It performs authorization and routing; it deliberately
;; contains none of the numeric guardrail logic - that all lives in
;; risk-guard-v7.clar so it can be audited as a single, independent unit.
;;
;; Every intent explicitly names its asset ("STX" or "SBTC") and its
;; destination; this contract enforces that the asset matches the
;; destination strategy's registered asset and the vault's supported assets.
;;
;; Two entry points share ONE evaluation pipeline:
;;
;;   evaluate-rebalance-intent  (READ-ONLY)
;;       Runs every check - authorization, routing, vault state, and every
;;       numeric guardrail - and reports the verdict, plus whether the
;;       environment would permit execution. Changes nothing, costs no
;;       fee. This is what "risk validation PASSED/FAILED" in the product
;;       is derived from.
;;
;;   submit-rebalance-intent    (PUBLIC)
;;       The same checks, then the TESTNET EXECUTION GATE, then (only on
;;       Stacks mainnet with execution armed) the vault call. On Testnet it
;;       ALWAYS reverts with ERR-TESTNET-EXECUTION-DISABLED after the risk
;;       checks pass: no nonce is consumed, no allocation changes, no funds
;;       move. The gate is enforced independently in three layers
;;       (here, risk-guard-v7, and the vault) so no single bug bypasses it.

(use-trait strategy-trait .strategy-trait-v4.strategy-trait)

(define-constant ERR-VAULT-NOT-FOUND (err u200))
(define-constant ERR-NOT-AUTHORIZED-EXECUTOR (err u201))
(define-constant ERR-STRATEGY-INACTIVE (err u202))
(define-constant ERR-INVALID-DESTINATION (err u203))
(define-constant ERR-INVALID-ASSET (err u204))
(define-constant ERR-ASSET-STRATEGY-MISMATCH (err u205))
(define-constant ERR-VAULT-PAUSED (err u206))
(define-constant ERR-ASSET-NOT-SUPPORTED (err u207))
(define-constant ERR-TESTNET-EXECUTION-DISABLED (err u208))

(define-constant ASSET-STX "STX")
(define-constant ASSET-SBTC "SBTC")

;; Authorization + routing + full risk validation. Read-only safe (no
;; writes), so it backs both the read-only evaluation and the public submit.
(define-private (evaluate
    (vault-id uint)
    (dest-strategy-id uint)
    (asset (string-ascii 8))
    (amount uint)
    (max-slippage-bps uint)
    (nonce uint)
    (deadline uint))
  (let (
      (vault (unwrap! (contract-call? .sovereignty-vault-v7 get-vault vault-id) ERR-VAULT-NOT-FOUND))
      (caller-is-owner (is-eq tx-sender (get owner vault)))
    )
    (asserts! (> dest-strategy-id u0) ERR-INVALID-DESTINATION)
    (asserts! (or (is-eq asset ASSET-STX) (is-eq asset ASSET-SBTC)) ERR-INVALID-ASSET)
    (asserts! (contract-call? .sovereignty-vault-v7 supports-asset vault-id asset) ERR-ASSET-NOT-SUPPORTED)
    (asserts! (not (get paused vault)) ERR-VAULT-PAUSED)
    (asserts! (or caller-is-owner (contract-call? .agent-registry-v4 is-authorized-executor tx-sender))
      ERR-NOT-AUTHORIZED-EXECUTOR)
    (asserts! (contract-call? .strategy-registry-v6 is-strategy-active dest-strategy-id) ERR-STRATEGY-INACTIVE)
    (asserts! (is-eq (some asset) (contract-call? .strategy-registry-v6 get-strategy-asset dest-strategy-id))
      ERR-ASSET-STRATEGY-MISMATCH)
    (try! (contract-call? .risk-guard-v7 check-intent
      vault-id asset amount max-slippage-bps nonce deadline caller-is-owner
      (contract-call? .sovereignty-vault-v7 get-idle-balance vault-id asset)
      (contract-call? .sovereignty-vault-v7 get-total-balance vault-id asset)
      (contract-call? .sovereignty-vault-v7 get-strategy-allocation vault-id dest-strategy-id asset)
      (contract-call? .strategy-registry-v6 get-max-allocation-bps dest-strategy-id)))
    (ok caller-is-owner)))

;; `tx-sender` in a read-only call is the `sender` supplied by the caller,
;; so an agent evaluates "as the executor" and an owner "as the owner".
(define-read-only (evaluate-rebalance-intent
    (vault-id uint)
    (dest-strategy-id uint)
    (asset (string-ascii 8))
    (amount uint)
    (max-slippage-bps uint)
    (nonce uint)
    (deadline uint))
  (let ((caller-is-owner (try! (evaluate vault-id dest-strategy-id asset amount max-slippage-bps nonce deadline))))
    (ok {
      risk-validation-passed: true,
      caller-is-owner: caller-is-owner,
      strategy-execution-enabled: (contract-call? .risk-guard-v7 is-strategy-execution-enabled)
    })))

(define-public (submit-rebalance-intent
    (vault-id uint)
    (dest-strategy-id uint)
    (asset (string-ascii 8))
    (amount uint)
    (max-slippage-bps uint)
    (nonce uint)
    (deadline uint)
    (strategy <strategy-trait>))
  (let ((caller-is-owner (try! (evaluate vault-id dest-strategy-id asset amount max-slippage-bps nonce deadline))))
    ;; TESTNET EXECUTION GATE - reached only by intents that passed every risk check.
    (asserts! (contract-call? .risk-guard-v7 is-strategy-execution-enabled) ERR-TESTNET-EXECUTION-DISABLED)
    (try! (contract-call? .risk-guard-v7 validate-and-record-intent
      vault-id asset amount max-slippage-bps nonce deadline caller-is-owner
      (contract-call? .sovereignty-vault-v7 get-idle-balance vault-id asset)
      (contract-call? .sovereignty-vault-v7 get-total-balance vault-id asset)
      (contract-call? .sovereignty-vault-v7 get-strategy-allocation vault-id dest-strategy-id asset)
      (contract-call? .strategy-registry-v6 get-max-allocation-bps dest-strategy-id)))
    (try! (contract-call? .sovereignty-vault-v7 execute-rebalance vault-id dest-strategy-id asset amount strategy))
    (print {
      event: "intent-executed",
      vault-id: vault-id,
      action: "REBALANCE",
      dest-strategy-id: dest-strategy-id,
      asset: asset,
      amount: amount,
      max-slippage-bps: max-slippage-bps,
      nonce: nonce,
      deadline: deadline,
      executor: tx-sender,
      executed-by-owner: caller-is-owner
    })
    (ok true)))
