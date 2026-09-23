;; protocol-admin.clar
;;
;; Central admin/governance root for SovereigntyAI.
;;
;; Every other contract in the protocol checks `is-admin` here before
;; performing a privileged action, and checks `is-paused` here before
;; performing any fund-moving action. This is the ONLY contract that can
;; change who the admin is, and admin transfer is a deliberate two-step
;; process to avoid bricking the protocol with a typo'd address.
;;
;; Explicitly out of scope: the admin role has NO function anywhere in the
;; protocol that can move, withdraw, or redirect user funds. See
;; docs/security-model.md section "Admin key compromise".

(define-constant ERR-NOT-ADMIN (err u600))
(define-constant ERR-NOT-PENDING-ADMIN (err u601))
(define-constant ERR-ALREADY-PAUSED (err u602))
(define-constant ERR-NOT-PAUSED (err u603))
(define-constant ERR-SAME-ADMIN (err u604))

(define-data-var admin principal tx-sender)
(define-data-var pending-admin (optional principal) none)
(define-data-var protocol-paused bool false)

(define-read-only (get-admin)
  (var-get admin))

(define-read-only (is-admin (who principal))
  (is-eq who (var-get admin)))

(define-read-only (is-paused)
  (var-get protocol-paused))

;; Step 1: current admin nominates a successor. Takes no effect until the
;; nominee calls accept-admin.
(define-public (propose-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR-NOT-ADMIN)
    (asserts! (not (is-eq new-admin (var-get admin))) ERR-SAME-ADMIN)
    (var-set pending-admin (some new-admin))
    (print { event: "admin-proposed", current-admin: (var-get admin), pending-admin: new-admin })
    (ok true)))

;; Step 2: nominee accepts. Prevents transferring admin to an unreachable
;; or mistyped address.
(define-public (accept-admin)
  (let ((pending (var-get pending-admin)))
    (asserts! (is-some pending) ERR-NOT-PENDING-ADMIN)
    (asserts! (is-eq (some tx-sender) pending) ERR-NOT-ADMIN)
    (var-set admin tx-sender)
    (var-set pending-admin none)
    (print { event: "admin-transferred", new-admin: tx-sender })
    (ok true)))

(define-public (pause-protocol)
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR-NOT-ADMIN)
    (asserts! (not (var-get protocol-paused)) ERR-ALREADY-PAUSED)
    (var-set protocol-paused true)
    (print { event: "protocol-paused", admin: tx-sender })
    (ok true)))

(define-public (unpause-protocol)
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR-NOT-ADMIN)
    (asserts! (var-get protocol-paused) ERR-NOT-PAUSED)
    (var-set protocol-paused false)
    (print { event: "protocol-unpaused", admin: tx-sender })
    (ok true)))
