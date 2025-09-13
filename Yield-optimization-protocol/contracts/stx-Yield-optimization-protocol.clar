;; Staking Rewards Optimizer Contract
;; Auto-compound staking returns for maximum yield

;; Contract Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant ERR-OWNER-ONLY (err u100))
(define-constant ERR-NOT-AUTHORIZED (err u101))
(define-constant ERR-INSUFFICIENT-BALANCE (err u102))
(define-constant ERR-INVALID-AMOUNT (err u103))
(define-constant ERR-POOL-NOT-FOUND (err u104))
(define-constant ERR-ALREADY-STAKING (err u105))
(define-constant ERR-NOT-STAKING (err u106))
(define-constant ERR-COMPOUND-TOO-SOON (err u107))

;; Data Variables
(define-data-var contract-enabled bool true)
(define-data-var total-staked uint u0)
(define-data-var reward-rate uint u500) ;; 5% annual rate (500 basis points)
(define-data-var compound-frequency uint u144) ;; Auto-compound every ~24 hours (144 blocks)
(define-data-var management-fee uint u100) ;; 1% management fee (100 basis points)

;; Data Maps
(define-map staking-pools 
    { pool-id: uint }
    {
        name: (string-ascii 64),
        token-contract: principal,
        total-staked: uint,
        reward-rate: uint,
        last-compound: uint,
        active: bool
    }
)

(define-map user-stakes
    { user: principal, pool-id: uint }
    {
        amount-staked: uint,
        last-compound: uint,
        total-rewards: uint,
        auto-compound: bool
    }
)

(define-map authorized-operators
    { operator: principal }
    { authorized: bool }
)

;; Pool counter
(define-data-var next-pool-id uint u1)

;; Read-only functions
(define-read-only (get-pool-info (pool-id uint))
    (map-get? staking-pools { pool-id: pool-id })
)

(define-read-only (get-user-stake (user principal) (pool-id uint))
    (map-get? user-stakes { user: user, pool-id: pool-id })
)

(define-read-only (calculate-pending-rewards (user principal) (pool-id uint))
    (let (
        (stake-info (unwrap! (get-user-stake user pool-id) (err u0)))
        (pool-info (unwrap! (get-pool-info pool-id) (err u0)))
        (blocks-passed (- stacks-block-height (get last-compound stake-info)))
        (reward-per-block (/ (get reward-rate pool-info) u52560)) ;; Approx blocks per year
        (pending-rewards (/ (* (get amount-staked stake-info) reward-per-block blocks-passed) u10000))
    )
    (ok pending-rewards))
)

(define-read-only (get-contract-stats)
    {
        total-staked: (var-get total-staked),
        reward-rate: (var-get reward-rate),
        compound-frequency: (var-get compound-frequency),
        management-fee: (var-get management-fee),
        contract-enabled: (var-get contract-enabled)
    }
)

(define-read-only (is-authorized (operator principal))
    (default-to false (get authorized (map-get? authorized-operators { operator: operator })))
)

;; Private functions
(define-private (is-owner)
    (is-eq tx-sender CONTRACT-OWNER)
)

(define-private (compound-user-rewards (user principal) (pool-id uint))
    (let (
        (stake-info (unwrap! (get-user-stake user pool-id) ERR-NOT-STAKING))
        (pool-info (unwrap! (get-pool-info pool-id) ERR-POOL-NOT-FOUND))
        (pending-rewards (unwrap! (calculate-pending-rewards user pool-id) ERR-INVALID-AMOUNT))
        (management-fee-amount (/ (* pending-rewards (var-get management-fee)) u10000))
        (net-rewards (- pending-rewards management-fee-amount))
        (new-stake-amount (+ (get amount-staked stake-info) net-rewards))
    )
    ;; Update user stake with compounded rewards
    (map-set user-stakes
        { user: user, pool-id: pool-id }
        {
            amount-staked: new-stake-amount,
            last-compound: stacks-block-height,
            total-rewards: (+ (get total-rewards stake-info) net-rewards),
            auto-compound: (get auto-compound stake-info)
        }
    )
    ;; Update pool total
    (map-set staking-pools
        { pool-id: pool-id }
        (merge pool-info { 
            total-staked: (+ (get total-staked pool-info) net-rewards),
            last-compound: stacks-block-height 
        })
    )
    (ok net-rewards))
)

