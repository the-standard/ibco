# Stage 2 APIs

The bonding event is the second stage in the IBCO process and takes place after the user has obtained sEUROs through the bonding curve in Stage 1.

### Operator Stage 2 Public APIs

These are the functions exposed to the user in the Operator Stage 2 contract. This contract can be used to create a bond of sEURO and another token, in order to receive TST once the bond matures.

**showRates()**

*Description*: gets available bond options

*Output*: list of available bond options, as a yield rate and duration (in weeks)

**newBond(address _user, uint256 _amountSeuro, uint256 _rate)**

*Description*: creates a new bond for the duration that is applicable to the given rate. Transfers given sEURO amount, and an amount of the other bonding token (the amount is dictated by the requirements of the Uniswap liquidity pool at that time)

*Input*: address of user creating bond; amount of sEURO to bond; chosen bond rate

**refreshBond(address _user)**

*Description*: refreshes status of bond

*Input*: address of user creating bond

### Bonding Event Public APIs

These are the functions exposed to the user in the Bonding Event contract. This contract can be used to retrieve details about the bonding event and Uniswap liquidity pool.

**SEURO_ADDRESS()**

**OTHER_ADDRESS()**

*Description*: the addresses of the two ERC20 tokens involved in the bonding event

**getOtherAmount(uint256 _amountSEuro)**

*Description*: calculates how much of the other token is required in order to bond with the given amount of sEURO

*Input*: amount of sEURO to bond

*Output*: required amount of other token

### Bond Storage Public APIs

These are the functions exposed to the user in the Bond Storage contract. This contract can be used to retrieve data about the status of user's bond.

**getActiveBonds(address _user)**

*Description*: gets amount of active bonds for a user

**getUserBonds(address _user)**

*Description*: gets all bonds for user

**getBondAt(address _user, uint256 index)**

*Description*: gets a single bond for a user

**getProfit(address _user)**

*Description*: gets total profit for user's bonds

**getClaimAmount(address _user)**

*Description*: gets claimable amount of TST for user


### Contracts
The contracts used in this stage are:

- [BondingEvent.sol](../../contracts/BondingEvent.sol): exposes the bonding API and adds liquidity before bonding takes place
- [BondStorage.sol](../../contracts/BondStorage.sol): contains the logic of calculating the bond reward and other relevant data
- [StandardTokenGateway.sol](../../contracts/StandardTokenGateway.sol): contains the price data that determines the reward amount

### Relationship
The relationship between the contracts is:
1. **StandardTokenGateway** does not import any contract
2. **BondStorage** imports **StandardTokenGateway** to:
   * fetch the price of TST in EUR
   * get the remaining TST reward supply
   * decrease the TST reward supply
3. **BondingEvent** imports **BondStorage** to begin bonding
