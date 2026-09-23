;; mock-strategy.clar  --  TEST FIXTURE ONLY.
;;
;; This contract is NOT part of the deployable SovereigntyAI protocol and
;; is NEVER referenced by Clarinet.toml or any deployment script. It
;; exists solely so the Clarinet/vitest unit test suite can exercise the
;; full execution-engine -> risk-guard -> vault -> strategy call path
;; against something that implements strategy-trait.clar, without
;; pretending any real external protocol integration exists.
;;
;; It is intentionally trivial: it just accepts deposits/withdrawals of
;; the configured asset and tracks a balance per depositor. It performs
;; no yield generation of any kind, and the frontend must never display
;; it as a real, available strategy.

(impl-trait .strategy-trait-v4.strategy-trait)

(define-map balances principal uint)

(define-public (deposit (amount uint))
  (begin
    (map-set balances tx-sender (+ (default-to u0 (map-get? balances tx-sender)) amount))
    (ok true)))

(define-public (withdraw (amount uint))
  (let ((bal (default-to u0 (map-get? balances tx-sender))))
    (asserts! (>= bal amount) (err u9001))
    (map-set balances tx-sender (- bal amount))
    (ok true)))

(define-read-only (get-strategy-balance (who principal))
  (ok (default-to u0 (map-get? balances who))))