;; Public functions

;; Create a new staking pool (owner only)
(define-public (create-pool (name (string-ascii 64)) (token-contract principal) (pool-reward-rate uint))
    (let (
        (pool-id (var-get next-pool-id))
    )
    (asserts! (is-owner) ERR-OWNER-ONLY)
    (asserts! (var-get contract-enabled) ERR-NOT-AUTHORIZED)
    
    (map-set staking-pools
        { pool-id: pool-id }
        {
            name: name,
            token-contract: token-contract,
            total-staked: u0,
            reward-rate: pool-reward-rate,
            last-compound: stacks-block-height,
            active: true
        }
    )
    (var-set next-pool-id (+ pool-id u1))
    (ok pool-id))
)

;; Stake tokens in a pool
(define-public (stake (pool-id uint) (amount uint) (enable-auto-compound bool))
    (let (
        (pool-info (unwrap! (get-pool-info pool-id) ERR-POOL-NOT-FOUND))
        (existing-stake (map-get? user-stakes { user: tx-sender, pool-id: pool-id }))
    )
    (asserts! (var-get contract-enabled) ERR-NOT-AUTHORIZED)
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (asserts! (get active pool-info) ERR-POOL-NOT-FOUND)
    (asserts! (is-none existing-stake) ERR-ALREADY-STAKING)
    
    ;; Create user stake record
    (map-set user-stakes
        { user: tx-sender, pool-id: pool-id }
        {
            amount-staked: amount,
            last-compound: stacks-block-height,
            total-rewards: u0,
            auto-compound: enable-auto-compound
        }
    )
    
    ;; Update pool total
    (map-set staking-pools
        { pool-id: pool-id }
        (merge pool-info { total-staked: (+ (get total-staked pool-info) amount) })
    )
    
    ;; Update global total
    (var-set total-staked (+ (var-get total-staked) amount))
    
    (ok true))
)

;; Add more tokens to existing stake
(define-public (add-stake (pool-id uint) (amount uint))
    (let (
        (stake-info (unwrap! (get-user-stake tx-sender pool-id) ERR-NOT-STAKING))
        (pool-info (unwrap! (get-pool-info pool-id) ERR-POOL-NOT-FOUND))
        (new-amount (+ (get amount-staked stake-info) amount))
    )
    (asserts! (var-get contract-enabled) ERR-NOT-AUTHORIZED)
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (asserts! (get active pool-info) ERR-POOL-NOT-FOUND)
    
    ;; Update user stake
    (map-set user-stakes
        { user: tx-sender, pool-id: pool-id }
        (merge stake-info { amount-staked: new-amount })
    )
    
    ;; Update pool and global totals
    (map-set staking-pools
        { pool-id: pool-id }
        (merge pool-info { total-staked: (+ (get total-staked pool-info) amount) })
    )
    
    (var-set total-staked (+ (var-get total-staked) amount))
    (ok true))
)

;; Manually compound rewards
(define-public (compound-rewards (pool-id uint))
    (let (
        (stake-info (unwrap! (get-user-stake tx-sender pool-id) ERR-NOT-STAKING))
        (blocks-since-compound (- stacks-block-height (get last-compound stake-info)))
    )
    (asserts! (var-get contract-enabled) ERR-NOT-AUTHORIZED)
    (asserts! (>= blocks-since-compound u1) ERR-COMPOUND-TOO-SOON)
    
    (compound-user-rewards tx-sender pool-id))
)

;; Auto-compound for users (callable by authorized operators)
(define-public (auto-compound (user principal) (pool-id uint))
    (let (
        (stake-info (unwrap! (get-user-stake user pool-id) ERR-NOT-STAKING))
        (blocks-since-compound (- stacks-block-height (get last-compound stake-info)))
    )
    (asserts! (or (is-authorized tx-sender) (is-owner)) ERR-NOT-AUTHORIZED)
    (asserts! (var-get contract-enabled) ERR-NOT-AUTHORIZED)
    (asserts! (get auto-compound stake-info) ERR-NOT-AUTHORIZED)
    (asserts! (>= blocks-since-compound (var-get compound-frequency)) ERR-COMPOUND-TOO-SOON)
    
    (compound-user-rewards user pool-id))
)

