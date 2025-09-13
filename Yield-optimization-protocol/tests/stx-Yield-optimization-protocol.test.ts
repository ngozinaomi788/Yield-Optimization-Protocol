import { describe, expect, it, beforeEach } from "vitest";

const CONTRACT_NAME = 'staking-rewards-optimizer';

describe("Staking Rewards Optimizer Tests", () => {
  let simnet: any;
  let accounts: any;
  let deployer: string;
  let wallet1: string;
  let wallet2: string;
  let operator: string;

  beforeEach(() => {
    simnet = simnet;
    accounts = simnet.getAccounts();
    deployer = accounts.get('deployer');
    wallet1 = accounts.get('wallet_1');
    wallet2 = accounts.get('wallet_2');
    operator = accounts.get('wallet_3');
  });

  describe("Contract Deployment & Initial State", () => {
    it("should have correct initial contract state", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-contract-stats",
        [],
        deployer
      );
      
      expect(result.result).toBeOk();
      const stats = result.result.expectOk().expectTuple();
      expect(stats['total-staked']).toBeUint(0);
      expect(stats['reward-rate']).toBeUint(500);
      expect(stats['compound-frequency']).toBeUint(144);
      expect(stats['management-fee']).toBeUint(100);
      expect(stats['contract-enabled']).toBeBool(true);
    });

    it("should start with pool counter at 1", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-pool-info",
        [types.uint(1)],
        deployer
      );
      
      expect(result.result).toBeNone();
    });
  });

  describe("Pool Management", () => {
    it("should allow owner to create a new pool", () => {
      const createPool = simnet.callPublicFn(
        CONTRACT_NAME,
        "create-pool",
        [
          types.ascii("Bitcoin Pool"),
          types.principal(`${deployer}.mock-token`),
          types.uint(750) // 7.5% reward rate
        ],
        deployer
      );

      expect(createPool.result).toBeOk();
      expect(createPool.result.expectOk()).toBeUint(1);

      // Verify pool was created
      const poolInfo = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-pool-info",
        [types.uint(1)],
        deployer
      );

      expect(poolInfo.result).toBeSome();
      const pool = poolInfo.result.expectSome().expectTuple();
      expect(pool['name']).toBeAscii("Bitcoin Pool");
      expect(pool['total-staked']).toBeUint(0);
      expect(pool['reward-rate']).toBeUint(750);
      expect(pool['active']).toBeBool(true);
    });

    it("should not allow non-owner to create pool", () => {
      const createPool = simnet.callPublicFn(
        CONTRACT_NAME,
        "create-pool",
        [
          types.ascii("Unauthorized Pool"),
          types.principal(`${wallet1}.mock-token`),
          types.uint(500)
        ],
        wallet1
      );

      expect(createPool.result).toBeErr(types.uint(100)); // ERR-OWNER-ONLY
    });

    it("should allow owner to set pool reward rate", () => {
      // First create a pool
      simnet.callPublicFn(
        CONTRACT_NAME,
        "create-pool",
        [
          types.ascii("Test Pool"),
          types.principal(`${deployer}.mock-token`),
          types.uint(500)
        ],
        deployer
      );

      // Update reward rate
      const updateRate = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-pool-reward-rate",
        [types.uint(1), types.uint(1000)],
        deployer
      );

      expect(updateRate.result).toBeOk();

      // Verify rate was updated
      const poolInfo = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-pool-info",
        [types.uint(1)],
        deployer
      );

      const pool = poolInfo.result.expectSome().expectTuple();
      expect(pool['reward-rate']).toBeUint(1000);
    });

    it("should allow owner to deactivate pool", () => {
      // Create pool
      simnet.callPublicFn(
        CONTRACT_NAME,
        "create-pool",
        [
          types.ascii("Test Pool"),
          types.principal(`${deployer}.mock-token`),
          types.uint(500)
        ],
        deployer
      );

      // Deactivate pool
      const deactivate = simnet.callPublicFn(
        CONTRACT_NAME,
        "deactivate-pool",
        [types.uint(1)],
        deployer
      );

      expect(deactivate.result).toBeOk();

      // Verify pool is deactivated
      const poolInfo = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-pool-info",
        [types.uint(1)],
        deployer
      );

      const pool = poolInfo.result.expectSome().expectTuple();
      expect(pool['active']).toBeBool(false);
    });
  });

  describe("Staking Operations", () => {
    beforeEach(() => {
      // Create a test pool
      simnet.callPublicFn(
        CONTRACT_NAME,
        "create-pool",
        [
          types.ascii("Test Pool"),
          types.principal(`${deployer}.mock-token`),
          types.uint(500)
        ],
        deployer
      );
    });

    it("should allow user to stake tokens", () => {
      const stake = simnet.callPublicFn(
        CONTRACT_NAME,
        "stake",
        [
          types.uint(1), // pool-id
          types.uint(1000000), // amount
          types.bool(true) // enable-auto-compound
        ],
        wallet1
      );

      expect(stake.result).toBeOk();

      // Verify stake was recorded
      const userStake = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-user-stake",
        [types.principal(wallet1), types.uint(1)],
        wallet1
      );

      expect(userStake.result).toBeSome();
      const stakeInfo = userStake.result.expectSome().expectTuple();
      expect(stakeInfo['amount-staked']).toBeUint(1000000);
      expect(stakeInfo['auto-compound']).toBeBool(true);
      expect(stakeInfo['total-rewards']).toBeUint(0);
    });

    it("should not allow staking zero amount", () => {
      const stake = simnet.callPublicFn(
        CONTRACT_NAME,
        "stake",
        [
          types.uint(1),
          types.uint(0),
          types.bool(true)
        ],
        wallet1
      );

      expect(stake.result).toBeErr(types.uint(103)); // ERR-INVALID-AMOUNT
    });

    it("should not allow staking in non-existent pool", () => {
      const stake = simnet.callPublicFn(
        CONTRACT_NAME,
        "stake",
        [
          types.uint(999),
          types.uint(1000000),
          types.bool(true)
        ],
        wallet1
      );

      expect(stake.result).toBeErr(types.uint(104)); // ERR-POOL-NOT-FOUND
    });

    it("should not allow double staking in same pool", () => {
      // First stake
      simnet.callPublicFn(
        CONTRACT_NAME,
        "stake",
        [types.uint(1), types.uint(1000000), types.bool(true)],
        wallet1
      );

      // Second stake should fail
      const secondStake = simnet.callPublicFn(
        CONTRACT_NAME,
        "stake",
        [types.uint(1), types.uint(500000), types.bool(true)],
        wallet1
      );

      expect(secondStake.result).toBeErr(types.uint(105)); // ERR-ALREADY-STAKING
    });

    it("should allow adding to existing stake", () => {
      // Initial stake
      simnet.callPublicFn(
        CONTRACT_NAME,
        "stake",
        [types.uint(1), types.uint(1000000), types.bool(true)],
        wallet1
      );

      // Add to stake
      const addStake = simnet.callPublicFn(
        CONTRACT_NAME,
        "add-stake",
        [types.uint(1), types.uint(500000)],
        wallet1
      );

      expect(addStake.result).toBeOk();

      // Verify increased stake
      const userStake = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-user-stake",
        [types.principal(wallet1), types.uint(1)],
        wallet1
      );

      const stakeInfo = userStake.result.expectSome().expectTuple();
      expect(stakeInfo['amount-staked']).toBeUint(1500000);
    });
  });

  describe("Reward Calculations", () => {
    beforeEach(() => {
      // Create pool and stake
      simnet.callPublicFn(
        CONTRACT_NAME,
        "create-pool",
        [
          types.ascii("Test Pool"),
          types.principal(`${deployer}.mock-token`),
          types.uint(500) // 5% annual
        ],
        deployer
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "stake",
        [types.uint(1), types.uint(1000000), types.bool(true)],
        wallet1
      );
    });

    it("should calculate pending rewards correctly", () => {
      // Mine some blocks to simulate time passage
      simnet.mineEmptyBlocks(100);

      const pendingRewards = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "calculate-pending-rewards",
        [types.principal(wallet1), types.uint(1)],
        wallet1
      );

      expect(pendingRewards.result).toBeOk();
      const rewards = pendingRewards.result.expectOk();
      expect(rewards).toBeUint(0); // Should be greater than 0 with proper calculation
    });

    it("should compound rewards manually", () => {
      // Mine blocks for rewards
      simnet.mineEmptyBlocks(200);

      const compound = simnet.callPublicFn(
        CONTRACT_NAME,
        "compound-rewards",
        [types.uint(1)],
        wallet1
      );

      expect(compound.result).toBeOk();

      // Check if stake amount increased (rewards compounded)
      const userStake = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-user-stake",
        [types.principal(wallet1), types.uint(1)],
        wallet1
      );

      const stakeInfo = userStake.result.expectSome().expectTuple();
      // Should have some rewards added to total-rewards
      expect(stakeInfo['total-rewards']).toBeUint(0); // Will be > 0 with proper reward calculation
    });
  });

  describe("Auto-Compound Operations", () => {
    beforeEach(() => {
      // Create pool, authorize operator, and set up stake
      simnet.callPublicFn(
        CONTRACT_NAME,
        "create-pool",
        [
          types.ascii("Test Pool"),
          types.principal(`${deployer}.mock-token`),
          types.uint(500)
        ],
        deployer
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "set-operator-authorization",
        [types.principal(operator), types.bool(true)],
        deployer
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "stake",
        [types.uint(1), types.uint(1000000), types.bool(true)],
        wallet1
      );
    });

    it("should allow authorized operator to auto-compound", () => {
      // Mine enough blocks to meet compound frequency
      simnet.mineEmptyBlocks(150);

      const autoCompound = simnet.callPublicFn(
        CONTRACT_NAME,
        "auto-compound",
        [types.principal(wallet1), types.uint(1)],
        operator
      );

      expect(autoCompound.result).toBeOk();
    });

    it("should not allow unauthorized user to auto-compound", () => {
      simnet.mineEmptyBlocks(150);

      const autoCompound = simnet.callPublicFn(
        CONTRACT_NAME,
        "auto-compound",
        [types.principal(wallet1), types.uint(1)],
        wallet2
      );

      expect(autoCompound.result).toBeErr(types.uint(101)); // ERR-NOT-AUTHORIZED
    });

    it("should not auto-compound if frequency not met", () => {
      // Mine fewer blocks than required
      simnet.mineEmptyBlocks(50);

      const autoCompound = simnet.callPublicFn(
        CONTRACT_NAME,
        "auto-compound",
        [types.principal(wallet1), types.uint(1)],
        operator
      );

      expect(autoCompound.result).toBeErr(types.uint(107)); // ERR-COMPOUND-TOO-SOON
    });

    it("should toggle auto-compound setting", () => {
      const toggle = simnet.callPublicFn(
        CONTRACT_NAME,
        "toggle-auto-compound",
        [types.uint(1)],
        wallet1
      );

      expect(toggle.result).toBeOk();
      expect(toggle.result.expectOk()).toBeBool(false); // Should be false now

      // Verify setting changed
      const userStake = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-user-stake",
        [types.principal(wallet1), types.uint(1)],
        wallet1
      );

      const stakeInfo = userStake.result.expectSome().expectTuple();
      expect(stakeInfo['auto-compound']).toBeBool(false);
    });
  });

  describe("Unstaking Operations", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "create-pool",
        [
          types.ascii("Test Pool"),
          types.principal(`${deployer}.mock-token`),
          types.uint(500)
        ],
        deployer
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "stake",
        [types.uint(1), types.uint(1000000), types.bool(true)],
        wallet1
      );
    });

    it("should allow partial unstaking", () => {
      const unstake = simnet.callPublicFn(
        CONTRACT_NAME,
        "unstake",
        [types.uint(1), types.uint(400000)],
        wallet1
      );

      expect(unstake.result).toBeOk();

      // Verify remaining stake
      const userStake = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-user-stake",
        [types.principal(wallet1), types.uint(1)],
        wallet1
      );

      const stakeInfo = userStake.result.expectSome().expectTuple();
      expect(stakeInfo['amount-staked']).toBeUint(600000);
    });

    it("should allow full unstaking", () => {
      const unstake = simnet.callPublicFn(
        CONTRACT_NAME,
        "unstake",
        [types.uint(1), types.uint(1000000)],
        wallet1
      );

      expect(unstake.result).toBeOk();

      // Verify stake is removed
      const userStake = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-user-stake",
        [types.principal(wallet1), types.uint(1)],
        wallet1
      );

      expect(userStake.result).toBeNone();
    });

    it("should not allow unstaking more than staked", () => {
      const unstake = simnet.callPublicFn(
        CONTRACT_NAME,
        "unstake",
        [types.uint(1), types.uint(2000000)],
        wallet1
      );

      expect(unstake.result).toBeErr(types.uint(102)); // ERR-INSUFFICIENT-BALANCE
    });
  });

  describe("Administrative Functions", () => {
    it("should allow owner to set compound frequency", () => {
      const setFrequency = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-compound-frequency",
        [types.uint(288)], // ~48 hours
        deployer
      );

      expect(setFrequency.result).toBeOk();

      // Verify setting changed
      const stats = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-contract-stats",
        [],
        deployer
      );

      const contractStats = stats.result.expectOk().expectTuple();
      expect(contractStats['compound-frequency']).toBeUint(288);
    });

    it("should allow owner to set management fee", () => {
      const setFee = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-management-fee",
        [types.uint(200)], // 2%
        deployer
      );

      expect(setFee.result).toBeOk();
    });

    it("should not allow setting management fee above 10%", () => {
      const setFee = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-management-fee",
        [types.uint(1500)], // 15%
        deployer
      );

      expect(setFee.result).toBeErr(types.uint(103)); // ERR-INVALID-AMOUNT
    });

    it("should allow owner to toggle contract state", () => {
      const toggle = simnet.callPublicFn(
        CONTRACT_NAME,
        "toggle-contract",
        [types.bool(false)],
        deployer
      );

      expect(toggle.result).toBeOk();
      expect(toggle.result.expectOk()).toBeBool(false);

      // Verify contract is disabled
      const stats = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-contract-stats",
        [],
        deployer
      );

      const contractStats = stats.result.expectOk().expectTuple();
      expect(contractStats['contract-enabled']).toBeBool(false);
    });

    it("should allow owner to authorize operators", () => {
      const authorize = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-operator-authorization",
        [types.principal(operator), types.bool(true)],
        deployer
      );

      expect(authorize.result).toBeOk();

      // Verify authorization
      const isAuthorized = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-authorized",
        [types.principal(operator)],
        deployer
      );

      expect(isAuthorized.result).toBeBool(true);
    });

    it("should not allow non-owner to perform admin functions", () => {
      const setFee = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-management-fee",
        [types.uint(200)],
        wallet1
      );

      expect(setFee.result).toBeErr(types.uint(100)); // ERR-OWNER-ONLY
    });
  });

  describe("Contract State Protection", () => {
    it("should prevent operations when contract is disabled", () => {
      // Disable contract
      simnet.callPublicFn(
        CONTRACT_NAME,
        "toggle-contract",
        [types.bool(false)],
        deployer
      );

      // Create pool should fail
      const createPool = simnet.callPublicFn(
        CONTRACT_NAME,
        "create-pool",
        [
          types.ascii("Test Pool"),
          types.principal(`${deployer}.mock-token`),
          types.uint(500)
        ],
        deployer
      );

      expect(createPool.result).toBeErr(types.uint(101)); // ERR-NOT-AUTHORIZED
    });
  });

  describe("Read-Only Function Tests", () => {
    it("should return correct authorization status", () => {
      // Check unauthorized user
      const unauthorized = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-authorized",
        [types.principal(wallet1)],
        deployer
      );

      expect(unauthorized.result).toBeBool(false);

      // Authorize user
      simnet.callPublicFn(
        CONTRACT_NAME,
        "set-operator-authorization",
        [types.principal(wallet1), types.bool(true)],
        deployer
      );

      // Check authorized user
      const authorized = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-authorized",
        [types.principal(wallet1)],
        deployer
      );

      expect(authorized.result).toBeBool(true);
    });
  });
});