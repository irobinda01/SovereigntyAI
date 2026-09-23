;; agent-registry.clar
;;
;; Maintains the set of AI executor identities authorized to submit
;; execution intents to execution-engine.clar.
;;
;; SECURITY INVARIANT: an executor can NEVER register or revoke itself, or
;; any other executor. Only the protocol admin (protocol-admin.clar) may
;; change this registry. This is what stops a compromised or misbehaving
;; AI agent key from granting itself (or a second key) authority.

(define-constant ERR-NOT-ADMIN (err u500))
(define-constant ERR-ALREADY-REGISTERED (err u501))
(define-constant ERR-NOT-REGISTERED (err u502))
(define-constant ERR-ALREADY-ACTIVE-STATE (err u503))

(define-map executors
  { executor: principal }
  {
    active: bool,
    label: (string-ascii 64),
    registered-at: uint,
    registered-by: principal
  })

(define-private (is-protocol-admin (who principal))
  (contract-call? .sovereignty-protocol-admin-v4 is-admin who))

(define-read-only (is-authorized-executor (who principal))
  (default-to false (get active (map-get? executors { executor: who }))))

(define-read-only (get-executor (who principal))
  (map-get? executors { executor: who }))

(define-public (register-executor (executor principal) (label (string-ascii 64)))
  (begin
    (asserts! (is-protocol-admin tx-sender) ERR-NOT-ADMIN)
    (asserts! (is-none (map-get? executors { executor: executor })) ERR-ALREADY-REGISTERED)
    (map-set executors { executor: executor }
      {
        active: true,
        label: label,
        registered-at: stacks-block-height,
        registered-by: tx-sender
      })
    (print { event: "executor-registered", executor: executor, label: label, admin: tx-sender })
    (ok true)))

(define-public (revoke-executor (executor principal))
  (let ((entry (unwrap! (map-get? executors { executor: executor }) ERR-NOT-REGISTERED)))
    (asserts! (is-protocol-admin tx-sender) ERR-NOT-ADMIN)
    (asserts! (get active entry) ERR-ALREADY-ACTIVE-STATE)
    (map-set executors { executor: executor } (merge entry { active: false }))
    (print { event: "executor-revoked", executor: executor, admin: tx-sender })
    (ok true)))

(define-public (reactivate-executor (executor principal))
  (let ((entry (unwrap! (map-get? executors { executor: executor }) ERR-NOT-REGISTERED)))
    (asserts! (is-protocol-admin tx-sender) ERR-NOT-ADMIN)
    (asserts! (not (get active entry)) ERR-ALREADY-ACTIVE-STATE)
    (map-set executors { executor: executor } (merge entry { active: true }))
    (print { event: "executor-reactivated", executor: executor, admin: tx-sender })
    (ok true)))
