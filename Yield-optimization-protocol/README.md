# Staking Rewards Optimizer

A smart contract built on the Stacks blockchain using Clarity that automatically compounds staking rewards for maximum yield optimization.

## Overview

The Staking Rewards Optimizer enables users to stake tokens in multiple pools and automatically compound their rewards over time. The contract maximizes returns through frequent compounding while maintaining security and flexibility for users.

## Features

### 🚀 Core Functionality
- **Multi-Pool Staking**: Support for multiple staking pools with different tokens and reward rates
- **Auto-Compounding**: Automatic reinvestment of rewards based on configurable frequency
- **Manual Compounding**: Users can compound rewards manually at any time
- **Flexible Staking**: Add to existing stakes or unstake partial amounts
- **Real-time Rewards**: Calculate pending rewards in real-time

### 🔒 Security & Access Control
- **Owner Controls**: Administrative functions restricted to contract owner
- **Authorized Operators**: Designated operators can execute auto-compounding
- **Emergency Controls**: Contract can be disabled if needed
- **Input Validation**: Comprehensive checks for all operations

### ⚙️ Customizable Parameters
- **Reward Rates**: Configurable per pool (default 5% annual)
- **Compound Frequency**: Adjustable auto-compound timing (default ~24 hours)
- **Management Fees**: Configurable fee structure (default 1%)
- **Pool Management**: Create, configure, and deactivate pools

## Contract Architecture

### Data Structures

#### Staking Pools
```clarity
{
    name: (string-ascii 64),
    token-contract: principal,
    total-staked: uint,
    reward-rate: uint,
    last-compound: uint,
    active: bool
}
```

#### User Stakes
```clarity
{
    amount-staked: uint,
    last-compound: uint,
    total-rewards: uint,
    auto-compound: bool
}
```

### Key Constants
- `ERR-OWNER-ONLY (u100)`: Only contract owner can perform this action
- `ERR-NOT-AUTHORIZED (u101)`: Caller not authorized
- `ERR-INSUFFICIENT-BALANCE (u102)`: Not enough tokens to unstake
- `ERR-INVALID-AMOUNT (u103)`: Invalid amount specified
- `ERR-POOL-NOT-FOUND (u104)`: Pool doesn't exist
- `ERR-ALREADY-STAKING (u105)`: User already has stake in pool
- `ERR-NOT-STAKING (u106)`: User has no stake in pool
- `ERR-COMPOUND-TOO-SOON (u107)`: Not enough time passed for compounding

## Usage Guide

### For Users

#### 1. Stake Tokens
```clarity
(contract-call? .staking-rewards-optimizer stake u1 u1000000 true)
```
- `pool-id`: Pool to stake in (u1)
- `amount`: Amount to stake (u1000000)
- `enable-auto-compound`: Enable auto-compounding (true)

#### 2. Add to Existing Stake
```clarity
(contract-call? .staking-rewards-optimizer add-stake u1 u500000)
```

#### 3. Compound Rewards Manually
```clarity
(contract-call? .staking-rewards-optimizer compound-rewards u1)
```

#### 4. Toggle Auto-Compound
```clarity
(contract-call? .staking-rewards-optimizer toggle-auto-compound u1)
```

#### 5. Unstake Tokens
```clarity
(contract-call? .staking-rewards-optimizer unstake u1 u500000)
```

#### 6. Check Stake Information
```clarity
(contract-call? .staking-rewards-optimizer get-user-stake 'SP1234... u1)
```

#### 7. Calculate Pending Rewards
```clarity
(contract-call? .staking-rewards-optimizer calculate-pending-rewards 'SP1234... u1)
```

### For Pool Operators

#### Auto-Compound User Rewards
```clarity
(contract-call? .staking-rewards-optimizer auto-compound 'SP1234... u1)
```

### For Contract Owner

#### 1. Create New Pool
```clarity
(contract-call? .staking-rewards-optimizer create-pool "Bitcoin Pool" 'SP1234...token-contract u500)
```

#### 2. Set Pool Reward Rate
```clarity
(contract-call? .staking-rewards-optimizer set-pool-reward-rate u1 u750)
```

#### 3. Authorize Operators
```clarity
(contract-call? .staking-rewards-optimizer set-operator-authorization 'SP1234...operator true)
```

