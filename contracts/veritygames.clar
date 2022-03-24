;; veritygames
;; @description on-chain marketplace for making prediction stakes using Proof-of-Honesty consensus
;; @version 1
;; @author j2p2
;;

;; constants
;;
;; deployer of the contract
(define-constant CONTRACT_OWNER tx-sender)
;; Number of blocks to wait for consensus (roughly 48hrs)
(define-constant DEFAULT_CONSENSUS_PERIOD u288)
;; Default game state used during consensus
(define-constant DEFAULT_GAME_STATE {
	creatorClaim: none, 
	challengerClaim: none, 
	winner: none,
	looser: none,
	creatorVerity: u0,
	challengerVerity: u0,
	creatorCollected: false, 
	challengerCollected: false
})

;; error codes
;;
(define-constant ERR_BAD_REQUEST (err u400))
(define-constant ERR_UNAUTHORIZED (err u401))
(define-constant ERR_FORBIDDEN (err u403))
(define-constant ERR_GAME_NOT_FOUND (err u404))
(define-constant ERR_OFFER_NOT_FOUND (err u405))
(define-constant ERR_OFFER_FOR_GAME_NOT_FOUND (err u406))
(define-constant ERR_TIMEOUT_IN_PAST (err u407))
(define-constant ERR_TIMEOUT_NOT_REACHED (err u408))
(define-constant ERR_CONSENSUS_PERIOD_TIMEDOUT (err u409))
(define-constant ERR_ZERO_VALUE (err u410))
(define-constant ERR_WINNER_ALREADY_CLAIMED (err u411))
(define-constant ERR_SHOULD_NEVER_HAPPEN (err u419))


;; data maps and vars
;;
;; gameNonce stores the next gameId
(define-data-var gameNonce uint u0)
;; offerNonce stores the next offerId
(define-data-var offerNonce uint u0)

;; Games map stores all games keyed by gameId
(define-map Games uint {
	creator: principal,				;; player address
	eventDesc: (string-utf8 2048),	;; prediction event description
	riskValue: uint,				;; amount at stake in micro-stx
	timeout: uint,					;; game timeout
	offerId: (optional uint),		;; accepted offerId
	state: (optional {
		creatorClaim : (optional bool),		;; stores self declaration of victory by creator
		challengerClaim : (optional bool),	;; stores self declaration of victory by challenger
		winner : (optional principal),		;; stores judged winner
		looser : (optional principal),		;; stores judged looser
		creatorVerity : uint,				;; stores $VERITY amount at the time of accept step
		challengerVerity : uint,			;; stores $VERITY amount at the time of accept step
		creatorCollected : bool,			;; stores if creator has collected award/penalty/refund
		challengerCollected : bool			;; stores if challenger has collected award/penalty/refund
	})
}) 

;; Offers map stores all offers keyed by offerId
(define-map Offers uint {
	gameId: uint,					;; game  to challenge
	challenger: principal, 			;; challenger address
	offerDesc: (string-utf8 2048),	;; offer description
	offerValue: uint,				;; amount at stake in micro-stx
	timeout: uint					;; offer timeout
}) 

;; private functions
;;
;; is-creator function returns true if transaction sender is the creator for given gameId
(define-private (is-creator (gameId uint))
	(is-eq (some tx-sender) (get creator (get-game gameId)))
)

;; is-challenger function returns true if transaction sender is the challenger for given gameId
(define-private (is-challenger (offerId uint))
	(is-eq (some tx-sender) (get challenger (get-offer offerId)))
)

;; public functions
;;
;; get-game function returns game data for matching gameId
(define-read-only (get-game (gameId uint))
	(map-get? Games gameId)
)

;; get-offer function returns offer data for matching offerId
(define-read-only (get-offer (offerId uint))
	(map-get? Offers offerId)
)

;; start function creates new entry in Games map data
(define-public (start (desc (string-utf8 2048)) (risk uint) (endingBlock uint))
	(let ((gameId (var-get gameNonce)))
		(asserts! (not (is-eq desc u"")) ERR_BAD_REQUEST)
		(asserts! (> endingBlock block-height) ERR_TIMEOUT_IN_PAST)
		(asserts! (> risk u0) ERR_ZERO_VALUE)
		(try! (stx-transfer? risk tx-sender (as-contract tx-sender)))
		(map-set Games gameId {creator: tx-sender, eventDesc: desc, riskValue: risk, timeout: endingBlock,
					offerId: none, state: none})
		(var-set gameNonce (+ gameId u1))

		(print {action: "start", who: tx-sender, gameId: gameId, game: (get-game gameId)})
		(ok gameId)
	)
)

