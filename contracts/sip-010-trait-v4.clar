;; SIP-010 Fungible Token trait definition.
;; Mirrors the canonical SIP-010 standard so this project can compile
;; without a Testnet-only trait import. Structurally identical to the
;; trait implemented by the deployed sBTC token contract
;; (SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token on Stacks Testnet),
;; so a `<sip-010-trait>` reference to that contract satisfies this trait.
(define-trait sip-010-trait
  (
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))
    (get-name () (response (string-ascii 32) uint))
    (get-symbol () (response (string-ascii 32) uint))
    (get-decimals () (response uint uint))
    (get-balance (principal) (response uint uint))
    (get-total-supply () (response uint uint))
    (get-token-uri () (response (optional (string-utf8 256)) uint))
  )
)