#### 4. Set Global Parameters
```clarity
(contract-call? .staking-rewards-optimizer set-compound-frequency u288)
(contract-call? .staking-rewards-optimizer set-management-fee u150)
```

## Deployment Instructions

### Prerequisites
- Clarinet CLI installed
- Stacks wallet with STX for deployment
- Basic understanding of Clarity smart contracts

### Steps

1. **Clone and Setup**
```bash
git clone <repository-url>
cd staking-rewards-optimizer
clarinet check
```

2. **Test Locally**
```bash
clarinet test
```

3. **Deploy to Testnet**
```bash
clarinet deploy --testnet
```

4. **Deploy to Mainnet**
```bash
clarinet deploy --mainnet
```

## Configuration

### Default Parameters
- **Reward Rate**: 5% annual (500 basis points)
- **Compound Frequency**: 144 blocks (~24 hours)
- **Management Fee**: 1% (100 basis points)
- **Contract Enabled**: true

### Customization
All parameters can be adjusted by the contract owner after deployment using the administrative functions.

## Economic Model

### Reward Calculation
Rewards are calculated based on:
- Amount staked
- Time staked (in blocks)
- Pool reward rate
- Compound frequency

### Fee Structure
- **Management Fee**: Percentage of rewards (configurable, max 10%)
- **No Staking Fees**: Free to stake and unstake
- **Gas Costs**: Standard Stacks transaction fees apply

### Compound Interest Formula
```
New Stake = Original Stake + (Rewards - Management Fees)
```

## Security Considerations

### Access Controls
- **Owner Functions**: Pool creation, rate setting, operator management
- **Operator Functions**: Auto-compounding execution only
- **User Functions**: Staking, unstaking, manual compounding

### Safety Measures
- Input validation on all amounts
- Overflow protection in calculations
- Emergency contract disable functionality
- No external token transfers (assumes tokens are held separately)

### Audit Recommendations
- Test all edge cases with extreme values
- Verify reward calculations with different time periods
- Test access control mechanisms
- Validate pool state transitions

## Error Handling

The contract includes comprehensive error handling:

- **u100**: Owner-only function called by non-owner
- **u101**: Unauthorized operation
- **u102**: Insufficient balance for operation
- **u103**: Invalid amount (zero or negative)
- **u104**: Pool not found or inactive
- **u105**: User already staking in pool
- **u106**: User not staking in pool
- **u107**: Compound operation called too frequently

## Testing

### Unit Tests
Run the included test suite:
```bash
clarinet test
```

### Integration Testing
Test with multiple users and pools:
```bash
clarinet console
```

### Performance Testing
Monitor gas costs and optimize for efficiency.

## Monitoring & Analytics

### Key Metrics to Track
- Total Value Locked (TVL)
- Average reward rates
- Compound frequency effectiveness
- User adoption rates
- Pool performance

### Read-Only Functions for Analytics
- `get-contract-stats`: Overall contract metrics
- `get-pool-info`: Individual pool performance
- `calculate-pending-rewards`: Real-time reward calculations

## Roadmap

### Phase 1 (Current)
- ✅ Basic staking and auto-compounding
- ✅ Multi-pool support
- ✅ Administrative controls

### Phase 2 (Planned)
- 🔄 Integration with DeFi protocols
- 🔄 Advanced reward distribution mechanisms
- 🔄 Governance token implementation

### Phase 3 (Future)
- 📋 Cross-chain compatibility
- 📋 Yield farming strategies
- 📋 Insurance mechanisms

## Contributing

### Development Setup
1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Submit pull request

### Code Standards
- Follow Clarity best practices
- Include comprehensive tests
- Document all functions
- Maintain security standards

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

### Documentation
- [Clarity Language Reference](https://docs.stacks.co/clarity)
- [Stacks Blockchain Docs](https://docs.stacks.co)

### Community
- Discord: [Stacks Community](https://discord.gg/stacks)
- Forum: [Stacks Forum](https://forum.stacks.org)

### Issues & Bugs
Please report issues on the GitHub repository with:
- Clear description
- Steps to reproduce
- Expected vs actual behavior
- Environment details

---

**⚠️ Disclaimer**: This smart contract handles financial assets. Always audit code thoroughly and test extensively before deploying to mainnet. Use at your own risk.