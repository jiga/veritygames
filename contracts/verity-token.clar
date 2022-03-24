;; verity-coin
;; A SIP010-compliant fungible token to reward honesty

(impl-trait .sip010-ft-trait.sip010-ft-trait)

;; SIP010 trait on mainnet
;; (impl-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

(define-constant CONTRACT_OWNER tx-sender)

;; honesty is limitless!
(define-fungible-token verity-coin)

(define-constant ERR_OWNER_ONLY (err u100))
(define-constant ERR_NOT_TOKEN_OWNER (err u101))

;; #[allow(unchecked_data)]
(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
	(begin
		(asserts! (is-eq tx-sender sender) ERR_OWNER_ONLY)
		;; (asserts! (is-eq contract-caller .veritygames) ERR_OWNER_ONLY)
		(try! (ft-transfer? verity-coin amount contract-caller recipient))
		(match memo to-print (print to-print) 0x)
		(ok true)
	)
)

(define-read-only (get-name)
	(ok "Verity Coin")
)

(define-read-only (get-symbol)
	(ok "VERITY")
)

(define-read-only (get-decimals)
	(ok u6) ;; same as stx
)

(define-read-only (get-balance (who principal))
	(ok (ft-get-balance verity-coin who))
)

(define-read-only (get-total-supply)
	(ok (ft-get-supply verity-coin))
)

(define-read-only (get-token-uri)
	(ok none)
)

;; #[allow(unchecked_data)]
(define-public (mint (amount uint) (recipient principal))
	(begin
		(asserts! (is-eq contract-caller .veritygames) ERR_OWNER_ONLY)
		(ft-mint? verity-coin amount recipient)
	)
)


;;#[allow(unchecked_data)]
(define-public (burn (amount uint) (sender principal))
	(begin
		(asserts! (> amount u0) (err u1))
		(asserts! (is-eq tx-sender sender) ERR_OWNER_ONLY)
		;; (asserts! (is-eq contract-caller .veritygames) ERR_OWNER_ONLY)
		(ft-burn? verity-coin amount sender)
	)
)