;; stop function removes game from Games map data
(define-public (stop (gameId uint))
	(let (
		(game (unwrap! (map-get? Games gameId) ERR_GAME_NOT_FOUND)))
		(asserts! (is-eq tx-sender (get creator game)) ERR_FORBIDDEN)
		(asserts! (is-none (get offerId game)) ERR_FORBIDDEN)
		(try! (as-contract (stx-transfer? (get riskValue game) tx-sender (get creator game))))
		(map-delete Games gameId)

		(print {action: "stop", who: tx-sender, gameId: gameId, game: game})
		(ok gameId)
	)
)

;; challenge function creates new offer for a game
(define-public (challenge (gameId uint) (desc (string-utf8 2048)) (offer uint) (endingBlock uint))
	(let ((offerId (var-get offerNonce))
		(game (unwrap! (map-get? Games gameId) ERR_GAME_NOT_FOUND)))
		(asserts! (not (is-eq desc u"")) ERR_BAD_REQUEST)
		(asserts! (> endingBlock block-height) ERR_TIMEOUT_IN_PAST)
		(asserts! (<= endingBlock (get timeout game)) ERR_TIMEOUT_IN_PAST)
		(asserts! (> offer u0) ERR_ZERO_VALUE)
		(asserts! (not (is-eq tx-sender (get creator game))) ERR_FORBIDDEN)
		(asserts! (is-none (get offerId game)) ERR_FORBIDDEN)
		(try! (stx-transfer? offer tx-sender (as-contract tx-sender)))
		(map-set Offers offerId {gameId: gameId, challenger: tx-sender, offerDesc: desc, offerValue: offer, 
					timeout: endingBlock})
		(var-set offerNonce (+ offerId u1))

		(print {action: "challenge", who: tx-sender, offer: (get-offer offerId), game: (get-game gameId)})
		(ok offerId)
	)
)

;; withdraw function allows challenger to cancel & refund previous offers which are not yet accepted/locked
;; #[allow(unchecked_data)]
(define-public (withdraw (offerId uint))
	(let ((offer (unwrap! (map-get? Offers offerId) ERR_OFFER_NOT_FOUND))
			(gameId (get gameId offer))
			(game (unwrap! (map-get? Games gameId) ERR_GAME_NOT_FOUND))
			(lockedOffer (get offerId game))
			(offerValue (get offerValue offer))
			(challenger (get challenger offer))
		)
		(asserts! (not (and (not (is-none lockedOffer)) (is-eq offerId (default-to u0 (get offerId game))))) ERR_FORBIDDEN)
		(asserts! (is-eq tx-sender challenger) ERR_FORBIDDEN)
		(try! (as-contract (stx-transfer? offerValue tx-sender challenger)))
		(map-delete Offers offerId)

		(print {action: "withdraw", who: tx-sender, offer: offer, game: game})
		(ok true)
	)
)

;; accept function locks the game & offer together 
;; #[allow(unchecked_data)]
(define-public (accept (offerId uint))
	(let ((offer (unwrap! (map-get? Offers offerId) ERR_OFFER_NOT_FOUND))
		(gameId (get gameId offer))
		(game (unwrap! (map-get? Games gameId) ERR_GAME_NOT_FOUND))
		(creator (get creator game))
		(challenger (get challenger offer))
		(state (default-to DEFAULT_GAME_STATE (get state game)))
		(creatorVerity (unwrap! (contract-call? .verity-token get-balance creator) ERR_SHOULD_NEVER_HAPPEN))
		(challengerVerity (unwrap! (contract-call? .verity-token get-balance challenger) ERR_SHOULD_NEVER_HAPPEN))
		)
		(asserts! (is-none (get offerId game)) ERR_FORBIDDEN)
		(asserts! (is-eq tx-sender (get creator game)) ERR_FORBIDDEN)
		(map-set Games gameId (merge game {
			offerId: (some offerId), 
			state: (some (merge state {	
				creatorVerity: creatorVerity, 
				challengerVerity: challengerVerity
		}))}))

		(print {action: "accept", who: tx-sender, offer: offer, game: game})
		(ok true)
	)
)