;; Unstake tokens
(define-public (unstake (pool-id uint) (amount uint))
    (let (
        (stake-info (unwrap! (get-user-stake tx-sender pool-id) ERR-NOT-STAKING))
        (pool-info (unwrap! (get-pool-info pool-id) ERR-POOL-NOT-FOUND))
        (current-stake (get amount-staked stake-info))
    )
    (asserts! (var-get contract-enabled) ERR-NOT-AUTHORIZED)
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (asserts! (>= current-stake amount) ERR-INSUFFICIENT-BALANCE)
    
    ;; Compound any pending rewards first
    (try! (compound-user-rewards tx-sender pool-id))
    
    ;; Update user stake
    (if (is-eq current-stake amount)
        ;; Remove stake completely
        (map-delete user-stakes { user: tx-sender, pool-id: pool-id })
        ;; Reduce stake amount
        (map-set user-stakes
            { user: tx-sender, pool-id: pool-id }
            (merge stake-info { amount-staked: (- current-stake amount) })
        )
    )
    
    ;; Update pool and global totals
    (map-set staking-pools
        { pool-id: pool-id }
        (merge pool-info { total-staked: (- (get total-staked pool-info) amount) })
    )
    
    (var-set total-staked (- (var-get total-staked) amount))
    (ok true))
)

;; Toggle auto-compound setting
(define-public (toggle-auto-compound (pool-id uint))
    (let (
        (stake-info (unwrap! (get-user-stake tx-sender pool-id) ERR-NOT-STAKING))
    )
    (map-set user-stakes
        { user: tx-sender, pool-id: pool-id }
        (merge stake-info { auto-compound: (not (get auto-compound stake-info)) })
    )
    (ok (not (get auto-compound stake-info))))
)

;; Admin functions

;; Set reward rate for a pool (owner only)
(define-public (set-pool-reward-rate (pool-id uint) (new-rate uint))
    (let (
        (pool-info (unwrap! (get-pool-info pool-id) ERR-POOL-NOT-FOUND))
    )
    (asserts! (is-owner) ERR-OWNER-ONLY)
    
    (map-set staking-pools
        { pool-id: pool-id }
        (merge pool-info { reward-rate: new-rate })
    )
    (ok true))
)

;; Set global compound frequency (owner only)
(define-public (set-compound-frequency (new-frequency uint))
    (begin
        (asserts! (is-owner) ERR-OWNER-ONLY)
        (var-set compound-frequency new-frequency)
        (ok true))
)

;; Set management fee (owner only)
(define-public (set-management-fee (new-fee uint))
    (begin
        (asserts! (is-owner) ERR-OWNER-ONLY)
        (asserts! (<= new-fee u1000) ERR-INVALID-AMOUNT) ;; Max 10%
        (var-set management-fee new-fee)
        (ok true))
)

;; Toggle contract enabled state (owner only)
(define-public (toggle-contract (enabled bool))
    (begin
        (asserts! (is-owner) ERR-OWNER-ONLY)
        (var-set contract-enabled enabled)
        (ok enabled))
)

;; Authorize/deauthorize operators (owner only)
(define-public (set-operator-authorization (operator principal) (authorized bool))
    (begin
        (asserts! (is-owner) ERR-OWNER-ONLY)
        (map-set authorized-operators
            { operator: operator }
            { authorized: authorized }
        )
        (ok true))
)

;; Deactivate pool (owner only)
(define-public (deactivate-pool (pool-id uint))
    (let (
        (pool-info (unwrap! (get-pool-info pool-id) ERR-POOL-NOT-FOUND))
    )
    (asserts! (is-owner) ERR-OWNER-ONLY)
    
    (map-set staking-pools
        { pool-id: pool-id }
        (merge pool-info { active: false })
    )
    (ok true))
)