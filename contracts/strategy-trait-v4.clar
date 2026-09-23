;; Strategy adapter trait.
;;
;; Any external strategy contract that the protocol admin registers in
;; strategy-registry.clar must implement this interface before the vault
;; will ever call it. This is the extension point described in the
;; architecture docs (adapter pattern) for future yield strategies.
;;
;; MVP NOTE: no strategy contract implementing this trait has been
;; verified as a live, audited Stacks Testnet deployment at MVP build
;; time, so strategy-registry.clar ships with zero active strategies.
;; The vault only ever holds funds IDLE until a real adapter is verified
;; and registered by protocol governance.
(define-trait strategy-trait
  (
    ;; Deposit `amount` of the strategy's supported asset, transferred from
    ;; tx-sender (the vault, acting `as-contract`), into the strategy.
    (deposit (uint) (response bool uint))

    ;; Withdraw `amount` back to tx-sender (the vault).
    (withdraw (uint) (response bool uint))

    ;; Report the calling principal's current balance held in the strategy.
    (get-strategy-balance (principal) (response uint uint))
  )
)