;; declare function is used by players to self declare if they won (victory=true) or lost (victory=false)
;; #[allow(unchecked_data)]
(define-public (declare (gameId uint) (victory bool))
	(let (
		(game (unwrap! (get-game gameId) ERR_GAME_NOT_FOUND))
		(offerId (unwrap! (get offerId game) ERR_OFFER_FOR_GAME_NOT_FOUND))
		(offer (unwrap! (get-offer offerId) ERR_OFFER_NOT_FOUND))
		(timeout (get timeout game))
		(state (default-to DEFAULT_GAME_STATE (get state game)))
		(isCreator (is-creator gameId))
		(isChallenger (is-challenger offerId))
		(creatorClaim (get creatorClaim state))
		(challengerClaim (get challengerClaim state))
		(isNotDoubleClaim (or (and isCreator (is-none creatorClaim)) (and isChallenger (is-none challengerClaim))))
		(winner (get winner state))
	    )
		(asserts! (is-none winner) ERR_WINNER_ALREADY_CLAIMED)
		(asserts! (> block-height (get timeout game)) ERR_TIMEOUT_NOT_REACHED)
		(asserts! (<= block-height (+ timeout DEFAULT_CONSENSUS_PERIOD)) ERR_CONSENSUS_PERIOD_TIMEDOUT)
		(asserts! (or isCreator isChallenger) ERR_FORBIDDEN)
		(asserts! isNotDoubleClaim ERR_FORBIDDEN)
		(if isCreator
			(map-set Games gameId (merge game {state: (some (merge state {creatorClaim: (some victory)}))}))
			(map-set Games gameId (merge game {state: (some (merge state {challengerClaim: (some victory)}))}))
		)

		(print {action: "declare", who: tx-sender, victory: victory, game: game})
		(ok true)
	)
)

;; collect function starts judgment & award/refund process
;; #[allow(unchecked_data)]
(define-public (collect (gameId uint))
	(let (
		(game (unwrap! (get-game gameId) ERR_GAME_NOT_FOUND))
		(offerId (unwrap! (get offerId game) ERR_OFFER_FOR_GAME_NOT_FOUND))
		(offer (unwrap! (get-offer offerId) ERR_OFFER_NOT_FOUND))
		(timeout (get timeout game))
		(state (get state game))
		(riskValue (get riskValue game))
		(offerValue (get offerValue offer))
		(creator (get creator game))
		(challenger (get challenger offer))
		(isCreator (is-creator gameId))
		(isChallenger (is-challenger offerId))
	     )
		(asserts! (or isCreator isChallenger) ERR_FORBIDDEN)
		(asserts! (> block-height (+ timeout DEFAULT_CONSENSUS_PERIOD)) ERR_TIMEOUT_NOT_REACHED)
		(if (is-none state)
			(try! (refund isCreator creator challenger riskValue offerValue))
			(try! (judge gameId))
		)
		(try! (end gameId isCreator))

		(print {action: "collect", who: tx-sender, offer: offer, game: game})
		(ok state)
	)
)

;; judge function computes judgement from current state of game
;; #[allow(unchecked_data)]
(define-public (judge (gameId uint))
	(let (
		(game (unwrap! (get-game gameId) ERR_GAME_NOT_FOUND))
		(offerId (unwrap! (get offerId game) ERR_OFFER_FOR_GAME_NOT_FOUND))
		(offer (unwrap! (get-offer offerId) ERR_OFFER_NOT_FOUND))
		(riskValue (get riskValue game))
		(offerValue (get offerValue offer))
		(awardValue (+ riskValue offerValue))
		(creator (get creator game))
		(challenger (get challenger offer))
		(isCreator (is-creator gameId))
		(isChallenger (is-challenger offerId))
		(state (default-to DEFAULT_GAME_STATE (get state game)))
		(confirmedWinner (get winner state))
		(confirmedLooser (get looser state))
		(creatorVerity (get creatorVerity state))
		(challengerVerity (get challengerVerity state))
		(creatorClaim (default-to false (get creatorClaim state)))
		(challengerClaim (default-to false (get challengerClaim state)))
		(creatorCollected (get creatorCollected state))
		(challengerCollected (get challengerCollected state))
		(isConsensus (is-eq (and creatorClaim challengerClaim) false))
		(isConflict (is-eq (and creatorClaim challengerClaim) true))
		(isPoHConsensus (and isConflict (not (is-eq creatorVerity challengerVerity))))
		(isPoHConflict (and isConflict (is-eq creatorVerity challengerVerity) (> creatorVerity u2) (> challengerVerity u2)))
		(winner (if (and isConsensus creatorClaim) (some creator)
				 (if (and isConsensus challengerClaim) (some challenger)
				 (if (and isConflict creatorClaim (> creatorVerity challengerVerity)) (some creator)
				 (if (and isConflict challengerClaim (> challengerVerity creatorVerity)) (some challenger)
				 none)))))
		(looser (if (is-none winner) none (if (is-eq winner (some creator)) (some challenger) (some creator))))
	     )
		(asserts! (not (and isCreator creatorCollected)) ERR_FORBIDDEN)
		(asserts! (not (and isChallenger challengerCollected)) ERR_FORBIDDEN)
		(map-set Games gameId (merge game {state: (some (merge state {winner: winner, looser: looser}))}))
		(if isConsensus
			(try! (award (unwrap! winner ERR_SHOULD_NEVER_HAPPEN) (unwrap! looser ERR_SHOULD_NEVER_HAPPEN) riskValue offerValue))
		(if isPoHConsensus
			(if (is-eq tx-sender (unwrap! winner ERR_SHOULD_NEVER_HAPPEN))
				(begin
					(try! (as-contract (stx-transfer? awardValue tx-sender (unwrap! winner ERR_SHOULD_NEVER_HAPPEN))))
					(try! (penalty gameId))
				)
				(try! (penalty gameId))
			)
		(if isPoHConflict
			(begin
				(try! (refund isCreator creator challenger riskValue offerValue))
				(try! (penalty gameId))
			)
			(try! (refund isCreator creator challenger riskValue offerValue))
		)))

		(print {action: "judgement", game: (get-game gameId), isConflict: isConflict, isConsensus: isConsensus, isPoHConflict: isPoHConflict, isPoHConsensus: isPoHConsensus})
		(ok true)
	)
)

;; award function distributes STX to Winner & rewards newly minted $VERITY coins to winner & looser
(define-private (award (winner principal) (looser principal) (riskValue uint) (offerValue uint))
	(let (
		(rewardValue (if (is-eq tx-sender winner) offerValue riskValue))
		(awardValue (if (is-eq tx-sender winner) (+ riskValue offerValue) u0))
		(person (if (is-eq tx-sender winner) winner looser))
		)
		(if (is-eq tx-sender winner)
			(begin
				(try! (as-contract (stx-transfer? awardValue tx-sender person)))
				(try! (as-contract (contract-call? .verity-token mint rewardValue person)))
			)
			(try! (as-contract (contract-call? .verity-token mint rewardValue person)))
		)

		(print {action: "award"})
		(ok true)
	)
)

;; refund function returns STX collateral from contract to player
(define-private (refund (isCreator bool) (creator principal) (challenger principal) (riskValue uint) (offerValue uint))
	(begin
		(if isCreator
			(try! (as-contract (stx-transfer? riskValue tx-sender creator)))
			(try! (as-contract (stx-transfer? offerValue tx-sender challenger)))
		)

		(print {action: "refund"})
		(ok true)
	)
)

;; penalty function burns 50% of $VERITY coins of palyer
(define-private (penalty (gameId uint))
	(let (
		(game (unwrap! (get-game gameId) ERR_GAME_NOT_FOUND))
		(offerId (unwrap! (get offerId game) ERR_OFFER_FOR_GAME_NOT_FOUND))
		(offer (unwrap! (get-offer offerId) ERR_OFFER_NOT_FOUND))
		(creator (get creator game))
		(isCreator (is-creator gameId))
		(isChallenger (is-challenger offerId))
		(challenger (get challenger offer))
		(verityAmount (unwrap! (contract-call? .verity-token get-balance tx-sender) ERR_ZERO_VALUE))
	     )
		;; burn half of VERITY coins
		(if (and isCreator (> verityAmount u2))
			(try! (contract-call? .verity-token burn (/ verityAmount u2) creator))
		(if (and isChallenger (> verityAmount u2))
			(try! (contract-call? .verity-token burn (/ verityAmount u2) challenger))
			(try! (contract-call? .verity-token burn u0 challenger))
		))
		(print {action: "penalty"})
		(ok true)
	)
)

;; end function saves collected state for player to prevent double collection
(define-private (end (gameId uint) (isCreator bool))
	(let (
		(game (unwrap! (get-game gameId) ERR_GAME_NOT_FOUND))
		(state (default-to DEFAULT_GAME_STATE (get state game)))
	     )
		(if isCreator
			(map-set Games gameId (merge game {state: (some (merge state {creatorCollected: true}))}))
			(map-set Games gameId (merge game {state: (some (merge state {challengerCollected: true}))}))
		)
		(print {action: "end", game: (get-game gameId)})
		(ok true)
	)
)

